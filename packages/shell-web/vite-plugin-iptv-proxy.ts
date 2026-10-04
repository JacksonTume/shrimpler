// SPDX-License-Identifier: AGPL-3.0-or-later
// Dev-only Vite middleware that proxies IPTV manifests/segments to dodge the
// browser CORS wall (see src/players/hls-proxy.ts for the rationale). It fetches
// upstream server-side — where CORS doesn't apply — adds a permissive ACAO header,
// spoofs a player User-Agent (many panels reject non-player UAs), and rewrites
// HLS playlists so every URI (incl. cross-host CDN segments) routes back through
// it. Registered only for `serve`, so it never affects production builds.

import { Readable, pipeline } from "node:stream";
import type { Plugin } from "vite";
import { IPTV_PROXY_PREFIX, rewriteHlsPlaylist } from "./src/players/hls-proxy.ts";

const M3U8_RE = /\.m3u8(\?|#|$)/i;
const PASS_THROUGH_HEADERS = [
  "content-type",
  "content-length",
  "accept-ranges",
  "content-range",
];

export function iptvProxyPlugin(): Plugin {
  return {
    name: "iptv-cors-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(IPTV_PROXY_PREFIX, async (req, res) => {
        try {
          const full = req.originalUrl ?? req.url ?? "";
          const target = new URL(full, "http://localhost").searchParams.get(
            "url",
          );
          if (target === null) {
            res.statusCode = 400;
            res.end("missing ?url=");
            return;
          }

          // Abort the upstream when the client navigates away, so a live stream
          // doesn't hold a connection open — IPTV lines cap concurrent
          // connections and a leak makes the panel serve a black placeholder.
          const controller = new AbortController();
          req.on("close", () => controller.abort());

          const range = req.headers.range;
          const upstream = await fetch(target, {
            headers: {
              "user-agent": "VLC/3.0.20 LibVLC/3.0.20",
              ...(range !== undefined ? { range } : {}),
            },
            signal: controller.signal,
          });

          res.setHeader("access-control-allow-origin", "*");
          const contentType = upstream.headers.get("content-type") ?? "";

          // Playlists must be rewritten so their (often cross-host) segment URLs
          // come back through the proxy too.
          if (M3U8_RE.test(target) || /mpegurl/i.test(contentType)) {
            const text = await upstream.text();
            res.setHeader("content-type", "application/vnd.apple.mpegurl");
            res.end(rewriteHlsPlaylist(text, target));
            return;
          }

          res.statusCode = upstream.status;
          for (const header of PASS_THROUGH_HEADERS) {
            const value = upstream.headers.get(header);
            if (value !== null) {
              res.setHeader(header, value);
            }
          }
          if (upstream.body !== null) {
            // pipeline() centralizes teardown + error handling: a client abort
            // (navigated away) makes the fetch body emit AbortError, and writing
            // to a gone socket emits EPIPE — the callback swallows both so they
            // never surface as an *unhandled* 'error' that crashes the dev server.
            pipeline(Readable.fromWeb(upstream.body), res, () => {
              /* aborted / EPIPE / upstream-ended — nothing to do */
            });
          } else {
            res.end();
          }
        } catch (error) {
          // A client-abort (navigated away) is expected — don't treat it as an
          // error, and never write after the response has started streaming.
          const aborted = error instanceof Error && error.name === "AbortError";
          if (!aborted && !res.headersSent && !res.writableEnded) {
            res.statusCode = 502;
            res.end(`iptv proxy error: ${String(error)}`);
          }
        }
      });
    },
  };
}
