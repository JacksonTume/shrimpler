// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — Xtream Codes client. Unlike M3U (a flat list needing
// heuristic classification), Xtream's player_api.php exposes live / VOD / series
// as distinct, typed endpoints with real metadata, so it is the clean IPTV VOD
// path. Live + movies are fetched eagerly; series *lists* are fetched eagerly
// (for the catalog + poster/plot) but their episodes lazily — one get_series_info
// request per series *opened*, not per series at build time (a subscription can
// carry thousands). Stream URLs are constructed deterministically from ids.
//
// Credentials are user-supplied and stored locally (§14.3) — never bundled.

import type { HttpAdapter } from "../adapters/http";
import type { Channel } from "./parse-m3u";
import type {
  IptvContent,
  IptvEpisode,
  IptvMovie,
  IptvSeries,
} from "./content";

export interface XtreamAccount {
  /** Server base, e.g. "http://example.com:8080" (no trailing path). */
  host: string;
  username: string;
  password: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;

// Minimal shapes for the player_api.php fields we read. Numeric fields arrive as
// number or string depending on the server, so ids are coerced with String().
interface XtreamCategory {
  category_id: number | string;
  category_name: string;
}
interface XtreamLiveStream {
  stream_id: number | string;
  name: string;
  stream_icon?: string;
  category_id?: number | string;
}
interface XtreamVodStream {
  stream_id: number | string;
  name: string;
  stream_icon?: string;
  category_id?: number | string;
  container_extension?: string;
  rating?: number | string;
}
interface XtreamSeriesEntry {
  series_id: number | string;
  name: string;
  cover?: string;
  plot?: string;
  category_id?: number | string;
}
interface XtreamEpisode {
  id: number | string;
  episode_num: number | string;
  title?: string;
  container_extension?: string;
  season?: number | string;
  info?: { movie_image?: string; plot?: string };
}
interface XtreamSeriesInfo {
  episodes?: Record<string, XtreamEpisode[]>;
}

export interface FetchXtreamDeps {
  http: HttpAdapter;
  account: XtreamAccount;
  /** Namespace prefix keeping ids unique across accounts + M3U (e.g. "xt0"). */
  accountKey: string;
  timeoutMs?: number;
}

function baseOf(account: XtreamAccount): string {
  return account.host.trim().replace(/\/+$/, "");
}

function apiUrl(base: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${base}/player_api.php?${query}`;
}

async function apiGet<T>(
  http: HttpAdapter,
  url: string,
  timeoutMs: number,
): Promise<T> {
  const response = await http.get(url, { timeoutMs });
  if (!response.ok) {
    throw new Error(`Xtream request failed (${response.status})`);
  }
  return response.json<T>();
}

/** category_id → category_name, best-effort (cosmetic grouping). */
async function categoryNames(
  http: HttpAdapter,
  base: string,
  account: XtreamAccount,
  action: string,
  timeoutMs: number,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const categories = await apiGet<XtreamCategory[]>(
      http,
      apiUrl(base, {
        username: account.username,
        password: account.password,
        action,
      }),
      timeoutMs,
    );
    for (const category of categories) {
      map.set(String(category.category_id), category.category_name);
    }
  } catch {
    // Categories are cosmetic; a failure just means no group labels.
  }
  return map;
}

/** Load one series' episodes on demand (called by the addon's getMeta). */
function makeEpisodeLoader(
  http: HttpAdapter,
  base: string,
  account: XtreamAccount,
  seriesId: string,
  timeoutMs: number,
): () => Promise<IptvEpisode[]> {
  return async (): Promise<IptvEpisode[]> => {
    const info = await apiGet<XtreamSeriesInfo>(
      http,
      apiUrl(base, {
        username: account.username,
        password: account.password,
        action: "get_series_info",
        series_id: seriesId,
      }),
      timeoutMs,
    );
    const episodes: IptvEpisode[] = [];
    for (const [seasonKey, seasonEpisodes] of Object.entries(
      info.episodes ?? {},
    )) {
      for (const ep of seasonEpisodes) {
        const episode: IptvEpisode = {
          season: Number(ep.season ?? seasonKey),
          episode: Number(ep.episode_num),
          url: `${base}/series/${account.username}/${account.password}/${String(
            ep.id,
          )}.${ep.container_extension ?? "mp4"}`,
        };
        if (ep.title !== undefined) episode.name = ep.title;
        if (ep.info?.movie_image !== undefined)
          episode.thumbnail = ep.info.movie_image;
        if (ep.info?.plot !== undefined) episode.overview = ep.info.plot;
        episodes.push(episode);
      }
    }
    return episodes;
  };
}

/**
 * Fetch an Xtream account into IptvContent: live channels + movies eagerly,
 * series with lazy episode loaders. Throws on a required-endpoint failure so the
 * caller can isolate the whole account (as with an M3U playlist).
 */
export async function fetchXtreamContent(
  deps: FetchXtreamDeps,
): Promise<IptvContent> {
  const { http, account, accountKey } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = baseOf(account);
  const q = (action: string): string =>
    apiUrl(base, {
      username: account.username,
      password: account.password,
      action,
    });

  const [liveCats, vodCats, seriesCats] = await Promise.all([
    categoryNames(http, base, account, "get_live_categories", timeoutMs),
    categoryNames(http, base, account, "get_vod_categories", timeoutMs),
    categoryNames(http, base, account, "get_series_categories", timeoutMs),
  ]);

  const [liveStreams, vodStreams, seriesList] = await Promise.all([
    apiGet<XtreamLiveStream[]>(http, q("get_live_streams"), timeoutMs),
    apiGet<XtreamVodStream[]>(http, q("get_vod_streams"), timeoutMs),
    apiGet<XtreamSeriesEntry[]>(http, q("get_series"), timeoutMs),
  ]);

  const channels: Channel[] = liveStreams.map((s) => {
    const channel: Channel = {
      id: `${accountKey}-${String(s.stream_id)}`,
      name: s.name,
      url: `${base}/live/${account.username}/${account.password}/${String(
        s.stream_id,
      )}.m3u8`,
    };
    if (s.stream_icon !== undefined) channel.logo = s.stream_icon;
    const group = liveCats.get(String(s.category_id));
    if (group !== undefined) channel.group = group;
    return channel;
  });

  const movies: IptvMovie[] = vodStreams.map((s) => {
    const movie: IptvMovie = {
      id: `${accountKey}-${String(s.stream_id)}`,
      name: s.name,
      url: `${base}/movie/${account.username}/${account.password}/${String(
        s.stream_id,
      )}.${s.container_extension ?? "mp4"}`,
    };
    if (s.stream_icon !== undefined) movie.poster = s.stream_icon;
    if (s.rating !== undefined) movie.rating = String(s.rating);
    const group = vodCats.get(String(s.category_id));
    if (group !== undefined) movie.group = group;
    return movie;
  });

  const series: IptvSeries[] = seriesList.map((s) => {
    const seriesId = `${accountKey}-${String(s.series_id)}`;
    const item: IptvSeries = {
      id: seriesId,
      name: s.name,
      loadEpisodes: makeEpisodeLoader(
        http,
        base,
        account,
        String(s.series_id),
        timeoutMs,
      ),
    };
    if (s.cover !== undefined) item.poster = s.cover;
    if (s.plot !== undefined) item.description = s.plot;
    const group = seriesCats.get(String(s.category_id));
    if (group !== undefined) item.group = group;
    return item;
  });

  return { channels, movies, series };
}
