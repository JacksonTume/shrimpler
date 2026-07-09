// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — build an InternalAddon from IptvContent. It presents a
// manifest declaring live + VOD types (tv/channel/movie/series) under the
// `iptv:` idPrefix, plus catalog/meta/stream maps, so the addon engine fans out
// to it exactly like any HTTP addon and discovery/detail/playback reuse it.
//
// Id scheme (ADR-0006): `iptv:<kind>:<stableId>` — `iptv:live:<id>`,
// `iptv:movie:<id>`, `iptv:series:<id>`; series episodes are
// `iptv:series:<id>:<S>:<E>` so parseId derives S/E and continue-watching folds
// a series to one entry. Kinds are set explicitly (channels `live`, VOD `vod`) —
// internal addons bypass resource-client's type→kind mapping.

import type { InternalAddon } from "../addon/internal-addon";
import type { AddonManifest, CatalogDef } from "../types/addon";
import type { ContentId, MediaType } from "../types/ids";
import type { EpisodeRef, MetaDetail, MetaPreview } from "../types/meta";
import type { PlayableSource } from "../types/sources";
import type { Channel } from "./parse-m3u";
import type { IptvContent, IptvMovie, IptvSeries } from "./content";

export interface IptvAddonOptions {
  /** Addon id (default "org.shrimpler.iptv"). */
  id?: string;
}

const DEFAULT_ID = "org.shrimpler.iptv";
const LIVE_PREFIX = "iptv:live:";
const MOVIE_PREFIX = "iptv:movie:";
const SERIES_PREFIX = "iptv:series:";
const CATALOG_LIVE = "iptv:live";
const CATALOG_MOVIES = "iptv:movies";
const CATALOG_SERIES = "iptv:series";
/** Matches an episode content id `iptv:series:<id>:<S>:<E>` → captures the series id. */
const EPISODE_RE = /^(iptv:series:.+):\d+:\d+$/;

// ---- live channels ---------------------------------------------------------

function channelPreview(channel: Channel): MetaPreview {
  const preview: MetaPreview = {
    id: `${LIVE_PREFIX}${channel.id}`,
    type: "tv",
    name: channel.name,
    posterShape: "square",
  };
  if (channel.logo !== undefined) {
    preview.poster = channel.logo;
  }
  return preview;
}

function channelDetail(channel: Channel): MetaDetail {
  const detail: MetaDetail = {
    id: `${LIVE_PREFIX}${channel.id}`,
    type: "tv",
    name: channel.name,
    posterShape: "square",
  };
  if (channel.logo !== undefined) {
    detail.poster = channel.logo;
    detail.logo = channel.logo;
  }
  if (channel.group !== undefined) {
    detail.genres = [channel.group];
  }
  return detail;
}

function channelSource(channel: Channel, addonId: string): PlayableSource {
  const source: PlayableSource = {
    id: `${LIVE_PREFIX}${channel.id}#live`,
    kind: "live",
    url: channel.url,
    title: channel.name,
    source: addonId,
  };
  if (channel.headers !== undefined) {
    source.headers = channel.headers;
  }
  return source;
}

// ---- movies ----------------------------------------------------------------

function moviePreview(movie: IptvMovie): MetaPreview {
  const preview: MetaPreview = {
    id: `${MOVIE_PREFIX}${movie.id}`,
    type: "movie",
    name: movie.name,
    posterShape: "poster",
  };
  if (movie.poster !== undefined) preview.poster = movie.poster;
  if (movie.releaseInfo !== undefined) preview.releaseInfo = movie.releaseInfo;
  return preview;
}

function movieDetail(movie: IptvMovie): MetaDetail {
  const detail: MetaDetail = {
    id: `${MOVIE_PREFIX}${movie.id}`,
    type: "movie",
    name: movie.name,
    posterShape: "poster",
  };
  if (movie.poster !== undefined) detail.poster = movie.poster;
  if (movie.description !== undefined) detail.description = movie.description;
  if (movie.releaseInfo !== undefined) detail.releaseInfo = movie.releaseInfo;
  if (movie.rating !== undefined) detail.imdbRating = movie.rating;
  if (movie.group !== undefined) detail.genres = [movie.group];
  return detail;
}

function movieSource(movie: IptvMovie, addonId: string): PlayableSource {
  const source: PlayableSource = {
    id: `${MOVIE_PREFIX}${movie.id}#vod`,
    kind: "vod",
    url: movie.url,
    title: movie.name,
    source: addonId,
  };
  if (movie.headers !== undefined) source.headers = movie.headers;
  return source;
}

// ---- series ----------------------------------------------------------------

function seriesPreview(series: IptvSeries): MetaPreview {
  const preview: MetaPreview = {
    id: `${SERIES_PREFIX}${series.id}`,
    type: "series",
    name: series.name,
    posterShape: "poster",
  };
  if (series.poster !== undefined) preview.poster = series.poster;
  return preview;
}

function seriesBaseDetail(series: IptvSeries): MetaDetail {
  const detail: MetaDetail = {
    id: `${SERIES_PREFIX}${series.id}`,
    type: "series",
    name: series.name,
    posterShape: "poster",
  };
  if (series.poster !== undefined) detail.poster = series.poster;
  if (series.description !== undefined) detail.description = series.description;
  if (series.group !== undefined) detail.genres = [series.group];
  return detail;
}

