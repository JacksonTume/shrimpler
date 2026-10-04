// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.1 / §8 — mpegts.js seam behind Html5VideoPlayerAdapter, the MPEG-TS/FLV
// counterpart to hls-engine.ts. Most IPTV *live* channels from M3U playlists are
// raw MPEG-TS (a `.ts` URL, or extensionless), which a bare <video> can't decode;
// mpegts.js remuxes TS→fMP4 and feeds it through Media Source Extensions. Like
// hls.js it's ~0.5 MB and needed only when such a stream plays, so it is
// **dynamically imported** into its own Vite chunk — VOD/HLS sessions never fetch
// it. Recoverable errors surface as the contract's `reconnecting`.
//
// Header note: mpegts.js's MediaDataSource exposes only cors/withCredentials, not
// arbitrary request headers — and browsers forbid setting User-Agent/Referer
// anyway (the same web-only gap hls-engine documents; the RN shell honors them).

import type {
  StreamEngine,
  StreamEngineFactory,
  StreamEngineOptions,
} from "./stream-engine";

/** Type of mpegts.js's default export (the factory namespace), type-only. */
type MpegtsModule = typeof import("mpegts.js").default;
type MpegtsPlayer = ReturnType<MpegtsModule["createPlayer"]>;

export type MpegtsFactory = StreamEngineFactory;

/** FLV vs MPEG-TS by extension; TS is the default for extensionless live. */
function mediaType(url: string): "flv" | "mpegts" {
  return /\.flv(\?|#|$)/i.test(url) ? "flv" : "mpegts";
}

/** Real mpegts.js-backed engine. Wrapped so the adapter stays mpegts.js-agnostic. */
export function createMpegtsEngine(options: StreamEngineOptions): StreamEngine {
  const isLive = options.isLive ?? true;
  let player: MpegtsPlayer | null = null;
  let destroyed = false;

  return {
    load(url, video, callbacks): void {
      // Fetch the mpegts.js chunk lazily; HLS/VOD-only sessions never trigger this.
      void import("mpegts.js")
        .then(({ default: mpegts }) => {
          if (destroyed) {
            return; // stop()/destroy() raced ahead of the import
          }
          player = mpegts.createPlayer(
            { type: mediaType(url), isLive, url, cors: true },
            {
              // Realtime for live (drop the stash buffer); chase HTMLMediaElement
              // latency so a channel stays near the live edge.
              enableStashBuffer: !isLive,
              liveBufferLatencyChasing: isLive,
            },
          );
          player.on(mpegts.Events.MEDIA_INFO, () =>
            callbacks.onManifestParsed(),
          );
          player.on(
            mpegts.Events.ERROR,
            (type: string, detail: string, info?: unknown) => {
              if (destroyed || player === null) {
                return;
              }
              if (import.meta.env.DEV) {
                console.warn("[mpegts] error", { type, detail, info, url });
              }
              // Network errors are often transient on live — signal a reconnect
              // (mpegts.js retries internally). A media/codec error (e.g. HEVC
              // that MSE can't decode) won't self-heal, so it is fatal with its
              // detail so the cause is visible rather than a generic message.
              if (type === mpegts.ErrorTypes.NETWORK_ERROR) {
                callbacks.onReconnecting();
              } else {
                callbacks.onFatalError(`${type}: ${detail}`);
              }
            },
          );
          player.attachMediaElement(video);
          player.load();
        })
        .catch(() =>
          callbacks.onFatalError("Failed to load the MPEG-TS engine"),
        );
    },
    destroy(): void {
      destroyed = true;
      if (player !== null) {
        try {
          player.pause();
          player.unload();
          player.detachMediaElement();
          player.destroy();
        } catch {
          // Best-effort teardown — a partially-initialized player may throw.
        }
        player = null;
      }
    },
  };
}

/**
 * Whether MPEG-TS can be driven by mpegts.js here. Mirrors the MSE gate without
 * importing mpegts.js, so the adapter's path decision stays synchronous and the
 * chunk loads only on demand (same approach as hlsSupported).
 */
export function mpegtsSupported(): boolean {
  if (typeof MediaSource === "undefined") {
    return false;
  }
  return MediaSource.isTypeSupported(
    'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
  );
}
