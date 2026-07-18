// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8.2 / ADR-0015 — EPG data model. Times are UTC epoch ms (the parser
// timezone-normalizes on ingest), so now/next is a plain numeric comparison
// against the current time and needs no per-render tz handling.

/** One programme in the guide, times normalized to UTC epoch ms. */
export interface EpgProgramme {
  /** Start time, UTC epoch ms. */
  start: number;
  /** Stop time, UTC epoch ms. */
  stop: number;
  title: string;
  desc?: string;
  category?: string;
}

/** What's airing now and what's on next for one channel. */
export interface NowNext {
  now?: EpgProgramme;
  next?: EpgProgramme;
}

/**
 * Persisted per-source snapshot body: programmes bucketed by the IPTV channel id
 * they were matched to (the `<channel.id>` inside `iptv:live:<channel.id>`),
 * sorted by start. Matching is resolved at refresh time so a now/next lookup is a
 * direct keyed read. Trimmed to a bounded time window to cap size.
 */
export interface EpgSnapshotBody {
  byChannel: Record<string, EpgProgramme[]>;
}
