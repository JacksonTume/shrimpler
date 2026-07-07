// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §5.2 / §7.3 — TMDB MetadataProvider. Lives in core but performs no fetch
// directly: the HttpAdapter and API key are injected, preserving core purity.

import type { HttpAdapter } from "../adapters/http";
import type { MediaType } from "../types/ids";
import type { MetaPreview, MetaDetail, EpisodeRef } from "../types/meta";
import type {
  MetadataProvider,
  FeedKind,
  FeedOpts,
} from "../metadata/resolver";

export interface TmdbProviderOptions {
  http: HttpAdapter;
  apiKey: string;
}

export class TmdbProvider implements MetadataProvider {
  readonly id = "tmdb";

  constructor(private readonly options: TmdbProviderOptions) {}

  // TODO(Phase 1): TMDB /find by external imdb_id, then movie/tv details.
  getDetail(_imdbId: string, _type: MediaType): Promise<MetaDetail | null> {
    void this.options;
    return Promise.reject(
      new Error("TmdbProvider.getDetail not implemented (Phase 1)"),
    );
  }

  // TODO(Phase 1): season/episode listings.
  getEpisodes(_imdbId: string): Promise<EpisodeRef[]> {
    return Promise.reject(
      new Error("TmdbProvider.getEpisodes not implemented (Phase 1)"),
    );
  }

  // TODO(Phase 1): trending/popular feeds for stream-only setups (§5, §10).
  getFeed(_feed: FeedKind, _opts?: FeedOpts): Promise<MetaPreview[]> {
    return Promise.reject(
      new Error("TmdbProvider.getFeed not implemented (Phase 1)"),
    );
  }
}
