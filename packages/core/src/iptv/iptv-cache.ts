// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — persistent snapshot cache for parsed IPTV content. A full
// subscription can take minutes to fetch + parse; without a cache every startup
// and every reloadCore re-fetches everything. This stores one snapshot per source
// so buildIptvAddon can serve instantly from disk while refreshIptvSources
// refreshes in the background (stale-while-revalidate).
//
// Meta/body split: the tiny `meta` record ({version, fetchedAt, sig}) is read on
// every startup for the staleness + change checks; the large `body` (the parsed
// IptvContent, often several MB) is read only at build time and rewritten only
// when its signature changes. Backed by the injected StorageAdapter — on web the
// composition root points this at IndexedDB (localStorage's ~5 MB is too small).

import type { StorageAdapter } from "../adapters/storage";
import type { AddonEngineErrorHandler } from "../addon/create-engine";
import type { IptvContent } from "./content";

/** Bump when the snapshot shape changes; older snapshots read back as a miss. */
export const IPTV_SNAPSHOT_VERSION = 1;

const META_PREFIX = "cache/iptv/meta/";
const BODY_PREFIX = "cache/iptv/body/";

/** Small per-source record read on every startup (staleness + change detection). */
export interface IptvSnapshotMeta {
  version: number;
  /** Epoch ms of the last successful fetch (drives the staleness TTL). */
  fetchedAt: number;
  /** Signature of the serialized body, so a refresh can skip an unchanged rewrite. */
  sig: string;
}

export interface IptvContentCache {
  /** The meta record, or null when absent or a stale schema version. */
  readMeta(sourceKey: string): Promise<IptvSnapshotMeta | null>;
  /** The cached content, or null when absent or a stale schema version. */
  readContent(sourceKey: string): Promise<IptvContent | null>;
  /**
   * Persist a freshly-fetched snapshot. The body is (re)written only when
   * `bodyChanged`; `meta` is refreshed either way so the staleness TTL advances.
   * Returns false when the body write failed (e.g. storage quota) — reported via
   * onError and left as a no-op so the previous snapshot (if any) survives.
   */
  write(
    sourceKey: string,
    content: IptvContent,
    sig: string,
    bodyChanged: boolean,
  ): Promise<boolean>;
  /** Remove both records for a source (used when a source is deleted/pruned). */
  delete(sourceKey: string): Promise<void>;
  /** Every source key with a stored meta record (for pruning removed sources). */
  listSourceKeys(): Promise<string[]>;
}

export interface IptvContentCacheDeps {
  storage: StorageAdapter;
  /** Injectable clock (default Date.now) so TTL expiry is testable. */
  now?: () => number;
  /** Storage-write failures (quota) are reported here, never thrown. */
  onError?: AddonEngineErrorHandler;
}

export function createIptvContentCache(
  deps: IptvContentCacheDeps,
): IptvContentCache {
  const { storage, onError } = deps;
  const now = deps.now ?? (() => Date.now());
  const metaKey = (sourceKey: string): string => `${META_PREFIX}${sourceKey}`;
  const bodyKey = (sourceKey: string): string => `${BODY_PREFIX}${sourceKey}`;

  async function readMeta(
    sourceKey: string,
  ): Promise<IptvSnapshotMeta | null> {
    const meta = await storage.get<IptvSnapshotMeta>(metaKey(sourceKey));
    if (meta === null || meta.version !== IPTV_SNAPSHOT_VERSION) {
      return null;
    }
    return meta;
  }

  return {
    readMeta,

    async readContent(sourceKey: string): Promise<IptvContent | null> {
      // Version-gate through the meta record, then read the body.
      if ((await readMeta(sourceKey)) === null) {
        return null;
      }
      return storage.get<IptvContent>(bodyKey(sourceKey));
    },

    async write(
      sourceKey: string,
      content: IptvContent,
      sig: string,
      bodyChanged: boolean,
    ): Promise<boolean> {
      if (bodyChanged) {
        // Body first: if it fails (quota), skip the meta write so meta/body stay
        // consistent and the prior snapshot keeps serving.
        try {
          await storage.set(bodyKey(sourceKey), content);
        } catch (error) {
          onError?.({ manifestUrl: sourceKey, resource: "manifest", error });
          return false;
        }
      }
      const meta: IptvSnapshotMeta = {
        version: IPTV_SNAPSHOT_VERSION,
        fetchedAt: now(),
        sig,
      };
      try {
        await storage.set(metaKey(sourceKey), meta);
      } catch (error) {
        onError?.({ manifestUrl: sourceKey, resource: "manifest", error });
        return false;
      }
      return true;
    },

    async delete(sourceKey: string): Promise<void> {
      await storage.delete(metaKey(sourceKey));
      await storage.delete(bodyKey(sourceKey));
    },

    async listSourceKeys(): Promise<string[]> {
      const keys = await storage.keys(META_PREFIX);
      return keys.map((k) => k.slice(META_PREFIX.length));
    },
  };
}
