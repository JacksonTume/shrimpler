// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs in plain Node against an in-memory StorageAdapter with an injected clock
// so expiry is deterministic (no wall-clock, no fake timers).

import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../adapters/storage";
import { createTtlCache } from "./index";

function memoryStorage(): StorageAdapter {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string) =>
      Promise.resolve((store.get(key) as T | undefined) ?? null),
    set: <T>(key: string, value: T) => {
      store.set(key, JSON.parse(JSON.stringify(value)));
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

describe("createTtlCache", () => {
  it("returns a stored value before it expires and null after", async () => {
    let time = 1000;
    const storage = memoryStorage();
    const cache = createTtlCache({ storage, now: () => time });

    await cache.set("k", { hello: "world" }, 500);
    expect(await cache.get("k")).toEqual({ hello: "world" });

    time = 1499; // still within TTL
    expect(await cache.get("k")).toEqual({ hello: "world" });

    time = 1500; // exp is now() + ttl = 1500; now >= exp → stale
    expect(await cache.get("k")).toBeNull();
    // Expired entries are purged, not just hidden.
    expect(await storage.keys("cache/")).toEqual([]);
  });

  it("returns null for a missing key", async () => {
    const cache = createTtlCache({ storage: memoryStorage() });
    expect(await cache.get("nope")).toBeNull();
  });

  it("getOrCompute computes once, then serves from cache until expiry", async () => {
    let time = 0;
    const cache = createTtlCache({ storage: memoryStorage(), now: () => time });
    const compute = vi.fn(() => Promise.resolve(42));

    expect(await cache.getOrCompute("k", 100, compute)).toBe(42);
    expect(await cache.getOrCompute("k", 100, compute)).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);

    time = 100; // expired → recompute
    await cache.getOrCompute("k", 100, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejected compute", async () => {
    const cache = createTtlCache({ storage: memoryStorage() });
    const boom = vi.fn(() => Promise.reject(new Error("boom")));

    await expect(cache.getOrCompute("k", 100, boom)).rejects.toThrow("boom");
    expect(await cache.get("k")).toBeNull();

    // A later success is what gets cached.
    await cache.getOrCompute("k", 100, () => Promise.resolve("ok"));
    expect(await cache.get("k")).toBe("ok");
  });

  it("delete removes a cached entry", async () => {
    const cache = createTtlCache({ storage: memoryStorage() });
    await cache.set("k", 1, 1000);
    await cache.delete("k");
    expect(await cache.get("k")).toBeNull();
  });

  it("namespaces storage keys so entries stay in their own space", async () => {
    const storage = memoryStorage();
    const cache = createTtlCache({ storage, namespace: "meta" });
    await cache.set("tt1", 1, 1000);
    expect(await storage.keys()).toEqual(["meta/tt1"]);
  });
});
