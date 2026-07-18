// SPDX-License-Identifier: AGPL-3.0-or-later
// createEpgCache tests: meta/body round-trip, schema-version gating, meta-only
// rewrite when unchanged, quota-safe writes (prior snapshot survives). Mirrors
// iptv-cache.test.ts. In-memory storage, plain Node (§2.2).

import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../adapters/storage";
import { EPG_SNAPSHOT_VERSION, createEpgCache } from "./epg-cache";
import type { EpgSnapshotBody } from "./types";

function memoryStorage(seed: Record<string, unknown> = {}): StorageAdapter {
  const store = new Map<string, unknown>(Object.entries(seed));
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

const body = (title: string): EpgSnapshotBody => ({
  byChannel: { c1: [{ start: 1, stop: 2, title }] },
});

describe("createEpgCache", () => {
  it("round-trips a snapshot", async () => {
    const cache = createEpgCache({ storage: memoryStorage(), now: () => 42 });
    expect(await cache.write("m3u:a", body("News"), "sig1", true)).toBe(true);
    expect(await cache.readMeta("m3u:a")).toEqual({
      version: EPG_SNAPSHOT_VERSION,
      fetchedAt: 42,
      sig: "sig1",
    });
    expect(await cache.readContent("m3u:a")).toEqual(body("News"));
  });

  it("treats a stale schema version as a miss", async () => {
    const storage = memoryStorage({
      "cache/epg/meta/m3u:a": { version: 0, fetchedAt: 1, sig: "x" },
      "cache/epg/body/m3u:a": body("News"),
    });
    const cache = createEpgCache({ storage });
    expect(await cache.readMeta("m3u:a")).toBeNull();
    expect(await cache.readContent("m3u:a")).toBeNull();
  });

  it("refreshes meta without rewriting the body when unchanged", async () => {
    const storage = memoryStorage();
    const setSpy = vi.spyOn(storage, "set");
    let clock = 100;
    const cache = createEpgCache({ storage, now: () => clock });
    await cache.write("m3u:a", body("News"), "sig1", true);
    const afterFirst = setSpy.mock.calls.length;
    clock = 200;
    await cache.write("m3u:a", body("News"), "sig1", false);
    expect(setSpy.mock.calls.length).toBe(afterFirst + 1);
    expect((await cache.readMeta("m3u:a"))?.fetchedAt).toBe(200);
  });

  it("keeps the prior snapshot when a body write fails", async () => {
    const storage = memoryStorage();
    const cache = createEpgCache({ storage });
    const onError = vi.fn();
    await cache.write("m3u:a", body("News"), "sig1", true);
    const failing = createEpgCache({
      storage: {
        ...storage,
        set: (key, value) =>
          key.startsWith("cache/epg/body/")
            ? Promise.reject(new Error("QuotaExceededError"))
            : storage.set(key, value),
      },
      onError,
    });
    expect(await failing.write("m3u:a", body("Other"), "sig2", true)).toBe(
      false,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(await cache.readContent("m3u:a")).toEqual(body("News"));
  });

  it("lists and deletes source keys", async () => {
    const cache = createEpgCache({ storage: memoryStorage() });
    await cache.write("m3u:a", body("A"), "s", true);
    await cache.write("xtream:xt-1", body("B"), "s", true);
    expect((await cache.listSourceKeys()).sort()).toEqual([
      "m3u:a",
      "xtream:xt-1",
    ]);
    await cache.delete("m3u:a");
    expect(await cache.listSourceKeys()).toEqual(["xtream:xt-1"]);
  });
});
