// SPDX-License-Identifier: AGPL-3.0-or-later
// createEpgService tests: refresh fetches + matches + caches; getNowNext computes
// now/next from the snapshot; the staleness TTL gates re-fetches; a source with no
// discoverable guide URL is skipped. Fake streaming http + in-memory cache, plain
// Node (§2.2).

import { describe, expect, it } from "vitest";
import type { HttpAdapter } from "../adapters/http";
import type { StorageAdapter } from "../adapters/storage";
import { createEpgCache } from "./epg-cache";
import { createEpgService } from "./create-epg";
import type { EpgSource } from "./create-epg";

function memoryStorage(): StorageAdapter {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string) => Promise.resolve((store.get(key) as T) ?? null),
    set: (key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    keys: (prefix = "") =>
      Promise.resolve([...store.keys()].filter((k) => k.startsWith(prefix))),
  };
}

const NOW = Date.UTC(2026, 6, 16, 12, 0, 0);
const MIN = 60 * 1000;

/** Format an epoch-ms instant as an XMLTV UTC timestamp. */
function xt(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`
  );
}

const XMLTV =
  `<tv>` +
  `<channel id="bbc"><display-name>BBC One</display-name></channel>` +
  `<programme start="${xt(NOW - 10 * MIN)}" stop="${xt(NOW + 50 * MIN)}" channel="bbc"><title>Now Show</title></programme>` +
  `<programme start="${xt(NOW + 50 * MIN)}" stop="${xt(NOW + 110 * MIN)}" channel="bbc"><title>Next Show</title></programme>` +
  `</tv>`;

function fakeHttp(body: string): {
  http: HttpAdapter;
  streamCalls: () => number;
} {
  let calls = 0;
  const http: HttpAdapter = {
    get: () => Promise.reject(new Error("unused")),
    post: () => Promise.reject(new Error("unused")),
    getTextStream: (_url: string) => {
      calls += 1;
      return (async function* () {
        // Emit in two chunks to exercise the streaming path.
        const mid = Math.floor(body.length / 2);
        yield body.slice(0, mid);
        yield body.slice(mid);
      })();
    },
  };
  return { http, streamCalls: () => calls };
}

const source = (): EpgSource => ({
  sourceKey: "m3u:test",
  channels: [{ id: "chan1", name: "BBC One HD" }], // fuzzy-matches "BBC One"
  epgUrl: "http://epg.example/xmltv",
});

describe("createEpgService", () => {
  it("refreshes, matches, and serves now/next", async () => {
    const { http } = fakeHttp(XMLTV);
    const epg = createEpgService({
      http,
      cache: createEpgCache({ storage: memoryStorage(), now: () => NOW }),
      listSources: () => Promise.resolve([source()]),
      now: () => NOW,
    });

    expect(await epg.refresh()).toEqual({ changed: true });

    const byId = await epg.getNowNext(["iptv:live:chan1"], NOW);
    expect(byId["iptv:live:chan1"]?.now?.title).toBe("Now Show");
    expect(byId["iptv:live:chan1"]?.next?.title).toBe("Next Show");
  });

  it("omits channels with no matched guide", async () => {
    const { http } = fakeHttp(XMLTV);
    const epg = createEpgService({
      http,
      cache: createEpgCache({ storage: memoryStorage(), now: () => NOW }),
      listSources: () => Promise.resolve([source()]),
      now: () => NOW,
    });
    await epg.refresh();
    const byId = await epg.getNowNext(["iptv:live:unknown"], NOW);
    expect(byId["iptv:live:unknown"]).toBeUndefined();
  });

  it("gates re-fetch on the staleness TTL", async () => {
    const { http, streamCalls } = fakeHttp(XMLTV);
    const epg = createEpgService({
      http,
      cache: createEpgCache({ storage: memoryStorage(), now: () => NOW }),
      listSources: () => Promise.resolve([source()]),
      now: () => NOW,
    });

    await epg.refresh();
    expect(streamCalls()).toBe(1);

    // Within TTL → no network.
    expect(await epg.refresh()).toEqual({ changed: false });
    expect(streamCalls()).toBe(1);

    // force ignores the TTL (re-fetches; identical body → not "changed").
    expect(await epg.refresh({ force: true })).toEqual({ changed: false });
    expect(streamCalls()).toBe(2);
  });

  it("skips a source with no discoverable guide URL", async () => {
    const { http, streamCalls } = fakeHttp(XMLTV);
    const noGuide: EpgSource = {
      sourceKey: "m3u:test",
      channels: [{ id: "chan1", name: "BBC One" }],
      // no epgUrl and no playlistUrl → nothing to sniff
    };
    const epg = createEpgService({
      http,
      cache: createEpgCache({ storage: memoryStorage(), now: () => NOW }),
      listSources: () => Promise.resolve([noGuide]),
      now: () => NOW,
    });
    expect(await epg.refresh()).toEqual({ changed: false });
    expect(streamCalls()).toBe(0);
    expect(await epg.getNowNext(["iptv:live:chan1"], NOW)).toEqual({});
  });

  it("prunes snapshots for sources no longer configured", async () => {
    const { http } = fakeHttp(XMLTV);
    const cache = createEpgCache({ storage: memoryStorage(), now: () => NOW });
    let sources = [source()];
    const epg = createEpgService({
      http,
      cache,
      listSources: () => Promise.resolve(sources),
      now: () => NOW,
    });
    await epg.refresh();
    expect(await cache.listSourceKeys()).toEqual(["m3u:test"]);

    sources = [];
    await epg.refresh({ force: true });
    expect(await cache.listSourceKeys()).toEqual([]);
  });
});
