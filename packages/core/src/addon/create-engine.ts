// SPDX-License-Identifier: AGPL-3.0-or-later
// AddonEngine implementation (§6.2): stores installed addons via the injected
// StorageAdapter, fans out to every enabled addon that can serve a request,
// enforces per-addon timeouts with partial-failure isolation, and merges
// results (install-order, first wins; streams ranked per ADR-0004).

import type { HttpAdapter } from "../adapters/http";
import type { StorageAdapter } from "../adapters/storage";
import type {
  CatalogExtra,
  InstalledAddon,
  ResourceName,
} from "../types/addon";
import type { ContentId, MediaType } from "../types/ids";
import type { MetaDetail, MetaPreview } from "../types/meta";
import type { PlayableSource, SubtitleTrack } from "../types/sources";
import type { AddonManifest } from "../types/addon";
import { rankStreams } from "../ranking/stream-rank";
import type { AddonEngine } from "./engine";
import type { InternalAddon } from "./internal-addon";
import {
  AddonInstallError,
  normalizeManifestUrl,
  parseManifest,
  servesResource,
} from "./manifest";
import {
  fetchCatalog,
  fetchMeta,
  fetchStreams,
  fetchSubtitles,
  getJson,
} from "./resource-client";
import { withTimeout } from "./timeout";

export interface AddonEngineTimeouts {
  manifestMs: number;
  catalogMs: number;
  metaMs: number;
  streamMs: number;
  subtitlesMs: number;
}

/** Stream addons often do live upstream searches — they get the longest budget. */
export const DEFAULT_ADDON_TIMEOUTS: AddonEngineTimeouts = {
  manifestMs: 10_000,
  catalogMs: 10_000,
  metaMs: 10_000,
  streamMs: 15_000,
  subtitlesMs: 10_000,
};

export interface AddonEngineError {
  manifestUrl: string;
  addonId?: string;
  resource: ResourceName | "manifest";
  error: unknown;
}

export type AddonEngineErrorHandler = (error: AddonEngineError) => void;

export interface AddonEngineDeps {
  http: HttpAdapter;
  storage: StorageAdapter;
  timeouts?: Partial<AddonEngineTimeouts>;
  /** Observability hook for skipped/failed addons (seed of the §13.6 debug mode). */
  onError?: AddonEngineErrorHandler;
  /**
   * In-process addons (ADR-0006, e.g. IPTV). Code-provided at construction —
   * not persisted and not returned by list() (which stays HTTP-addons only).
   * They fan out through the same gating/timeout/dedup/rank path as HTTP addons.
   */
  internalAddons?: InternalAddon[];
}

const STORAGE_KEY = "addons/installed";

/** Dedup key for streams (§6.3): infoHash(+fileIdx) beats url; else unique. */
function streamDedupKey(source: PlayableSource, fallback: number): string {
  if (source.infoHash !== undefined) {
    return `hash:${source.infoHash}:${source.fileIdx ?? 0}`;
  }
  if (source.url !== undefined) {
    return `url:${source.url}`;
  }
  if (source.magnet !== undefined) {
    return `magnet:${source.magnet}`;
  }
  return `unique:${fallback}`;
}

/**
 * The uniform fan-out target: a manifest (for gating/merge) + the four resource
 * fetchers. An HTTP addon's fetchers call the resource-client; an internal
 * addon's delegate to its in-memory methods. Fan-out, dedup, and ranking are
 * identical for both — only how a target answers differs.
 */
interface AddonTarget {
  manifest: AddonManifest;
  /** Real URL for HTTP addons; `internal:<id>` for internal ones (error labels). */
  manifestUrl: string;
  getCatalog(
    type: MediaType,
    catalogId: string,
    extra?: CatalogExtra,
  ): Promise<MetaPreview[]>;
  getMeta(id: ContentId, type: MediaType): Promise<MetaDetail | null>;
  getStreams(id: ContentId, type: MediaType): Promise<PlayableSource[]>;
  getSubtitles(id: ContentId, type: MediaType): Promise<SubtitleTrack[]>;
}

/**
 * Loads persisted state, then returns a ready engine — which is why the
 * factory is async while the AddonEngine interface (list() is sync) stays
 * exactly as frozen in §6.2.
 */
