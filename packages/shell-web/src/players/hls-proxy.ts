// SPDX-License-Identifier: AGPL-3.0-or-later
// Dev-only IPTV CORS proxy helpers. IPTV manifest/segment hosts almost never send
// `Access-Control-Allow-Origin`, so hls.js/mpegts.js (which fetch via XHR/fetch)
// are blocked by the browser — even though the server returns the bytes. The Vite
// dev middleware (../../vite-plugin-iptv-proxy.ts) fetches upstream server-side
// (Node has no CORS) and rewrites playlists so every URI routes back through it.
//
// This is a DEV-ONLY convenience for testing web live playback. Production web
// needs a deployed proxy; the RN shell (Phase 2) has no CORS wall at all. Native
// <video> playback (progressive VOD) is exempt from CORS and never proxied.

/** Dev-server path that proxies an arbitrary upstream media URL, same-origin. */
export const IPTV_PROXY_PREFIX = "/__iptv";

/** Route a stream URL through the local dev proxy (same-origin ⇒ no CORS). */
export function proxyStreamUrl(url: string): string {
  return `${IPTV_PROXY_PREFIX}?url=${encodeURIComponent(url)}`;
}

/**
 * Rewrite every URI in an HLS playlist to go back through the proxy — resolved to
 * absolute against the playlist's own URL, so relative segments and cross-host
 * CDN segments alike become same-origin. Tag lines keep their `URI="…"` rewritten
 * (EXT-X-KEY / EXT-X-MAP / EXT-X-MEDIA); comment/directive lines pass through.
 */
export function rewriteHlsPlaylist(body: string, playlistUrl: string): string {
  const proxied = (uri: string): string => {
    try {
      return proxyStreamUrl(new URL(uri, playlistUrl).href);
    } catch {
      return uri; // leave anything unparseable untouched
    }
  };
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "") {
        return line;
      }
      if (trimmed.startsWith("#")) {
        return line.replace(
          /URI="([^"]*)"/g,
          (_m, uri: string) => `URI="${proxied(uri)}"`,
        );
      }
      return proxied(trimmed);
    })
    .join("\n");
}
