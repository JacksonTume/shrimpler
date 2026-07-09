// SPDX-License-Identifier: AGPL-3.0-or-later
// parseM3U tests: attribute parsing, header directives, id stability, and the
// lenient drop-what-you-can't-use behavior. Plain Node, no I/O (§2.2).

import { describe, expect, it } from "vitest";
import { parseM3U } from "./parse-m3u";

describe("parseM3U", () => {
  it("parses EXTINF attributes and the display name after the last comma", () => {
    const text = [
      "#EXTM3U",
      '#EXTINF:-1 tvg-id="chan.one" tvg-name="One" tvg-logo="http://l/1.png" group-title="News",Channel One HD',
      "http://host/1.m3u8",
    ].join("\n");

    const channels = parseM3U(text);
    expect(channels).toEqual([
      {
        id: "chan.one",
        name: "Channel One HD",
        url: "http://host/1.m3u8",
        logo: "http://l/1.png",
        group: "News",
        tvgId: "chan.one",
      },
    ]);
  });

  it("absorbs #EXTVLCOPT and #EXTHTTP header directives into headers", () => {
    const text = [
      "#EXTINF:-1,With Headers",
      "#EXTVLCOPT:http-user-agent=MyAgent/1.0",
      "#EXTVLCOPT:http-referrer=http://ref.example/",
      '#EXTHTTP:{"Cookie":"a=b"}',
      "http://host/s.ts",
    ].join("\n");

    const [channel] = parseM3U(text);
    expect(channel?.headers).toEqual({
      "User-Agent": "MyAgent/1.0",
      Referer: "http://ref.example/",
      Cookie: "a=b",
    });
  });

  it("falls back to #EXTGRP for the group when group-title is absent", () => {
    const text = [
      "#EXTINF:-1,No Group Attr",
      "#EXTGRP:Sports",
      "http://host/s.ts",
    ].join("\n");
    expect(parseM3U(text)[0]?.group).toBe("Sports");
  });

  it("derives a stable id from the url when tvg-id is missing", () => {
    const a = parseM3U("#EXTINF:-1,A\nhttp://host/a.ts");
    const b = parseM3U("#EXTINF:-1,A\nhttp://host/a.ts");
    // Same URL → same deterministic id across runs; colon-free.
    expect(a[0]?.id).toBe(b[0]?.id);
    expect(a[0]?.id).not.toContain(":");
    expect(a[0]?.id).not.toBe("");
  });

  it("sanitizes colons/whitespace out of a tvg-id", () => {
    const text = '#EXTINF:-1 tvg-id="a:b c",X\nhttp://h/x.ts';
    expect(parseM3U(text)[0]?.id).toBe("a-b-c");
  });

  it("de-duplicates colliding ids with numeric suffixes", () => {
    const text = [
      '#EXTINF:-1 tvg-id="dup",First',
      "http://h/1.ts",
      '#EXTINF:-1 tvg-id="dup",Second',
      "http://h/2.ts",
    ].join("\n");
    expect(parseM3U(text).map((c) => c.id)).toEqual(["dup", "dup-2"]);
  });

  it("drops an #EXTINF with no following URL", () => {
    const text = [
      '#EXTINF:-1 tvg-id="a",A',
      '#EXTINF:-1 tvg-id="b",B',
      "http://h/b.ts",
    ].join("\n");
    // The first entry never got a URL, so only B survives.
    expect(parseM3U(text).map((c) => c.id)).toEqual(["b"]);
  });

  it("falls back to tvg-name when there is no display name", () => {
    const text = '#EXTINF:-1 tvg-id="c" tvg-name="Named",\nhttp://h/c.ts';
    expect(parseM3U(text)[0]?.name).toBe("Named");
  });

  it("returns [] for empty or header-only input", () => {
    expect(parseM3U("")).toEqual([]);
    expect(parseM3U("#EXTM3U\n")).toEqual([]);
  });
});
