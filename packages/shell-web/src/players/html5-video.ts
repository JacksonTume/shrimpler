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
//   HLS is only used where the browser supports it natively (Safari); hls.js is
//   deferred to the live/IPTV work (Phase 2), and slots in behind this adapter.
// - kind:'live' reconnect logic would live HERE (core only observes
//   'reconnecting'); v1 is VOD-only, so it is not implemented yet.

import type {
  PlayableSource,
  PlayerAdapter,
  PlayerError,
  PlayerEventName,
  PlayerEventPayload,
  PlayerState,
  TrackInfo,
} from "@shrimpler/core";

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
    if (ranges.start(i) <= video.currentTime && video.currentTime <= ranges.end(i)) {
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

  constructor() {
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
    this.on_("waiting", () =>
      this.emit("buffering", { status: "buffering" }),
    );
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
      this.emit("ended", { status: "ended", positionSec: this.video.currentTime }),
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

  load(source: PlayableSource): Promise<void> {
    if (source.url === undefined) {
      return Promise.reject(
        new Error("Html5VideoPlayerAdapter.load: source has no resolved url"),
      );
    }
    return new Promise<void>((resolve, reject) => {
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
      this.video.src = source.url as string;
      this.video.load();
    });
  }

  play(): void {
    void this.video.play().catch(() => {
      // Autoplay rejection (e.g. gesture policy) — the UI can offer a play button.
    });
  }

  pause(): void {
    this.video.pause();
  }

  seek(positionSec: number): void {
    this.video.currentTime = positionSec;
  }

  stop(): void {
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
