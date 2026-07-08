// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { parseId } from "./parse-id";

describe("parseId", () => {
  it("parses a movie IMDb id", () => {
    expect(parseId("tt1234567")).toEqual({
      raw: "tt1234567",
      imdbId: "tt1234567",
    });
  });

  it("parses an episode IMDb id into season/episode", () => {
    expect(parseId("tt1234567:1:5")).toEqual({
      raw: "tt1234567:1:5",
      imdbId: "tt1234567",
      season: 1,
      episode: 5,
    });
  });

  it("treats a non-IMDb prefix as a namespace with no imdbId", () => {
    expect(parseId("kitsu:12345")).toEqual({
      raw: "kitsu:12345",
      namespace: "kitsu",
    });
  });

  it("parses season/episode on a namespaced id too", () => {
    expect(parseId("kitsu:12345:2:3")).toEqual({
      raw: "kitsu:12345:2:3",
      namespace: "kitsu",
      season: 2,
      episode: 3,
    });
  });

  it("passes an unknown bare id through untouched (no imdbId, no namespace)", () => {
    expect(parseId("12345")).toEqual({ raw: "12345" });
  });
});
