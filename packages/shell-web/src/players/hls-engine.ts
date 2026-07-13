// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.1 / §8 — hls.js seam behind Html5VideoPlayerAdapter. HLS (.m3u8) live
// streams can't play through a bare <video> outside Safari, so we drive them with
// hls.js. This module is the only place hls.js is referenced: the adapter depends
// on the small HlsEngine interface, so jsdom tests inject a fake and never load
// MSE. hls.js is ~0.5 MB, needed only when a live stream plays, so it is
// **dynamically imported** on first load — Vite code-splits it into its own chunk
// and VOD-only sessions never fetch it. Request headers (some IPTV CDNs require
// User-Agent/Referer) are applied best-effort — browsers block "forbidden"
// headers, a known web-only gap (RN honors them). Recoverable errors surface as
// the contract's `reconnecting`.

import type {
  StreamEngine,
  StreamEngineCallbacks,
  StreamEngineFactory,
  StreamEngineOptions,
} from "./stream-engine";

/** Instance type of hls.js, referenced type-only so hls.js stays out of the bundle. */
type HlsInstance = InstanceType<typeof import("hls.js").default>;

// Back-compat aliases: HLS is one implementation of the generic stream engine.
export type HlsCallbacks = StreamEngineCallbacks;
export type HlsEngine = StreamEngine;
export type HlsEngineOptions = StreamEngineOptions;
export type HlsFactory = StreamEngineFactory;

/** Real hls.js-backed engine. Wrapped so the adapter stays hls.js-agnostic. */
export function createHlsEngine(options: HlsEngineOptions): HlsEngine {
  const { headers } = options;
  let hls: HlsInstance | null = null;
  let destroyed = false;

  return {
    load(url, video, callbacks): void {
      // Fetch the hls.js chunk lazily; a VOD-only session never triggers this.
      void import("hls.js")
        .then(({ default: Hls }) => {
          if (destroyed) {
            return; // stop()/destroy() raced ahead of the import
          }
          hls = new Hls({
            // Live streams have no fixed duration; report it as Infinity so the
            // duration-driven seek/continue-watching logic treats them as live.
            liveDurationInfinity: true,
            xhrSetup:
              headers !== undefined
                ? (xhr: XMLHttpRequest) => {
                    for (const [key, value] of Object.entries(headers)) {
                      try {
                        xhr.setRequestHeader(key, value);
                      } catch {
                        // Browser-forbidden header (User-Agent/Referer) — RN honors it.
                      }
                    }
                  }
                : undefined,
          });
          hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(url));
          hls.on(Hls.Events.MANIFEST_PARSED, () =>
            callbacks.onManifestParsed(),
          );
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (import.meta.env.DEV && data.fatal) {
              console.warn("[hls] fatal error", {
                type: data.type,
                details: data.details,
                url,
              });
            }
            if (!data.fatal) {
              return; // hls.js self-recovers from non-fatal errors
            }
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              callbacks.onReconnecting();
              hls?.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              callbacks.onReconnecting();
              hls?.recoverMediaError();
            } else {
              callbacks.onFatalError(String(data.details));
            }
          });
          hls.attachMedia(video);
        })
        .catch(() => callbacks.onFatalError("Failed to load the HLS engine"));
    },
    destroy(): void {
      destroyed = true;
      hls?.destroy();
      hls = null;
    },
  };
}

/**
 * Whether HLS can be driven by hls.js in this browser. Mirrors hls.js's own
 * Media Source Extensions gate, but without importing hls.js — so the adapter's
 * path decision stays synchronous and the hls.js chunk loads only on demand.
 */
export function hlsSupported(): boolean {
  if (typeof MediaSource === "undefined") {
    return false;
  }
  return MediaSource.isTypeSupported(
    'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
  );
}
