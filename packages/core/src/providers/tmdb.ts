// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §5.2 / §7.3 — TMDB MetadataProvider. Lives in core but performs no fetch
// directly: the HttpAdapter and API key are injected, preserving core purity.
// Uses TMDB API v3 (api_key query param — what users copy from their TMDB
// account); the shell supplies the user's key at the composition root.

import type { HttpAdapter } from "../adapters/http";
import type { ContentId, MediaType } from "../types/ids";
import type { MetaPreview, MetaDetail, EpisodeRef } from "../types/meta";
import type {
  MetadataProvider,
  FeedKind,
  FeedOpts,
} from "../metadata/resolver";

export interface TmdbProviderOptions {
  http: HttpAdapter;
  apiKey: string;
  /** Per-request timeout handed to the HttpAdapter (default 10s). */
  timeoutMs?: number;
}

const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

// --- TMDB response shapes (only the fields we map) ---------------------------

interface TmdbRef {
  id: number;
}

interface TmdbFindResponse {
  movie_results?: TmdbRef[];
  tv_results?: TmdbRef[];
}

interface TmdbGenre {
  name: string;
}

interface TmdbCastMember {
  name: string;
}

interface TmdbDetail {
  title?: string; // movie
  name?: string; // tv
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  genres?: TmdbGenre[];
  runtime?: number | null; // movie, minutes
  episode_run_time?: number[]; // tv, minutes
  release_date?: string; // movie
  first_air_date?: string; // tv
  vote_average?: number;
  credits?: { cast?: TmdbCastMember[] };
}

interface TmdbTvDetail {
  seasons?: { season_number: number }[];
}

interface TmdbEpisode {
  season_number: number;
  episode_number: number;
  name?: string;
  overview?: string;
  air_date?: string;
  still_path?: string | null;
}

interface TmdbSeasonDetail {
  episodes?: TmdbEpisode[];
}

interface TmdbListItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
}

interface TmdbListResponse {
  results?: TmdbListItem[];
}

interface TmdbExternalIds {
  imdb_id?: string | null;
}

function toQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/** Extract the numeric TMDB id from a "tmdb:123" (or "tmdb:123:1:5") content id. */
function tmdbIdFromContentId(id: ContentId): number | null {
  const raw = id.split(":")[1];
  return raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
}

export class TmdbProvider implements MetadataProvider {
  readonly id = "tmdb";
  private readonly timeoutMs: number;

