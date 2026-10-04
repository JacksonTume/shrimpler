// SPDX-License-Identifier: AGPL-3.0-or-later
// The small engine seam behind Html5VideoPlayerAdapter. A "stream engine" drives
// the same <video> element for container/transport formats a bare <video> can't
// play outside Safari: HLS (.m3u8 → hls.js) and raw MPEG-TS/FLV (.ts/.flv →
// mpegts.js), both over Media Source Extensions. The adapter depends only on this
// interface, so jsdom tests inject a fake and never load an MSE library, and the
// real engines are dynamically imported (own chunks) only when a matching source
// plays. Lifecycle + recoverable-error signalling come through the callbacks;
// timeupdate/ended/etc. keep flowing from the adapter's own <video> listeners.

export interface StreamEngineCallbacks {
  /** The media is ready (manifest/media-info parsed) — resolve the load. */
  onManifestParsed(): void;
  /** A recoverable error; the engine is retrying (maps to `reconnecting`). */
  onReconnecting(): void;
  /** An unrecoverable error; the load has failed. */
  onFatalError(message: string): void;
}

export interface StreamEngine {
  /** Attach to the element, load the url, and report lifecycle via callbacks. */
  load(
    url: string,
    video: HTMLVideoElement,
    callbacks: StreamEngineCallbacks,
  ): void;
  destroy(): void;
}

export interface StreamEngineOptions {
  /** Required request headers (some IPTV CDNs); applied best-effort per engine. */
  headers?: Record<string, string>;
  /** True for live streams (no fixed duration) — engines tune buffering/latency. */
  isLive?: boolean;
}

export type StreamEngineFactory = (
  options: StreamEngineOptions,
) => StreamEngine;
