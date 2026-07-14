// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.1 — web implementation of the PlayerAdapter contract, wrapping an
// HTMLVideoElement. The <video> element lives entirely here in the shell (core
// stays DOM-less, ADR-0001); the playback screen mounts `element` into the DOM.
//
// Implementation notes (from §7.1/§8.3):
// - Codec gap: <video> cannot play most HEVC/x265 and many MKV containers;
//   `behaviorHints.notWebReady` sources emit a non-fatal warning but are still
//   attempted (a native fallback on Tizen/webOS is Phase 3).
// - VOD debrid links are progressive MP4/MKV, which native <video> handles.
// - Live/IPTV: HLS (.m3u8) plays via hls.js (native on Safari), and raw
//   MPEG-TS/FLV via mpegts.js — both behind the StreamEngine seam (stream-engine
//   .ts), MSE-based, dynamically imported, chosen per-source by `engineFor`.
//   Recoverable stalls surface to core as 'reconnecting'.

import type {
  PlayableSource,
  PlayerAdapter,
  PlayerError,
  PlayerEventName,
  PlayerEventPayload,
  PlayerState,
  TrackInfo,
} from "@shrimpler/core";
import type { StreamEngine, StreamEngineFactory } from "./stream-engine";
import { createHlsEngine, hlsSupported } from "./hls-engine";
import { createMpegtsEngine, mpegtsSupported } from "./mpegts-engine";
import { proxyStreamUrl } from "./hls-proxy";

/** Buffered seconds ahead of (or covering) the current position; 0 if unknown. */
function bufferedAhead(video: HTMLVideoElement): number {
  let ranges: TimeRanges;
  try {
    ranges = video.buffered;
  } catch {
    return 0;
  }
  if (ranges.length === 0) {
    return 0;
  }
  for (let i = 0; i < ranges.length; i += 1) {
    if (
      ranges.start(i) <= video.currentTime &&
      video.currentTime <= ranges.end(i)
    ) {
      return ranges.end(i);
    }
  }
  return ranges.end(ranges.length - 1);
}

/** Map the element's MediaError to the contract's PlayerError (always fatal). */
function mapError(video: HTMLVideoElement): PlayerError {
  const err = video.error as MediaError | null | undefined;
  return {
    code:
      err === null || err === undefined
        ? "MEDIA_ERR_UNKNOWN"
        : `MEDIA_ERR_${err.code}`,
    message:
      err?.message !== undefined && err.message !== ""
        ? err.message
        : "Playback error",
    fatal: true,
  };
}

const IDLE_STATE: PlayerState = {
  status: "idle",
  positionSec: 0,
  durationSec: 0,
  bufferedSec: 0,
  audioTracks: [],
  subtitleTracks: [],
};

export class Html5VideoPlayerAdapter implements PlayerAdapter {
  private readonly video: HTMLVideoElement;
  private readonly listeners = new Map<
    PlayerEventName,
    Set<(payload: PlayerEventPayload) => void>
  >();
  private readonly domHandlers: Array<[string, EventListener]> = [];
  private state: PlayerState = { ...IDLE_STATE };
  private hasSource = false;
  /** Active MSE engine (hls.js or mpegts.js) for the current source, else null. */
  private engine: StreamEngine | null = null;
  private readonly hlsFactory: StreamEngineFactory;
  private readonly isHlsSupported: () => boolean;
  private readonly mpegtsFactory: StreamEngineFactory;
  private readonly isMpegtsSupported: () => boolean;

  constructor(deps?: {
    /** Injectable for tests (jsdom can't run MSE); default to the real engines. */
    hlsFactory?: StreamEngineFactory;
    hlsSupported?: () => boolean;
    mpegtsFactory?: StreamEngineFactory;
    mpegtsSupported?: () => boolean;
  }) {
    this.hlsFactory = deps?.hlsFactory ?? createHlsEngine;
    this.isHlsSupported = deps?.hlsSupported ?? hlsSupported;
    this.mpegtsFactory = deps?.mpegtsFactory ?? createMpegtsEngine;
    this.isMpegtsSupported = deps?.mpegtsSupported ?? mpegtsSupported;
    this.video = document.createElement("video");
    this.video.preload = "metadata";
    this.video.playsInline = true;
    this.attachDomHandlers();
  }

  /** The underlying element; the playback screen appends it to the DOM. */
  get element(): HTMLVideoElement {
    return this.video;
  }

  private on_(name: string, fn: EventListener): void {
    this.video.addEventListener(name, fn);
    this.domHandlers.push([name, fn]);
  }

