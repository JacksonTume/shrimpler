// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — the unified IPTV content model. Both ingestion paths
// (M3U classification and the Xtream Codes client) produce an `IptvContent`,
// which `createIptvAddon` turns into catalog/meta/stream shapes. Live channels
// reuse the M3U `Channel`; movies and series are VOD. Series episodes are either
// eager (M3U — everything is in the playlist) or lazy (`loadEpisodes`, Xtream —
// fetched on demand when a series detail opens, since one request per series at
// build time would be prohibitive).

import type { Channel } from "./parse-m3u";

export interface IptvMovie {
  /** Stable, colon-free id (namespaced into `iptv:movie:<id>`). */
  id: string;
  name: string;
  url: string;
  poster?: string;
  group?: string;
  description?: string;
  releaseInfo?: string;
  rating?: string;
  headers?: Record<string, string>;
}

export interface IptvEpisode {
  season: number;
  episode: number;
  url: string;
  name?: string;
  overview?: string;
  thumbnail?: string;
  headers?: Record<string, string>;
}

export interface IptvSeries {
  /** Stable, colon-free id (namespaced into `iptv:series:<id>`). */
  id: string;
  name: string;
  poster?: string;
  group?: string;
  description?: string;
  /** Eager episodes (M3U). Set this OR `loadEpisodes`, not both. */
  episodes?: IptvEpisode[];
  /** Lazy loader (Xtream) — resolved on first meta/stream access, then cached. */
  loadEpisodes?: () => Promise<IptvEpisode[]>;
}

export interface IptvContent {
  channels: Channel[];
  movies: IptvMovie[];
  series: IptvSeries[];
}

export function emptyIptvContent(): IptvContent {
  return { channels: [], movies: [], series: [] };
}

/** Concatenate content from multiple sources (M3U playlists + Xtream accounts). */
export function mergeIptvContent(parts: IptvContent[]): IptvContent {
  return {
    channels: parts.flatMap((p) => p.channels),
    movies: parts.flatMap((p) => p.movies),
    series: parts.flatMap((p) => p.series),
  };
}
