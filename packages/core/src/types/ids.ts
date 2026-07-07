// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §4.1 — Identifiers. The Stremio ID convention is the universal join key.

/**
 * A content identifier. IMDb-style is the interop standard.
 * Movie:   "tt1234567"
 * Episode: "tt1234567:1:5"   (imdbId:season:episode)
 * Some addons use their own prefixed ids ("kitsu:...", "mal:...") — preserve verbatim.
 */
export type ContentId = string;

export type MediaType = "movie" | "series" | "tv" | "channel" | string; // open-ended per protocol

export interface ParsedId {
  raw: ContentId;
  imdbId?: string; // "tt1234567" when derivable — the TMDB lookup pivot
  season?: number;
  episode?: number;
  namespace?: string; // e.g. "kitsu" when id is "kitsu:12345"
}