  constructor(private readonly options: TmdbProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private async fetch<T>(
    path: string,
    params: Record<string, string> = {},
  ): Promise<T | null> {
    const query = toQuery({ api_key: this.options.apiKey, ...params });
    const url = `${API_BASE}${path}?${query}`;
    const response = await this.options.http.get(url, {
      timeoutMs: this.timeoutMs,
    });
    if (!response.ok) {
      return null;
    }
    return response.json<T>();
  }

  private image(size: string, path?: string | null): string | undefined {
    return path === undefined || path === null || path === ""
      ? undefined
      : `${IMAGE_BASE}/${size}${path}`;
  }

  /** Resolve an IMDb id to a TMDB numeric id for the given media type. */
  private async findTmdbId(
    imdbId: string,
    isTv: boolean,
  ): Promise<number | null> {
    const found = await this.fetch<TmdbFindResponse>(
      `/find/${encodeURIComponent(imdbId)}`,
      { external_source: "imdb_id" },
    );
    const results = isTv ? found?.tv_results : found?.movie_results;
    return results?.[0]?.id ?? null;
  }

  /** Map a fetched TMDB detail onto MetaDetail, keeping the given content id. */
  private mapDetail(
    detail: TmdbDetail,
    id: ContentId,
    type: MediaType,
  ): MetaDetail {
    const runtime = detail.runtime ?? detail.episode_run_time?.[0];
    return {
      id,
      type,
      name: detail.title ?? detail.name ?? "",
      poster: this.image("w500", detail.poster_path),
      background: this.image("original", detail.backdrop_path),
      description: detail.overview,
      genres: detail.genres?.map((g) => g.name),
      cast: detail.credits?.cast?.slice(0, 20).map((c) => c.name),
      runtime:
        runtime === undefined || runtime === null ? undefined : `${runtime} min`,
      released: detail.release_date ?? detail.first_air_date,
      // TMDB's own rating, surfaced via the presentation-only imdbRating field.
      imdbRating:
        detail.vote_average === undefined
          ? undefined
          : detail.vote_average.toFixed(1),
    };
  }

  /** Fetch + map a detail by TMDB numeric id; `id` is the content id to keep. */
  private async fetchDetail(
    tmdbId: number,
    type: MediaType,
    id: ContentId,
  ): Promise<MetaDetail | null> {
    const isTv = type === "series" || type === "tv";
    const detail = await this.fetch<TmdbDetail>(
      `/${isTv ? "tv" : "movie"}/${tmdbId}`,
      { append_to_response: "credits" },
    );
    return detail === null ? null : this.mapDetail(detail, id, type);
  }

  private async episodesForTmdbId(
    tmdbId: number,
    idBase: string,
  ): Promise<EpisodeRef[]> {
    const show = await this.fetch<TmdbTvDetail>(`/tv/${tmdbId}`);
    if (show === null) {
      return [];
    }
    const seasons = (show.seasons ?? []).filter((s) => s.season_number > 0);
    const episodes: EpisodeRef[] = [];
    for (const season of seasons) {
      const detail = await this.fetch<TmdbSeasonDetail>(
        `/tv/${tmdbId}/season/${season.season_number}`,
      );
      for (const ep of detail?.episodes ?? []) {
        episodes.push({
          id: `${idBase}:${ep.season_number}:${ep.episode_number}`,
          season: ep.season_number,
          episode: ep.episode_number,
          name: ep.name,
          overview: ep.overview,
          released: ep.air_date,
          thumbnail: this.image("w300", ep.still_path),
        });
      }
    }
    return episodes;
  }

  async getDetail(
    imdbId: string,
    type: MediaType,
  ): Promise<MetaDetail | null> {
    const isTv = type === "series" || type === "tv";
    const tmdbId = await this.findTmdbId(imdbId, isTv);
    if (tmdbId === null) {
      return null;
    }
    return this.fetchDetail(tmdbId, type, imdbId);
  }

  async getEpisodes(imdbId: string): Promise<EpisodeRef[]> {
    const tmdbId = await this.findTmdbId(imdbId, true);
    if (tmdbId === null) {
      return [];
    }
    return this.episodesForTmdbId(tmdbId, imdbId);
  }

  /** Title search (§5). Returns movie/tv results as previews with "tmdb:" ids;
   *  persons are skipped (actor/director search is a later enhancement). */
  async search(query: string): Promise<MetaPreview[]> {
    const response = await this.fetch<TmdbListResponse>("/search/multi", {
      query,
      page: "1",
    });
    return (response?.results ?? [])
      .filter(
        (item) => item.media_type === "movie" || item.media_type === "tv",
      )
      .map((item) => this.toPreview(item));
  }

  /** Resolve a "tmdb:<id>" content id to detail directly — no IMDb pivot. */
  async getDetailById(
    id: ContentId,
    type: MediaType,
  ): Promise<MetaDetail | null> {
    const tmdbId = tmdbIdFromContentId(id);
    return tmdbId === null ? null : this.fetchDetail(tmdbId, type, id);
  }

  /** Episodes for a "tmdb:<id>" series content id. */
  async getEpisodesById(id: ContentId): Promise<EpisodeRef[]> {
    const tmdbId = tmdbIdFromContentId(id);
    return tmdbId === null ? [] : this.episodesForTmdbId(tmdbId, `tmdb:${tmdbId}`);
  }

  /** Map a "tmdb:<id>" (movie or series) id to its IMDb id for stream lookup
   *  (ADR-0012/0013). For a series this is the *show* IMDb id; the resolver
   *  re-attaches :S:E, which is the Stremio series stream key (ADR-0002). */
  async getImdbId(id: ContentId, type: MediaType): Promise<ContentId | null> {
    const tmdbId = tmdbIdFromContentId(id);
    if (tmdbId === null) {
      return null;
    }
    const isTv = type === "series" || type === "tv";
    const external = await this.fetch<TmdbExternalIds>(
      `/${isTv ? "tv" : "movie"}/${tmdbId}/external_ids`,
    );
    const imdbId = external?.imdb_id;
    return imdbId !== undefined && imdbId !== null && imdbId !== ""
      ? imdbId
      : null;
  }

  async getFeed(feed: FeedKind, opts?: FeedOpts): Promise<MetaPreview[]> {
    const page = String(opts?.page ?? 1);
    const path =
      feed === "trending"
        ? "/trending/all/week"
        : feed === "top_rated"
          ? "/movie/top_rated"
          : feed === "popular"
            ? "/movie/popular"
            : null; // "user_list" has no direct TMDB endpoint (Trakt — Phase 3)
    if (path === null) {
      return [];
    }
    const response = await this.fetch<TmdbListResponse>(path, { page });
    return (response?.results ?? []).map((item) => this.toPreview(item));
  }

  private toPreview(item: TmdbListItem): MetaPreview {
    const isTv =
      item.media_type === "tv" || item.first_air_date !== undefined;
    const date = item.release_date ?? item.first_air_date;
    const year =
      date !== undefined && date.length >= 4 ? date.slice(0, 4) : undefined;
    return {
      // TMDB endpoints don't return IMDb ids, so the id is namespaced with
      // "tmdb:" and preserved verbatim (§4.1). This id resolves to detail via
      // getDetailById; mapping tmdb→imdb for *stream* lookup is still later work.
      id: `tmdb:${item.id}`,
      type: isTv ? "series" : "movie",
      name: item.title ?? item.name ?? "",
      poster: this.image("w500", item.poster_path),
      releaseInfo: year,
    };
  }
}
