// SPDX-License-Identifier: AGPL-3.0-or-later
// createIptvContentCache tests: meta/body round-trip, schema-version gating,
// meta-only rewrites when unchanged, quota-safe writes (prior snapshot survives),
// deletion, and source-key listing. In-memory storage, plain Node (§2.2).

import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../adapters/storage";
import type { IptvContent } from "./content";
import { IPTV_SNAPSHOT_VERSION, createIptvContentCache } from "./iptv-cache";

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

const content = (name: string): IptvContent => ({
  channels: [{ id: name, name, url: `http://h/${name}.ts` }],
  movies: [],
  series: [],
});

describe("createIptvContentCache", () => {
  it("round-trips a snapshot (meta + body)", async () => {
    const cache = createIptvContentCache({
      storage: memoryStorage(),
      now: () => 42,
    });
    expect(await cache.write("m3u:a", content("a"), "sig1", true)).toBe(true);

    expect(await cache.readMeta("m3u:a")).toEqual({
      version: IPTV_SNAPSHOT_VERSION,
      fetchedAt: 42,
      sig: "sig1",
    });
    expect(await cache.readContent("m3u:a")).toEqual(content("a"));
  });

  it("treats a stale schema version as a miss", async () => {
    const storage = memoryStorage({
      "cache/iptv/meta/m3u:a": { version: 0, fetchedAt: 1, sig: "x" },
      "cache/iptv/body/m3u:a": content("a"),
    });
    const cache = createIptvContentCache({ storage });
    expect(await cache.readMeta("m3u:a")).toBeNull();
    expect(await cache.readContent("m3u:a")).toBeNull();
  });

  it("refreshes meta without rewriting the body when unchanged", async () => {
    const storage = memoryStorage();
    const setSpy = vi.spyOn(storage, "set");
    let clock = 100;
    const cache = createIptvContentCache({ storage, now: () => clock });

    await cache.write("m3u:a", content("a"), "sig1", true);
    const writesAfterFirst = setSpy.mock.calls.length; // body + meta

    clock = 200;
    await cache.write("m3u:a", content("a"), "sig1", false);
    // Only meta was written the second time (no body write).
    expect(setSpy.mock.calls.length).toBe(writesAfterFirst + 1);
    expect((await cache.readMeta("m3u:a"))?.fetchedAt).toBe(200);
  });

  it("keeps the prior snapshot and reports onError when the body write fails", async () => {
    const storage = memoryStorage();
    const cache = createIptvContentCache({ storage });
    const onError = vi.fn();

    await cache.write("m3u:a", content("a"), "sig1", true);

    // Make the next body write throw (quota), meta write would follow but is skipped.
    const failing = createIptvContentCache({
      storage: {
        ...storage,
        set: (key, value) =>
          key.startsWith("cache/iptv/body/")
            ? Promise.reject(new Error("QuotaExceededError"))
            : storage.set(key, value),
      },
      onError,
    });
    expect(await failing.write("m3u:a", content("b"), "sig2", true)).toBe(
      false,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    // Prior snapshot untouched.
    expect(await cache.readContent("m3u:a")).toEqual(content("a"));
    expect((await cache.readMeta("m3u:a"))?.sig).toBe("sig1");
  });

  it("deletes both records and lists source keys", async () => {
    const cache = createIptvContentCache({ storage: memoryStorage() });
    await cache.write("m3u:a", content("a"), "s", true);
    await cache.write("xtream:xt-1", content("b"), "s", true);
    expect((await cache.listSourceKeys()).sort()).toEqual([
      "m3u:a",
      "xtream:xt-1",
    ]);

    await cache.delete("m3u:a");
    expect(await cache.readMeta("m3u:a")).toBeNull();
    expect(await cache.readContent("m3u:a")).toBeNull();
    expect(await cache.listSourceKeys()).toEqual(["xtream:xt-1"]);
  });
});