  private attachDomHandlers(): void {
    this.on_("loadedmetadata", () => {
      this.syncTracks();
      this.syncStatus();
    });
    this.on_("durationchange", () => this.syncStatus());
    this.on_("play", () => this.syncStatus());
    this.on_("playing", () => this.syncStatus());
    this.on_("pause", () => this.syncStatus());
    this.on_("canplay", () => this.syncStatus());
    this.on_("waiting", () => this.emit("buffering", { status: "buffering" }));
    this.on_("timeupdate", () =>
      this.emit("timeupdate", {
        positionSec: this.video.currentTime,
        bufferedSec: bufferedAhead(this.video),
      }),
    );
    this.on_("progress", () =>
      this.emit("timeupdate", { bufferedSec: bufferedAhead(this.video) }),
    );
    this.on_("ended", () =>
      this.emit("ended", {
        status: "ended",
        positionSec: this.video.currentTime,
      }),
    );
    this.on_("error", () =>
      this.emit("error", { status: "error", error: mapError(this.video) }),
    );
  }

  private statusFromVideo(): PlayerState["status"] {
    if (!this.hasSource) {
      return "idle";
    }
    if (this.video.error !== null && this.video.error !== undefined) {
      return "error";
    }
    if (this.video.ended) {
      return "ended";
    }
    if (this.video.paused) {
      return "paused";
    }
    // HAVE_FUTURE_DATA (3) or better means it can play through the current frame.
    return this.video.readyState < 3 ? "buffering" : "playing";
  }

  private durationOf(): number {
    return Number.isFinite(this.video.duration)
      ? this.video.duration
      : this.state.durationSec;
  }

  private syncStatus(): void {
    this.emit("statuschange", {
      status: this.statusFromVideo(),
      positionSec: this.video.currentTime,
      durationSec: this.durationOf(),
      bufferedSec: bufferedAhead(this.video),
    });
  }

