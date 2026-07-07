// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §4.2 — Core content types.

import type { ContentId, MediaType } from "./ids";

export interface MetaPreview {
  // catalog row item — lightweight
  id: ContentId;
  type: MediaType;
  name: string;
  poster?: string;
  posterShape?: "poster" | "landscape" | "square";
  releaseInfo?: string;
}

export interface MetaDetail extends MetaPreview {
  // detail screen — full
  background?: string;
  logo?: string;
  description?: string;
  cast?: string[];
  director?: string[];
  genres?: string[];
  runtime?: string;
  released?: string;
  videos?: EpisodeRef[]; // for series: episode list
  imdbRating?: string;
}

export interface EpisodeRef {
  id: ContentId; // "tt…:S:E"
  season: number;
  episode: number;
  name?: string;
  overview?: string;
  released?: string;
  thumbnail?: string;
}
