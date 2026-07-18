// SPDX-License-Identifier: AGPL-3.0-or-later
// parseXmltvStream tests: element extraction across arbitrary chunk boundaries,
// timezone normalization to UTC, entity decoding, and lenient handling of malformed
// entries. Pure, plain Node (§2.2).

import { describe, expect, it } from "vitest";
import { parseXmltvStream, parseXmltvTime } from "./parse-xmltv";
import type { XmltvChannel, XmltvProgramme } from "./parse-xmltv";

/** Yield `text` in fixed-size slices to exercise chunk-boundary reassembly. */
async function* inChunks(text: string, size: number): AsyncIterable<string> {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
  }
}

async function collect(
  chunks: AsyncIterable<string>,
): Promise<{ channels: XmltvChannel[]; programmes: XmltvProgramme[] }> {
  const channels: XmltvChannel[] = [];
  const programmes: XmltvProgramme[] = [];
  await parseXmltvStream(chunks, {
    onChannel: (c) => channels.push(c),
    onProgramme: (p) => programmes.push(p),
  });
  return { channels, programmes };
}

const SAMPLE = `<?xml version="1.0"?>
<tv>
  <channel id="bbc.uk">
    <display-name>BBC One HD</display-name>
  </channel>
  <channel id="itv.uk"><display-name lang="en">ITV</display-name></channel>
  <programme start="20260716120000 +0000" stop="20260716130000 +0000" channel="bbc.uk">
    <title>News &amp; Weather</title>
    <desc>The &lt;latest&gt;</desc>
    <category>News</category>
  </programme>
  <programme start="20260716130000 +0100" stop="20260716140000 +0100" channel="itv.uk">
    <title>Lunch</title>
  </programme>
</tv>`;

describe("parseXmltvStream", () => {
  it("parses channels and programmes from a whole document", async () => {
    const { channels, programmes } = await collect(
      inChunks(SAMPLE, SAMPLE.length),
    );
    expect(channels).toEqual([
      { id: "bbc.uk", displayName: "BBC One HD" },
      { id: "itv.uk", displayName: "ITV" },
    ]);
    expect(programmes).toHaveLength(2);
    expect(programmes[0]).toEqual({
      channel: "bbc.uk",
      start: Date.UTC(2026, 6, 16, 12, 0, 0),
      stop: Date.UTC(2026, 6, 16, 13, 0, 0),
      title: "News & Weather",
      desc: "The <latest>",
      category: "News",
    });
  });

  it("normalizes a +0100 offset to UTC", async () => {
    const { programmes } = await collect(inChunks(SAMPLE, SAMPLE.length));
    // 13:00 +0100 == 12:00 UTC.
    expect(programmes[1]!.start).toBe(Date.UTC(2026, 6, 16, 12, 0, 0));
  });

  it("reassembles elements split across every chunk size", async () => {
    for (const size of [1, 3, 7, 16, 64]) {
      const { channels, programmes } = await collect(inChunks(SAMPLE, size));
      expect(channels.map((c) => c.id)).toEqual(["bbc.uk", "itv.uk"]);
      expect(programmes.map((p) => p.title)).toEqual([
        "News & Weather",
        "Lunch",
      ]);
    }
  });

  it("skips malformed entries but keeps the rest (lenient)", async () => {
    const doc = `<tv>
      <programme start="nonsense" stop="20260716130000" channel="a"><title>Bad</title></programme>
      <programme channel="b"><title>NoTimes</title></programme>
      <programme start="20260716120000" stop="20260716130000" channel="c"><title>Good</title></programme>
    </tv>`;
    const { programmes } = await collect(inChunks(doc, 5));
    expect(programmes.map((p) => p.title)).toEqual(["Good"]);
  });

  it("handles a self-closing channel without hanging", async () => {
    const doc = `<tv><channel id="x"/><programme start="20260716120000" stop="20260716130000" channel="x"><title>Y</title></programme></tv>`;
    const { channels, programmes } = await collect(inChunks(doc, 4));
    expect(channels).toEqual([{ id: "x" }]);
    expect(programmes.map((p) => p.title)).toEqual(["Y"]);
  });
});

describe("parseXmltvTime", () => {
  it("treats a missing offset as UTC", () => {
    expect(parseXmltvTime("20260716120000")).toBe(
      Date.UTC(2026, 6, 16, 12, 0, 0),
    );
  });

  it("applies a negative offset", () => {
    // 08:00 -0500 == 13:00 UTC.
    expect(parseXmltvTime("20260716080000 -0500")).toBe(
      Date.UTC(2026, 6, 16, 13, 0, 0),
    );
  });

  it("returns undefined for junk", () => {
    expect(parseXmltvTime("not-a-time")).toBeUndefined();
    expect(parseXmltvTime(undefined)).toBeUndefined();
  });
});
