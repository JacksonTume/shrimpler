// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { PlayableSource } from "../types/sources";
import { parseResolution, rankStreams } from "./stream-rank";

function source(
  partial: Partial<PlayableSource> & { id: string },
): PlayableSource {
  return { kind: "vod", ...partial };
}

describe("parseResolution", () => {
  it("prefers the quality field, falls back to title text", () => {
    expect(parseResolution(source({ id: "a", quality: "2160p" }))).toBe(2160);
    expect(parseResolution(source({ id: "b", title: "Movie 4K HDR" }))).toBe(
      2160,
    );
    expect(
      parseResolution(source({ id: "c", title: "Movie.1080p.BluRay" })),
    ).toBe(1080);
    expect(parseResolution(source({ id: "d", title: "720p WEB-DL" }))).toBe(
      720,
    );
    expect(parseResolution(source({ id: "e", title: "UHD remux" }))).toBe(2160);
    expect(parseResolution(source({ id: "f", title: "no hints here" }))).toBe(
      0,
    );
    expect(parseResolution(source({ id: "g" }))).toBe(0);
  });
});

describe("rankStreams (ADR-0004)", () => {
  it("orders by resolution, then cached, then seeders, keeping ties stable", () => {
    const ranked = rankStreams([
      source({ id: "sd", title: "480p" }),
      source({
        id: "hd-uncached",
        title: "1080p",
        cached: false,
        seeders: 500,
      }),
      source({ id: "hd-cached-few", title: "1080p", cached: true, seeders: 5 }),
      source({
        id: "hd-cached-many",
        title: "1080p",
        cached: true,
        seeders: 50,
      }),
      source({ id: "uhd", title: "2160p", seeders: 1 }),
      source({ id: "unknown-a" }),
      source({ id: "unknown-b" }),
    ]);
    expect(ranked.map((s) => s.id)).toEqual([
      "uhd",
      "hd-cached-many",
      "hd-cached-few",
      "hd-uncached",
      "sd",
      "unknown-a", // ties keep install order
      "unknown-b",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [source({ id: "a" }), source({ id: "b", title: "1080p" })];
    const copy = [...input];
    rankStreams(input);
    expect(input).toEqual(copy);
  });
});