  private syncTracks(): void {
    const subtitleTracks: TrackInfo[] = [];
    const tracks = this.video.textTracks;
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i]!;
      if (track.kind === "subtitles" || track.kind === "captions") {
        subtitleTracks.push({
          id: track.id !== "" ? track.id : String(i),
          label:
            track.label !== ""
              ? track.label
              : track.language !== ""
                ? track.language
                : `Subtitle ${i + 1}`,
          lang: track.language !== "" ? track.language : undefined,
        });
      }
    }
    // Audio-track enumeration/selection needs the non-standard AudioTrackList;
    // v1 leaves it empty (single-track progressive files are the norm) — a
    // no-op selectAudioTrack is contract-legal.
    this.emit("tracks", { subtitleTracks, audioTracks: [] });
  }

  private emit(event: PlayerEventName, payload: PlayerEventPayload = {}): void {
    // Merge the stateful fields so getState() reflects the latest event.
    this.state = { ...this.state, ...payload };
    const subs = this.listeners.get(event);
    if (subs !== undefined) {
      for (const cb of subs) {
        cb(payload);
      }
    }
  }

  /**
   * Pick the playback path for a source:
   * - `hls`    — .m3u8, unless the browser plays HLS natively (Safari/iOS).
   * - `mpegts` — raw MPEG-TS/FLV (.ts/.flv), or a kind:'live' source with no VOD
   *   extension (Xtream live is .m3u8 and caught above; M3U live is often .ts).
   * - `native` — progressive files, or HLS on browsers with native support.
   */
  private engineFor(source: PlayableSource): "hls" | "mpegts" | "native" {
    const url = source.url ?? "";
    // HLS: prefer hls.js wherever MSE runs (Chrome/Firefox/Edge/desktop Safari) —
    // it is more robust and, unlike native <video>, reports *why* a load fails.
    // Native HLS is the fallback only where hls.js can't run (older iOS Safari,
    // where native <video> plays HLS and needs no CORS).
    if (/\.m3u8(\?|#|$)/i.test(url)) {
      // hls.js when MSE runs; otherwise native <video> (iOS Safari plays HLS).
      return this.isHlsSupported() ? "hls" : "native";
    }
    const tsLike =
      /\.(ts|flv|m2ts|mts)(\?|#|$)/i.test(url) || source.kind === "live";
    return tsLike && this.isMpegtsSupported() ? "mpegts" : "native";
  }

  private destroyEngine(): void {
    if (this.engine !== null) {
      this.engine.destroy();
      this.engine = null;
    }
  }

  load(source: PlayableSource): Promise<void> {
    if (source.url === undefined) {
      return Promise.reject(
        new Error("Html5VideoPlayerAdapter.load: source has no resolved url"),
      );
    }
    const url = source.url;
    // A prior MSE engine must be torn down before a new source loads.
    this.destroyEngine();

    return new Promise<void>((resolve, reject) => {
      if (source.behaviorHints?.notWebReady === true) {
        // Non-fatal: attempt playback but let the UI warn (§8.3 codec gap).
        this.emit("error", {
          error: {
            code: "NOT_WEB_READY",
            message: "This source may not play in the browser.",
            fatal: false,
          },
        });
      }

      this.hasSource = true;
      this.emit("statuschange", { status: "loading" });

      const engineKind = this.engineFor(source);
      if (import.meta.env.DEV) {
        console.info("[player] load", {
          engine: engineKind,
          kind: source.kind,
          url,
          hlsSupported: this.isHlsSupported(),
          mpegtsSupported: this.isMpegtsSupported(),
        });
      }
      if (engineKind !== "native") {
        // The engine drives the same <video> element, so the DOM handlers
        // attached in the constructor (timeupdate/ended/…) keep working; only
        // load lifecycle + reconnect come through the engine callbacks.
        // hls.js/mpegts.js fetch via XHR, so IPTV's missing CORS headers block
        // them; in dev, route through the local proxy (native <video> below is
        // CORS-exempt and needs no proxy). See hls-proxy.ts.
        const engineUrl = import.meta.env.DEV ? proxyStreamUrl(url) : url;
        const factory =
          engineKind === "hls" ? this.hlsFactory : this.mpegtsFactory;
        const fatalCode = engineKind === "hls" ? "HLS_FATAL" : "MPEGTS_FATAL";
        this.engine = factory({
          headers: source.headers,
          isLive: source.kind === "live",
        });
        this.engine.load(engineUrl, this.video, {
          onManifestParsed: () => {
            this.syncStatus();
            resolve();
          },
          onReconnecting: () =>
            this.emit("reconnecting", { status: "buffering" }),
          onFatalError: (message) => {
            this.emit("error", {
              status: "error",
              error: { code: fatalCode, message, fatal: true },
            });
            reject(new Error(`Html5VideoPlayerAdapter.load: ${message}`));
          },
        });
        return;
      }

      // Native path: progressive files, or HLS on browsers with native support.
      const onLoaded = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error("Html5VideoPlayerAdapter.load: media error"));
      };
      const cleanup = (): void => {
        this.video.removeEventListener("loadedmetadata", onLoaded);
        this.video.removeEventListener("error", onError);
      };
      this.video.addEventListener("loadedmetadata", onLoaded);
      this.video.addEventListener("error", onError);
      this.video.src = url;
      this.video.load();
    });
  }

  play(): void {
    void this.video.play().catch(() => {
      // Autoplay policy blocked an unmuted start — common for live, which begins
      // playing without a fresh user gesture. Retry muted (always permitted) so
      // the picture appears (and mpegts.js's stall-jumper can seek to the live
      // edge); the UI can then offer an unmute control.
      this.video.muted = true;
      void this.video.play().catch(() => {
        // Still blocked — the on-screen Play button (a direct gesture) starts it.
      });
    });
  }

  pause(): void {
    this.video.pause();
  }

  seek(positionSec: number): void {
    this.video.currentTime = positionSec;
  }

  stop(): void {
    this.destroyEngine();
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.hasSource = false;
    this.emit("statuschange", { status: "idle", positionSec: 0 });
  }

  selectSubtitle(trackId: string | null): void {
    const tracks = this.video.textTracks;
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i]!;
      const id = track.id !== "" ? track.id : String(i);
      track.mode = trackId !== null && id === trackId ? "showing" : "disabled";
    }
    this.emit("tracks", { activeSubtitleTrackId: trackId });
  }

  selectAudioTrack(_trackId: string): void {
    // No-op in v1 (see syncTracks) — contract-legal.
  }

  setPlaybackRate(rate: number): void {
    this.video.playbackRate = rate;
  }

  getState(): PlayerState {
    return {
      ...this.state,
      status: this.statusFromVideo(),
      positionSec: this.video.currentTime,
      durationSec: this.durationOf(),
      bufferedSec: bufferedAhead(this.video),
    };
  }

  on(
    event: PlayerEventName,
    cb: (payload: PlayerEventPayload) => void,
  ): () => void {
    let subs = this.listeners.get(event);
    if (subs === undefined) {
      subs = new Set();
      this.listeners.set(event, subs);
    }
    subs.add(cb);
    return () => {
      this.listeners.get(event)?.delete(cb);
    };
  }

  destroy(): void {
    this.destroyEngine();
    for (const [name, fn] of this.domHandlers) {
      this.video.removeEventListener(name, fn);
    }
    this.domHandlers.length = 0;
    this.listeners.clear();
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.hasSource = false;
  }
}
