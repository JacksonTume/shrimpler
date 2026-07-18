// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8.2 / ADR-0015 — persistent snapshot cache for the derived EPG model, one
// per source. Mirrors iptv-cache.ts (meta/body split, TTL staleness, sig-based
// skip-rewrite, quota-safe writes) but stores the *parsed* now/next+grid model, not
// the raw XMLTV. Backed by the injected StorageAdapter — on web the composition
// root points this at IndexedDB (localStorage's ~5 MB is too small for a full EPG).

import type { StorageAdapter } from "../adapters/storage";
import type { AddonEngineErrorHandler } from "../addon/create-engine";
import type { EpgSnapshotBody } from "./types";

/** Bump when the snapshot shape changes; older snapshots read back as a miss. */
export const EPG_SNAPSHOT_VERSION = 1;

const META_PREFIX = "cache/epg/meta/";
const BODY_PREFIX = "cache/epg/body/";

export interface EpgSnapshotMeta {
  version: number;
  /** Epoch ms of the last successful fetch (drives the staleness TTL). */
  fetchedAt: number;
  /** Signature of the serialized body, so a refresh can skip an unchanged rewrite. */
  sig: string;
}

export interface EpgCache {
  readMeta(sourceKey: string): Promise<EpgSnapshotMeta | null>;
  readContent(sourceKey: string): Promise<EpgSnapshotBody | null>;
  write(
    sourceKey: string,
    body: EpgSnapshotBody,
    sig: string,
    bodyChanged: boolean,
  ): Promise<boolean>;
  delete(sourceKey: string): Promise<void>;
  listSourceKeys(): Promise<string[]>;
}

export interface EpgCacheDeps {
  storage: StorageAdapter;
  /** Injectable clock (default Date.now) so TTL expiry is testable. */
  now?: () => number;
  /** Storage-write failures (quota) are reported here, never thrown. */
  onError?: AddonEngineErrorHandler;
}

export function createEpgCache(deps: EpgCacheDeps): EpgCache {
  const { storage, onError } = deps;
  const now = deps.now ?? (() => Date.now());
  const metaKey = (sourceKey: string): string => `${META_PREFIX}${sourceKey}`;
  const bodyKey = (sourceKey: string): string => `${BODY_PREFIX}${sourceKey}`;

  async function readMeta(sourceKey: string): Promise<EpgSnapshotMeta | null> {
    const meta = await storage.get<EpgSnapshotMeta>(metaKey(sourceKey));
    if (meta === null || meta.version !== EPG_SNAPSHOT_VERSION) {
      return null;
    }
    return meta;
  }

  return {
    readMeta,

    async readContent(sourceKey: string): Promise<EpgSnapshotBody | null> {
      if ((await readMeta(sourceKey)) === null) {
        return null;
      }
      return storage.get<EpgSnapshotBody>(bodyKey(sourceKey));
    },

    async write(
      sourceKey: string,
      body: EpgSnapshotBody,
      sig: string,
      bodyChanged: boolean,
    ): Promise<boolean> {
      if (bodyChanged) {
        try {
          await storage.set(bodyKey(sourceKey), body);
        } catch (error) {
          onError?.({ manifestUrl: sourceKey, resource: "manifest", error });
          return false;
        }
      }
      const meta: EpgSnapshotMeta = {
        version: EPG_SNAPSHOT_VERSION,
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