export async function createAddonEngine(
  deps: AddonEngineDeps,
): Promise<AddonEngine> {
  const { http, storage, onError } = deps;
  const timeouts: AddonEngineTimeouts = {
    ...DEFAULT_ADDON_TIMEOUTS,
    ...deps.timeouts,
  };

  let installed: InstalledAddon[] =
    (await storage.get<InstalledAddon[]>(STORAGE_KEY)) ?? [];
  const internal = deps.internalAddons ?? [];

  const persist = () => storage.set(STORAGE_KEY, installed);

  const report = (error: AddonEngineError): void => {
    try {
      onError?.(error);
    } catch {
      // The observer must never break the pipeline.
    }
  };

  /** HTTP addon → target: fetchers call the resource-client over its URL. */
  const httpTarget = (addon: InstalledAddon): AddonTarget => ({
    manifest: addon.manifest,
    manifestUrl: addon.manifestUrl,
    getCatalog: (type, catalogId, extra) =>
      fetchCatalog(
        http,
        addon.manifestUrl,
        type,
        catalogId,
        timeouts.catalogMs,
        extra,
      ),
    getMeta: (id, type) =>
      fetchMeta(http, addon.manifestUrl, type, id, timeouts.metaMs),
    getStreams: (id, type) =>
      fetchStreams(
        http,
        addon.manifestUrl,
        type,
        id,
        timeouts.streamMs,
        addon.manifest.id,
      ),
    getSubtitles: (id, type) =>
      fetchSubtitles(http, addon.manifestUrl, type, id, timeouts.subtitlesMs),
  });

  /** Internal addon → target: fetchers delegate to its in-memory methods. */
  const internalTarget = (addon: InternalAddon): AddonTarget => ({
    manifest: addon.manifest,
    manifestUrl: `internal:${addon.manifest.id}`,
    getCatalog: (type, catalogId, extra) =>
      addon.getCatalog(type, catalogId, extra),
    getMeta: (id, type) => addon.getMeta(id, type),
    getStreams: (id, type) => addon.getStreams(id, type),
    getSubtitles: (id, type) => addon.getSubtitles(id, type),
  });

  /**
   * Run one request per target with partial-failure isolation; failed targets
   * yield `fallback` and are reported. Promise.all preserves input (install)
   * order, which is what the merge semantics rely on.
   */
  function fanOut<T>(
    targets: AddonTarget[],
    resource: ResourceName,
    timeoutMs: number,
    request: (target: AddonTarget) => Promise<T>,
    fallback: T,
  ): Promise<T[]> {
    return Promise.all(
      targets.map(async (target) => {
        try {
          return await request(target);
        } catch (error) {
          report({
            manifestUrl: target.manifestUrl,
            addonId: target.manifest.id,
            resource,
            error,
          });
          return fallback;
        }
      }),
    );
  }

  /**
   * Enabled HTTP addons (install-order) followed by internal addons, filtered to
   * those that can serve resource+type(+id). Internal addons are always active.
   */
  const serving = (
    resource: ResourceName,
    type: MediaType,
    id?: ContentId,
  ): AddonTarget[] =>
    [
      ...installed.filter((addon) => addon.enabled).map(httpTarget),
      ...internal.map(internalTarget),
    ].filter((target) => servesResource(target.manifest, resource, type, id));

  return {
    async install(manifestUrl: string): Promise<InstalledAddon> {
      const url = normalizeManifestUrl(manifestUrl);
      let body: unknown;
      try {
        body = await getJson(http, url, timeouts.manifestMs);
      } catch (error) {
        report({ manifestUrl: url, resource: "manifest", error });
        throw new AddonInstallError(
          `Could not fetch manifest from ${url}`,
          url,
          { cause: error },
        );
      }
      const manifest = parseManifest(body, url);

      const existing = installed.find((addon) => addon.manifestUrl === url);
      if (existing !== undefined) {
        // Re-install refreshes the manifest, keeping enabled state and priority.
        existing.manifest = manifest;
        await persist();
        return { ...existing };
      }
      const entry: InstalledAddon = {
        manifestUrl: url,
        manifest,
        enabled: true,
        addedAt: Date.now(),
      };
      installed.push(entry);
      await persist();
      return { ...entry };
    },

    async remove(manifestUrl: string): Promise<void> {
      const url = normalizeManifestUrl(manifestUrl);
      installed = installed.filter((addon) => addon.manifestUrl !== url);
      await persist();
    },

    async setEnabled(manifestUrl: string, enabled: boolean): Promise<void> {
      const url = normalizeManifestUrl(manifestUrl);
      const entry = installed.find((addon) => addon.manifestUrl === url);
      if (entry === undefined) {
        throw new AddonInstallError(`Addon is not installed: ${url}`, url);
      }
      entry.enabled = enabled;
      await persist();
    },

    list(): InstalledAddon[] {
      return installed.map((addon) => ({ ...addon }));
    },

    async getCatalog(
      type: MediaType,
      catalogId: string,
      extra?: CatalogExtra,
    ): Promise<MetaPreview[]> {
      const targets = serving("catalog", type).filter((target) =>
        target.manifest.catalogs.some(
          (c) => c.type === type && c.id === catalogId,
        ),
      );
      const perAddon = await fanOut(
        targets,
        "catalog",
        timeouts.catalogMs,
        (target) => target.getCatalog(type, catalogId, extra),
        [] as MetaPreview[],
      );
      const seen = new Set<string>();
      const merged: MetaPreview[] = [];
      for (const item of perAddon.flat()) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
      }
      return merged;
    },

    async getMeta(id: ContentId, type: MediaType): Promise<MetaDetail | null> {
      const targets = serving("meta", type, id);
      const results = await fanOut(
        targets,
        "meta",
        timeouts.metaMs,
        (target) => target.getMeta(id, type),
        null,
      );
      return results.find((meta) => meta !== null) ?? null;
    },

    async getStreams(
      id: ContentId,
      type: MediaType,
    ): Promise<PlayableSource[]> {
      const targets = serving("stream", type, id);
      const perAddon = await fanOut(
        targets,
        "stream",
        timeouts.streamMs,
        (target) => target.getStreams(id, type),
        [] as PlayableSource[],
      );
      const seen = new Set<string>();
      const merged: PlayableSource[] = [];
      perAddon.flat().forEach((source, index) => {
        const key = streamDedupKey(source, index);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(source);
        }
      });
      return rankStreams(merged);
    },

    async getSubtitles(
      id: ContentId,
      type: MediaType,
    ): Promise<SubtitleTrack[]> {
      const targets = serving("subtitles", type, id);
      const perAddon = await fanOut(
        targets,
        "subtitles",
        timeouts.subtitlesMs,
        (target) => target.getSubtitles(id, type),
        [] as SubtitleTrack[],
      );
      const seen = new Set<string>();
      const merged: SubtitleTrack[] = [];
      for (const track of perAddon.flat()) {
        if (!seen.has(track.url)) {
          seen.add(track.url);
          merged.push(track);
        }
      }
      return merged;
    },
  };
}

export { withTimeout };
