// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §4.1 — parse a ContentId into its parts. imdbId is the TMDB lookup pivot
// (§5); parsing is lenient (§4.1): unknown namespaces pass through untouched so
// non-IMDb addons still function — the metadata fallback simply won't apply.

import type { ContentId, ParsedId } from "../types/ids";

function isNumeric(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * "tt1234567"        → { imdbId }
 * "tt1234567:1:5"    → { imdbId, season, episode }   (imdbId:season:episode)
 * "kitsu:12345"      → { namespace: "kitsu" }        (no imdbId → no TMDB fallback)
 * "kitsu:12345:1:5"  → { namespace: "kitsu", season, episode }
 */
export function parseId(raw: ContentId): ParsedId {
  const parsed: ParsedId = { raw };
  const segments = raw.split(":");
  const head = segments[0] ?? "";

  if (/^tt\d+$/.test(head)) {
    parsed.imdbId = head;
  } else if (segments.length > 1 && !isNumeric(head)) {
    parsed.namespace = head;
  }

  // Trailing ":S:E" episode coordinates, when the last two segments are numeric.
  // Movies (no trailing coordinates) fall through untouched.
  const season = segments[segments.length - 2];
  const episode = segments[segments.length - 1];
  if (
    segments.length >= 3 &&
    season !== undefined &&
    episode !== undefined &&
    isNumeric(season) &&
    isNumeric(episode)
  ) {
    parsed.season = Number(season);
    parsed.episode = Number(episode);
  }

  return parsed;
}
