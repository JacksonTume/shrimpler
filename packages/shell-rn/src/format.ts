// SPDX-License-Identifier: AGPL-3.0-or-later
// Small pure presentation helpers shared by the RN screens. They live outside the
// components so they are unit-testable: the shell-rn Vitest project runs in a
// plain node environment (no device, no RN renderer — see vitest.config.ts), so
// screen rendering is not covered there, but this logic is.
//
// Nothing here is user-facing copy; all display strings still route through
// shared-ui/labels (§9.2 / ADR-0007).

import type { EpisodeRef, ProgressEntry } from "@shrimpler/core";

/** Seconds → m:ss (or h:mm:ss) for the player's transport readout. */
export function formatTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) {
    return "0:00";
  }
  const total = Math.floor(totalSec);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Watch progress as a 0..1 fraction; 0 when the duration is unknown. */
export function progressFraction(entry: ProgressEntry): number {
  if (entry.durationSec <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, entry.positionSec / entry.durationSec));
}

/** " · S2E5" for a series entry, "" for a movie or an unpositioned entry. */
export function episodeTag(entry: ProgressEntry): string {
  return entry.season !== undefined && entry.episode !== undefined
    ? ` · S${entry.season}E${entry.episode}`
    : "";
}

/** The distinct season numbers present in an episode list, ascending. */
export function seasonsOf(episodes: readonly EpisodeRef[]): number[] {
  const seasons = new Set<number>();
  for (const episode of episodes) {
    seasons.add(episode.season);
  }
  return [...seasons].sort((a, b) => a - b);
}