interface ResolvedSeries {
  detail: MetaDetail;
  sources: Map<ContentId, PlayableSource>;
}

/**
 * Build an internal IPTV addon from unified content. Channels and movies are
 * precomputed (O(1) lookups); series episodes are resolved on first access and
 * cached, so an Xtream account with hundreds of series costs one request per
 * series *opened*, not one per series at build time.
 */
export function createIptvAddon(
  content: IptvContent,
  options: IptvAddonOptions = {},
): InternalAddon {
  const addonId = options.id ?? DEFAULT_ID;

  const liveCatalog = content.channels.map(channelPreview);
  const movieCatalog = content.movies.map(moviePreview);
  const seriesCatalog = content.series.map(seriesPreview);

  const channelById = new Map<ContentId, Channel>();
  for (const channel of content.channels) {
    channelById.set(`${LIVE_PREFIX}${channel.id}`, channel);
  }
  const movieById = new Map<ContentId, IptvMovie>();
  for (const movie of content.movies) {
    movieById.set(`${MOVIE_PREFIX}${movie.id}`, movie);
  }
  const seriesById = new Map<ContentId, IptvSeries>();
  for (const series of content.series) {
    seriesById.set(`${SERIES_PREFIX}${series.id}`, series);
  }

  // Series episodes + their sources, resolved once per series and cached.
  const seriesResolutions = new Map<ContentId, Promise<ResolvedSeries>>();

  async function resolveSeries(
    seriesContentId: ContentId,
  ): Promise<ResolvedSeries | null> {
    const series = seriesById.get(seriesContentId);
    if (series === undefined) {
      return null;
    }
    let pending = seriesResolutions.get(seriesContentId);
    if (pending === undefined) {
      pending = (async (): Promise<ResolvedSeries> => {
        const episodes =
          series.episodes ??
          (series.loadEpisodes !== undefined
            ? await series.loadEpisodes()
            : []);
        const videos: EpisodeRef[] = [];
        const sources = new Map<ContentId, PlayableSource>();
        for (const ep of episodes) {
          const epId = `${seriesContentId}:${ep.season}:${ep.episode}`;
          const ref: EpisodeRef = {
            id: epId,
            season: ep.season,
            episode: ep.episode,
          };
          if (ep.name !== undefined) ref.name = ep.name;
          if (ep.overview !== undefined) ref.overview = ep.overview;
          if (ep.thumbnail !== undefined) ref.thumbnail = ep.thumbnail;
          videos.push(ref);

          const source: PlayableSource = {
            id: `${epId}#vod`,
            kind: "vod",
            url: ep.url,
            title: ep.name ?? `S${ep.season}E${ep.episode}`,
            source: addonId,
          };
          if (ep.headers !== undefined) source.headers = ep.headers;
          sources.set(epId, source);
        }
        return { detail: { ...seriesBaseDetail(series), videos }, sources };
      })();
      seriesResolutions.set(seriesContentId, pending);
    }
    return pending;
  }

  const catalogs: CatalogDef[] = [
    { type: "tv", id: CATALOG_LIVE, name: "Live TV" },
    { type: "movie", id: CATALOG_MOVIES, name: "Movies" },
    { type: "series", id: CATALOG_SERIES, name: "Series" },
  ];

  const manifest: AddonManifest = {
    id: addonId,
    name: "IPTV",
    version: "1.0.0",
    resources: ["catalog", "meta", "stream"],
    types: ["tv", "channel", "movie", "series"],
    idPrefixes: ["iptv:"],
    catalogs,
  };

  return {
    manifest,

    getCatalog(type: MediaType, catalogId: string): Promise<MetaPreview[]> {
      if (catalogId === CATALOG_LIVE && (type === "tv" || type === "channel")) {
        return Promise.resolve(liveCatalog);
      }
      if (catalogId === CATALOG_MOVIES && type === "movie") {
        return Promise.resolve(movieCatalog);
      }
      if (catalogId === CATALOG_SERIES && type === "series") {
        return Promise.resolve(seriesCatalog);
      }
      return Promise.resolve([]);
    },

    async getMeta(contentId: ContentId): Promise<MetaDetail | null> {
      const channel = channelById.get(contentId);
      if (channel !== undefined) {
        return channelDetail(channel);
      }
      const movie = movieById.get(contentId);
      if (movie !== undefined) {
        return movieDetail(movie);
      }
      if (seriesById.has(contentId)) {
        return (await resolveSeries(contentId))?.detail ?? null;
      }
      return null;
    },

    async getStreams(contentId: ContentId): Promise<PlayableSource[]> {
      const channel = channelById.get(contentId);
      if (channel !== undefined) {
        return [channelSource(channel, addonId)];
      }
      const movie = movieById.get(contentId);
      if (movie !== undefined) {
        return [movieSource(movie, addonId)];
      }
      // An episode id → resolve its series and return the matching source.
      const episodeMatch = EPISODE_RE.exec(contentId);
      if (episodeMatch !== null) {
        const resolved = await resolveSeries(episodeMatch[1]!);
        const source = resolved?.sources.get(contentId);
        return source === undefined ? [] : [source];
      }
      return []; // a bare series id has no direct stream (play its episodes)
    },

    getSubtitles(): Promise<never[]> {
      return Promise.resolve([]);
    },
  };
}
