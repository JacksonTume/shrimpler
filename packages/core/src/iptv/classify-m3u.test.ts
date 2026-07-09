// SPDX-License-Identifier: AGPL-3.0-or-later
// classifyM3U tests: the live/movie/series heuristics (path, extension, group)
// and SxxExx series folding. Plain Node, no I/O (§2.2).

import { describe, expect, it } from "vitest";
import { classifyM3U } from "./classify-m3u";
import type { Channel } from "./parse-m3u";

function entry(over: Partial<Channel> & { id: string; url: string }): Channel {
  return { name: over.id, ...over };
}

describe("classifyM3U", () => {
  it("treats .ts/.m3u8 and /live/ entries as live channels", () => {
    const content = classifyM3U([
      entry({ id: "a", url: "http://h/live/u/p/1.ts" }),
      entry({ id: "b", url: "http://h/2.m3u8" }),
    ]);
    expect(content.channels.map((c) => c.id)).toEqual(["a", "b"]);
    expect(content.movies).toEqual([]);
    expect(content.series).toEqual([]);
  });

  it("classifies a /movie/ path or VOD extension as a movie", () => {
    const content = classifyM3U([
      entry({ id: "m1", name: "Film One", url: "http://h/movie/u/p/9.mp4" }),
      entry({ id: "m2", name: "Film Two", url: "http://h/x/10.mkv" }),
    ]);
    expect(content.movies.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(content.channels).toEqual([]);
  });

  it("uses group-title keywords when path/extension are ambiguous", () => {
    const content = classifyM3U([
      entry({
        id: "v",
        name: "Some Film",
        url: "http://h/9",
        group: "VOD | HD",
      }),
    ]);
    expect(content.movies.map((m) => m.id)).toEqual(["v"]);
  });

  it("folds SxxExx episodes into a series", () => {
    const content = classifyM3U([
      entry({ id: "e1", name: "The Show S01E01 Pilot", url: "http://h/1.mkv" }),
      entry({ id: "e2", name: "The Show S01E02", url: "http://h/2.mkv" }),
      entry({
        id: "e3",
        name: "The Show S02E01 Return",
        url: "http://h/3.mkv",
      }),
    ]);
    expect(content.series).toHaveLength(1);
    const show = content.series[0]!;
    expect(show.name).toBe("The Show");
    expect(show.episodes?.map((e) => [e.season, e.episode, e.name])).toEqual([
      [1, 1, "Pilot"],
      [1, 2, undefined],
      [2, 1, "Return"],
    ]);
  });

  it("recognizes NxM and Season/Episode markers", () => {
    const content = classifyM3U([
      entry({ id: "e1", name: "Show 1x05", url: "http://h/1.mkv" }),
      entry({
        id: "e2",
        name: "Show Season 2 Episode 3",
        url: "http://h/2.mkv",
      }),
    ]);
    expect(content.series).toHaveLength(1);
    expect(
      content.series[0]!.episodes?.map((e) => [e.season, e.episode]),
    ).toEqual([
      [1, 5],
      [2, 3],
    ]);
  });

  it("falls back to a movie for VOD without a parsable episode marker", () => {
    const content = classifyM3U([
      entry({ id: "s", name: "A Show", url: "http://h/series/u/p/7.mkv" }),
    ]);
    expect(content.movies.map((m) => m.id)).toEqual(["s"]);
    expect(content.series).toEqual([]);
  });

  it("carries headers onto classified movies and episodes", () => {
    const content = classifyM3U([
      entry({
        id: "m",
        name: "Film",
        url: "http://h/9.mp4",
        headers: { Referer: "http://r/" },
      }),
      entry({
        id: "e",
        name: "Show S01E01",
        url: "http://h/1.mkv",
        headers: { "User-Agent": "UA" },
      }),
    ]);
    expect(content.movies[0]?.headers).toEqual({ Referer: "http://r/" });
    expect(content.series[0]?.episodes?.[0]?.headers).toEqual({
      "User-Agent": "UA",
    });
  });
});
