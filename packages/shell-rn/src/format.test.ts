// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { EpisodeRef, ProgressEntry } from "@shrimpler/core";
import { episodeTag, formatTime, progressFraction, seasonsOf } from "./format";

function entry(over?: Partial<ProgressEntry>): ProgressEntry {
  return {
    id: "tt1",
    playableId: "tt1",
    type: "movie",
    positionSec: 0,
    durationSec: 0,
    updatedAt: 0,
    ...over,
  };
}

function episode(season: number, number: number): EpisodeRef {
  return { id: `tt1:${season}:${number}`, season, episode: number };
}

describe("formatTime", () => {
  it("renders m:ss under an hour and h:mm:ss at or above one", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9)).toBe("0:09");
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(3725)).toBe("1:02:05");
  });

  it("falls back to 0:00 for live/unknown durations", () => {
    // A live channel reports Infinity or 0; a fresh player reports NaN.
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe("0:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
    expect(formatTime(-5)).toBe("0:00");
  });
});

describe("progressFraction", () => {
  it("is the watched ratio, clamped to 0..1", () => {
    expect(progressFraction(entry({ positionSec: 30, durationSec: 120 }))).toBe(
      0.25,
    );
    expect(
      progressFraction(entry({ positionSec: 200, durationSec: 120 })),
    ).toBe(1);
  });

  it("is 0 when the duration is unknown (live, or not yet loaded)", () => {
    expect(progressFraction(entry({ positionSec: 30, durationSec: 0 }))).toBe(
      0,
    );
  });
});

describe("episodeTag", () => {
  it("tags a series entry and leaves a movie bare", () => {
    expect(episodeTag(entry({ season: 2, episode: 5 }))).toBe(" · S2E5");
    expect(episodeTag(entry())).toBe("");
  });
});

describe("seasonsOf", () => {
  it("returns the distinct seasons in ascending order", () => {
    const episodes = [
      episode(2, 1),
      episode(1, 2),
      episode(2, 2),
      episode(10, 1),
    ];
    expect(seasonsOf(episodes)).toEqual([1, 2, 10]);
  });

  it("is empty for a movie's (absent) episode list", () => {
    expect(seasonsOf([])).toEqual([]);
  });
});
