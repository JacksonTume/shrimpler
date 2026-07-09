// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — classify flat M3U entries into live / movie / series.
// M3U has no content-type field, so this is heuristic (documented as best-effort):
// URL path segment (/live/, /movie/, /series/ — Xtream-style exports), container
// extension (.ts/.m3u8 = live, .mkv/.mp4/… = VOD), and group-title keywords.
// Series are folded from flat episode entries by parsing SxxExx / NxM / "Season x
// Episode y" out of the display name — the fragile part, kept isolated + tested.
// The clean path is the Xtream client (xtream.ts); this exists to surface VOD on
// the M3U playlists users already have.

import type { Channel } from "./parse-m3u";
import type {
  IptvContent,
  IptvEpisode,
  IptvMovie,
  IptvSeries,
} from "./content";

const VOD_EXTENSIONS = new Set([
  "mp4",
  "mkv",
  "avi",
  "m4v",
  "mov",
  "flv",
  "wmv",
  "webm",
  "mpg",
  "mpeg",
]);

/** Lower-cased file extension of a URL's last path segment, "" if none. */
function extensionOf(url: string): string {
  const path = url.split(/[?#]/)[0] ?? "";
  const segment = path.slice(path.lastIndexOf("/") + 1);
  const dot = segment.lastIndexOf(".");
  return dot === -1 ? "" : segment.slice(dot + 1).toLowerCase();
}

interface EpisodeMatch {
  season: number;
  episode: number;
  /** Series title (text before the pattern). */
  seriesTitle: string;
  /** Episode title (text after the pattern), or undefined. */
  episodeTitle?: string;
}

const EPISODE_PATTERNS: RegExp[] = [
  /[Ss](\d{1,2})[\s._-]*[Ee](\d{1,3})/,
  /\b(\d{1,2})x(\d{1,3})\b/,
  /Season\s*(\d+)\s*Episode\s*(\d+)/i,
];

/** Parse a season/episode marker out of a display name, if present. */
function parseEpisode(name: string): EpisodeMatch | null {
  for (const pattern of EPISODE_PATTERNS) {
    const match = pattern.exec(name);
    if (match !== null && match.index !== undefined) {
      const before = name
        .slice(0, match.index)
        .replace(/[\s._-]+$/, "")
        .trim();
      const after = name
        .slice(match.index + match[0].length)
        .replace(/^[\s._-]+/, "")
        .trim();
      return {
        season: Number(match[1]),
        episode: Number(match[2]),
        seriesTitle: before !== "" ? before : name.trim(),
        ...(after !== "" ? { episodeTitle: after } : {}),
      };
    }
  }
  return null;
}

type Kind =
  | { kind: "live" }
  | { kind: "movie" }
  | { kind: "series"; match: EpisodeMatch };

/** Decide an entry's kind from URL path, extension, group-title, and name. */
function classifyEntry(entry: Channel): Kind {
  const path = (entry.url.split(/[?#]/)[0] ?? "").toLowerCase();
  const ext = extensionOf(entry.url);
  const group = (entry.group ?? "").toUpperCase();

  const pathVod = path.includes("/movie/") || path.includes("/series/");
  const groupVod =
    /\b(VOD|MOVIE|MOVIES|FILM|FILMS|CINEMA|SERIE|SERIES|SEASON|SHOWS)\b/.test(
      group,
    );
  const looksVod = pathVod || VOD_EXTENSIONS.has(ext) || groupVod;

  if (!looksVod) {
    return { kind: "live" };
  }

  // VOD: a parsable episode marker makes it a series; otherwise a movie. A
  // /series/ path or "series" group without a marker falls back to movie.
  const match = parseEpisode(entry.name);
  if (match !== null) {
    return { kind: "series", match };
  }
  return { kind: "movie" };
}

function entryToMovie(entry: Channel): IptvMovie {
  const movie: IptvMovie = { id: entry.id, name: entry.name, url: entry.url };
  if (entry.logo !== undefined) movie.poster = entry.logo;
  if (entry.group !== undefined) movie.group = entry.group;
  if (entry.headers !== undefined) movie.headers = entry.headers;
  return movie;
}

function entryToEpisode(entry: Channel, match: EpisodeMatch): IptvEpisode {
  const episode: IptvEpisode = {
    season: match.season,
    episode: match.episode,
    url: entry.url,
  };
  if (match.episodeTitle !== undefined) episode.name = match.episodeTitle;
  if (entry.logo !== undefined) episode.thumbnail = entry.logo;
  if (entry.headers !== undefined) episode.headers = entry.headers;
  return episode;
}

/** Colon/whitespace-free id from a series title, deduped against `used`. */
function seriesId(title: string, used: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "series";
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

/**
 * Partition parsed M3U entries into live channels, movies, and series (folding
 * flat episode entries into series by title). Order within each kind follows
 * first appearance.
 */
export function classifyM3U(entries: Channel[]): IptvContent {
  const channels: Channel[] = [];
  const movies: IptvMovie[] = [];
  // Group episodes by lower-cased series title (insertion-ordered).
  const seriesByTitle = new Map<string, IptvSeries>();
  const usedSeriesIds = new Set<string>();

  for (const entry of entries) {
    const classified = classifyEntry(entry);
    if (classified.kind === "live") {
      channels.push(entry);
    } else if (classified.kind === "movie") {
      movies.push(entryToMovie(entry));
    } else {
      const titleKey = classified.match.seriesTitle.toLowerCase();
      let series = seriesByTitle.get(titleKey);
      if (series === undefined) {
        series = {
          id: seriesId(classified.match.seriesTitle, usedSeriesIds),
          name: classified.match.seriesTitle,
          episodes: [],
        };
        if (entry.logo !== undefined) series.poster = entry.logo;
        if (entry.group !== undefined) series.group = entry.group;
        seriesByTitle.set(titleKey, series);
      }
      series.episodes!.push(entryToEpisode(entry, classified.match));
    }
  }

  return { channels, movies, series: [...seriesByTitle.values()] };
}
