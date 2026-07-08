// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §5 — Metadata resolution. Precedence (ADR-0003): addon meta wins,
// provider (TMDB) fills gaps keyed off imdbId, merged result is cached.
// Providers supply presentation data only — never streams.

import type { ContentId, MediaType } from "../types/ids";
import type { MetaPreview, MetaDetail, EpisodeRef } from "../types/meta";

export interface MetadataProvider {
  readonly id: string; // "tmdb" | "trakt" | "tvdb"
  getDetail(imdbId: string, type: MediaType): Promise<MetaDetail | null>;
  getEpisodes?(imdbId: string): Promise<EpisodeRef[]>;
  // Home-screen feeds (trending/popular/lists) for stream-only setups:
  getFeed?(feed: FeedKind, opts?: FeedOpts): Promise<MetaPreview[]>;
  // Title search. Results carry provider-native ids (e.g. "tmdb:123"), resolved
  // back to detail/episodes via the *ById methods below (§5). Optional so
  // non-search providers still satisfy the interface.
  search?(query: string): Promise<MetaPreview[]>;
  // Resolve one of this provider's own namespaced ids ("<provider.id>:…") — the
  // path that lets a search result open without an IMDb pivot. The resolver
  // routes a namespaced id to the provider whose `id` matches the namespace.
  getDetailById?(id: ContentId, type: MediaType): Promise<MetaDetail | null>;
  getEpisodesById?(id: ContentId): Promise<EpisodeRef[]>;
}

export type FeedKind = "trending" | "popular" | "top_rated" | "user_list";

// NOTE: not defined in spec v0.2 — minimal shape, extend as providers need.
export interface FeedOpts {
  page?: number;
}

// NOTE: not defined in spec v0.2 — a titled home-screen row of catalog items.
export interface CatalogRow {
  id: string;
  title: string;
  items: MetaPreview[];
}

export interface MetadataResolver {
  resolveDetail(id: ContentId, type: MediaType): Promise<MetaDetail | null>;
  resolveEpisodes(id: ContentId): Promise<EpisodeRef[]>;
  buildHomeFeeds(): Promise<CatalogRow[]>; // when addons supply no catalog
  /** Title search across search-capable providers. Empty query → no results. */
  search(query: string): Promise<MetaPreview[]>;
}
