// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §5 / ADR-0003 — MetadataResolver implementation. Precedence: addon meta
// wins; the MetadataProvider (TMDB in v1) fills gaps keyed off imdbId; the
// merged result is TTL-cached. Providers supply presentation data only.

import type { AddonEngine } from "../addon/engine";
import type { TtlCache } from "../cache";
import type { ContentId, MediaType } from "../types/ids";
import type { MetaDetail, EpisodeRef } from "../types/meta";
import { parseId } from "./parse-id";
import type {
  MetadataProvider,
  MetadataResolver,
  CatalogRow,
  FeedKind,
} from "./resolver";

export interface MetadataResolverTtls {
  detailMs: number;
  episodesMs: number;
  feedMs: number;
}

// Titles change slowly, so cache generously; feeds churn faster than detail.
export const DEFAULT_METADATA_TTLS: MetadataResolverTtls = {
  detailMs: 24 * 60 * 60 * 1000, // 1 day
  episodesMs: 12 * 60 * 60 * 1000, // 12 hours
  feedMs: 60 * 60 * 1000, // 1 hour
};

export interface MetadataResolverDeps {
  /** Only getMeta is consumed; a Pick keeps the resolver testable in isolation. */
  addons: Pick<AddonEngine, "getMeta">;
  providers: readonly MetadataProvider[];
  cache: TtlCache;
  ttls?: Partial<MetadataResolverTtls>;
}

/**
 * "Sparse" = too thin for a detail screen → trigger provider gap-fill (§5.1).
 * A meta with no description, or with neither poster nor background, qualifies.
 */
function isSparse(meta: MetaDetail): boolean {
  return (
    meta.description === undefined ||
    (meta.poster === undefined && meta.background === undefined)
  );
}

/**
 * Overlay `over`'s defined fields onto `base` — addon fields win, the provider
 * only fills gaps (ADR-0003). Undefined values never clobber a filled field.
 */
function fillGaps(base: MetaDetail, over: MetaDetail): MetaDetail {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as unknown as MetaDetail;
}

export function createMetadataResolver(
  deps: MetadataResolverDeps,
): MetadataResolver {
  const { addons, providers, cache } = deps;
  const ttls: MetadataResolverTtls = { ...DEFAULT_METADATA_TTLS, ...deps.ttls };

  /** First provider that returns a detail for the imdbId; failures are isolated. */
  async function providerDetail(
    imdbId: string,
    type: MediaType,
  ): Promise<MetaDetail | null> {
    for (const provider of providers) {
      try {
        const detail = await provider.getDetail(imdbId, type);
        if (detail !== null) {
          return detail;
        }
      } catch {
        // A provider outage must not break resolution — try the next one.
      }
    }
    return null;
  }

  return {
    resolveDetail(id: ContentId, type: MediaType): Promise<MetaDetail | null> {
      return cache.getOrCompute(`meta/${type}/${id}`, ttls.detailMs, async () => {
        const addonMeta = await addons.getMeta(id, type);
        if (addonMeta !== null && !isSparse(addonMeta)) {
          return addonMeta; // addon is the source of truth (§5.1)
        }
        const { imdbId } = parseId(id);
        if (imdbId === undefined) {
          return addonMeta; // no pivot → provider fallback can't apply
        }
        const provider = await providerDetail(imdbId, type);
        if (provider === null) {
          return addonMeta;
        }
        return addonMeta === null ? provider : fillGaps(provider, addonMeta);
      });
    },

    resolveEpisodes(id: ContentId): Promise<EpisodeRef[]> {
      return cache.getOrCompute(`episodes/${id}`, ttls.episodesMs, async () => {
        // Addon meta videos win when present (series meta carries them, §4.2).
        const addonMeta = await addons.getMeta(id, "series");
        if (addonMeta?.videos !== undefined && addonMeta.videos.length > 0) {
          return addonMeta.videos;
        }
        const { imdbId } = parseId(id);
        if (imdbId === undefined) {
          return [];
        }
        for (const provider of providers) {
          if (provider.getEpisodes === undefined) {
            continue;
          }
          try {
            const episodes = await provider.getEpisodes(imdbId);
            if (episodes.length > 0) {
              return episodes;
            }
          } catch {
            // Isolate provider failures, as with detail resolution.
          }
        }
        return [];
      });
    },

    buildHomeFeeds(): Promise<CatalogRow[]> {
      // NOTE: minimal in Phase 1. TMDB list endpoints don't return IMDb ids, so
      // feed items can't yet key into addon streams — full home-feed wiring
      // (and Trakt lists) is Phase 3. Row ids/titles are stable keys the shell
      // maps to labels (§9.2); no finalized UI copy lives in core.
      return cache.getOrCompute("home-feeds", ttls.feedMs, async () => {
        const feeds: FeedKind[] = ["trending", "popular"];
        const rows: CatalogRow[] = [];
        for (const kind of feeds) {
          for (const provider of providers) {
            if (provider.getFeed === undefined) {
              continue;
            }
            try {
              const items = await provider.getFeed(kind);
              if (items.length > 0) {
                rows.push({ id: kind, title: kind, items });
              }
            } catch {
              // Isolate provider failures.
            }
            break; // first feed-capable provider wins for this row
          }
        }
        return rows;
      });
    },
  };
}
