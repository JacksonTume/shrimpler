// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for the dev CORS-proxy helpers: URL wrapping and HLS playlist
// rewriting (relative + cross-host segments, URI="…" tags, passthrough lines).

import { describe, expect, it } from "vitest";
import {
  IPTV_PROXY_PREFIX,
  proxyStreamUrl,
  rewriteHlsPlaylist,
} from "./hls-proxy";

describe("proxyStreamUrl", () => {
  it("wraps an absolute url as a same-origin proxy path", () => {
    expect(proxyStreamUrl("http://h/live/1.m3u8")).toBe(
      `${IPTV_PROXY_PREFIX}?url=${encodeURIComponent("http://h/live/1.m3u8")}`,
    );
  });
});

describe("rewriteHlsPlaylist", () => {
  const base = "http://292910.xyz/live/u/p/2006160.m3u8";

  it("rewrites relative and cross-host segment URIs, resolved against the base", () => {
    const body = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXTINF:6.0,",
      "seg1.ts",
      "#EXTINF:6.0,",
      "http://video1.c2.wdcdn8s.com/video/black.ts",
      "",
    ].join("\n");

    const out = rewriteHlsPlaylist(body, base).split("\n");
    // Directive/comment lines are untouched.
    expect(out[0]).toBe("#EXTM3U");
    expect(out[2]).toBe("#EXTINF:6.0,");
    // Relative segment resolves against the playlist url.
    expect(out[3]).toBe(proxyStreamUrl("http://292910.xyz/live/u/p/seg1.ts"));
    // Absolute cross-host CDN segment is proxied verbatim.
    expect(out[5]).toBe(
      proxyStreamUrl("http://video1.c2.wdcdn8s.com/video/black.ts"),
    );
    // Blank line preserved.
    expect(out[6]).toBe("");
  });

  it('rewrites URI="…" attributes on key/map/media tags', () => {
    const body = [
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
      '#EXT-X-MAP:URI="http://cdn/init.mp4"',
    ].join("\n");

    const out = rewriteHlsPlaylist(body, base).split("\n");
    expect(out[0]).toContain(
      `URI="${proxyStreamUrl("http://292910.xyz/live/u/p/key.bin")}"`,
    );
    expect(out[0]).toContain("METHOD=AES-128");
    expect(out[1]).toBe(
      `#EXT-X-MAP:URI="${proxyStreamUrl("http://cdn/init.mp4")}"`,
    );
  });
});
