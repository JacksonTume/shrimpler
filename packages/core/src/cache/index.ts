// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §3 / §5.1 step 3 — TTL cache, provider-agnostic, backed by the injected
// StorageAdapter. Used to cache merged metadata results (§5); usable by any
// core subsystem. Pure TS: the clock is injectable so expiry is testable, and
// defaults to Date.now() (already used in core, e.g. create-engine.ts).

import type { StorageAdapter } from "../adapters/storage";

/** Stored wrapper: the value plus its absolute expiry (epoch ms). */
interface CacheEnvelope<T> {
  v: T;
  exp: number; // stale once now() >= exp
}

export interface TtlCache {
  /** The value, or null when missing or expired (expired entries are purged). */
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  /** get(); on a miss, compute → set → return. A rejected compute is not cached. */
  getOrCompute<T>(
    key: string,
    ttlMs: number,
    compute: () => Promise<T>,
  ): Promise<T>;
  delete(key: string): Promise<void>;
}

export interface TtlCacheDeps {
  storage: StorageAdapter;
  /** Storage-key prefix, keeping cache entries in their own space (default "cache"). */
  namespace?: string;
  /** Injectable clock (default Date.now) so TTL expiry is testable. */
  now?: () => number;
}

export function createTtlCache(deps: TtlCacheDeps): TtlCache {
  const { storage } = deps;
  const namespace = deps.namespace ?? "cache";
  const now = deps.now ?? (() => Date.now());
  const storageKey = (key: string): string => `${namespace}/${key}`;

  const cache: TtlCache = {
    async get<T>(key: string): Promise<T | null> {
      const envelope = await storage.get<CacheEnvelope<T>>(storageKey(key));
      if (envelope === null) {
        return null;
      }
      if (now() >= envelope.exp) {
        await storage.delete(storageKey(key));
        return null;
      }
      return envelope.v;
    },

    async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
      const envelope: CacheEnvelope<T> = { v: value, exp: now() + ttlMs };
      await storage.set(storageKey(key), envelope);
    },

    async getOrCompute<T>(
      key: string,
      ttlMs: number,
      compute: () => Promise<T>,
    ): Promise<T> {
      const cached = await cache.get<T>(key);
      if (cached !== null) {
        return cached;
      }
      const value = await compute();
      await cache.set(key, value, ttlMs);
      return value;
    },

    async delete(key: string): Promise<void> {
      await storage.delete(storageKey(key));
    },
  };

  return cache;
}
