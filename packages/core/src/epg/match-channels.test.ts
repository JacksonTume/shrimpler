// SPDX-License-Identifier: AGPL-3.0-or-later
// matchChannels tests: exact tvg-id join, fuzzy display-name fallback (quality tags
// dropped), and unmatched channels omitted. Pure, plain Node (§2.2).

import { describe, expect, it } from "vitest";
import { matchChannels, normalizeName } from "./match-channels";
import type { EpgProgramme } from "./types";

const prog = (title: string): EpgProgramme => ({
  start: 1000,
  stop: 2000,
  title,
});

describe("normalizeName", () => {
  it("drops quality tags and non-alphanumerics", () => {
    expect(normalizeName("BBC One HD")).toBe(normalizeName("bbc one"));
    expect(normalizeName("Sky Sports FHD")).toBe("skysports");
    expect(normalizeName("ITV 4K")).toBe("itv");
  });
});

describe("matchChannels", () => {
  it("joins on tvg-id (case-insensitive)", () => {
    const result = matchChannels({
      iptvChannels: [{ id: "c1", name: "Channel 1", tvgId: "BBC.UK" }],
      xmltvChannels: [{ id: "bbc.uk", displayName: "BBC One" }],
      programmesByXmltvId: new Map([["bbc.uk", [prog("News")]]]),
    });
    expect(result).toEqual({ c1: [prog("News")] });
  });

  it("falls back to a fuzzy display-name match when tvg-id is absent", () => {
    const result = matchChannels({
      iptvChannels: [{ id: "c1", name: "BBC One HD" }],
      xmltvChannels: [{ id: "x", displayName: "BBC One" }],
      programmesByXmltvId: new Map([["x", [prog("News")]]]),
    });
    expect(result).toEqual({ c1: [prog("News")] });
  });

  it("prefers tvg-id over a conflicting name match", () => {
    const result = matchChannels({
      iptvChannels: [{ id: "c1", name: "BBC One", tvgId: "itv" }],
      xmltvChannels: [
        { id: "bbc", displayName: "BBC One" },
        { id: "itv", displayName: "ITV" },
      ],
      programmesByXmltvId: new Map([
        ["bbc", [prog("Bbc show")]],
        ["itv", [prog("Itv show")]],
      ]),
    });
    expect(result).toEqual({ c1: [prog("Itv show")] });
  });

  it("omits channels with no match and sorts programmes by start", () => {
    const early = { start: 100, stop: 200, title: "early" };
    const late = { start: 300, stop: 400, title: "late" };
    const result = matchChannels({
      iptvChannels: [
        { id: "c1", name: "BBC One", tvgId: "bbc" },
        { id: "c2", name: "Unknown Channel" },
      ],
      xmltvChannels: [{ id: "bbc", displayName: "BBC One" }],
      programmesByXmltvId: new Map([["bbc", [late, early]]]),
    });
    expect(result).toEqual({ c1: [early, late] });
    expect(result.c2).toBeUndefined();
  });
});
