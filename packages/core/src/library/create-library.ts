// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §3, §10 step 8 — Library: continue-watching (watchlist/installed-sources
// later). Persists watch progress via the injected StorageAdapter (ADR-0014).
// Pure TS: the clock is injectable (like the TTL cache) so eviction is testable
// and defaults to Date.now(). Records are keyed by *detail* id — a series folds
// to one entry pointing at the latest-watched episode, not one per episode.

import type { StorageAdapter } from "../adapters/storage";
import type { ContentId, MediaType } from "../types/ids";
import { parseId } from "../metadata/parse-id";

/** A continue-watching record. `id` is the detail id (show id for a series) used
 *  to open detail; `playableId` is the exact movie/episode last watched, used to
 *  resume that specific item. */
export interface ProgressEntry {
  id: ContentId;
  playableId: ContentId;
  type: MediaType;
  positionSec: number;
  durationSec: number;
  updatedAt: number; // epoch ms
  name?: string; // display snapshot for the home row
  poster?: string;
  season?: number; // series only
  episode?: number;
}

/** What a caller reports on a `timeupdate`; the library stamps updatedAt. */
export interface ProgressInput {
  /** The playable content id (movie id, or episode id "show:S:E"). */
  id: ContentId;
  type: MediaType;
  positionSec: number;
  durationSec: number;
  name?: string;
  poster?: string;
}

export interface Library {
  /**
   * Record progress for a playable item. A near-complete item (≥ 95%) is
   * treated as watched and evicted from continue-watching; trivially small
   * progress (< 15s) is ignored so a brief open doesn't create an entry.
   */
  recordProgress(input: ProgressInput): Promise<void>;
  /** The continue-watching entry for a content id (playable or detail id), or
   *  null. Strips :S:E so an episode id finds its show entry. */
  getEntry(id: ContentId): Promise<ProgressEntry | null>;
  /** All continue-watching entries, most-recently-updated first. */
  listContinueWatching(): Promise<ProgressEntry[]>;
  /** Drop a continue-watching entry (id is a playable or detail id). */
  remove(id: ContentId): Promise<void>;
}

export interface LibraryDeps {
  storage: StorageAdapter;
  /** Injectable clock (default Date.now) so eviction timing is testable. */
  now?: () => number;
}

const KEY_PREFIX = "library/cw/";
/** At/above this watched fraction, the item counts as finished and is evicted. */
const COMPLETE_RATIO = 0.95;
/** Below this many seconds, progress is too small to be worth resuming. */
const MIN_POSITION_SEC = 15;

/** The detail id for a content id: a series episode ("show:S:E") folds to its
 *  show id; a movie id is unchanged. */
function detailIdOf(id: ContentId): ContentId {
  const { season, episode } = parseId(id);
  if (season !== undefined && episode !== undefined) {
    const segments = id.split(":");
    return segments.slice(0, segments.length - 2).join(":");
  }
  return id;
}

export function createLibrary(deps: LibraryDeps): Library {
  const { storage } = deps;
  const now = deps.now ?? (() => Date.now());
  const keyOf = (detailId: ContentId): string => `${KEY_PREFIX}${detailId}`;

  return {
    async recordProgress(input: ProgressInput): Promise<void> {
      const detailId = detailIdOf(input.id);
      const key = keyOf(detailId);

      // Finished → evict rather than persist a completed item.
      if (
        input.durationSec > 0 &&
        input.positionSec / input.durationSec >= COMPLETE_RATIO
      ) {
        await storage.delete(key);
        return;
      }
      // Too early to be a meaningful resume point.
      if (input.positionSec < MIN_POSITION_SEC) {
        return;
      }

      const { season, episode } = parseId(input.id);
      const entry: ProgressEntry = {
        id: detailId,
        playableId: input.id,
        type: input.type,
        positionSec: input.positionSec,
        durationSec: input.durationSec,
        updatedAt: now(),
        name: input.name,
        poster: input.poster,
        season,
        episode,
      };
      await storage.set(key, entry);
    },

    getEntry(id: ContentId): Promise<ProgressEntry | null> {
      return storage.get<ProgressEntry>(keyOf(detailIdOf(id)));
    },

    async listContinueWatching(): Promise<ProgressEntry[]> {
      const keys = await storage.keys(KEY_PREFIX);
      const entries = await Promise.all(
        keys.map((key) => storage.get<ProgressEntry>(key)),
      );
      return entries
        .filter((entry): entry is ProgressEntry => entry !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    remove(id: ContentId): Promise<void> {
      return storage.delete(keyOf(detailIdOf(id)));
    },
  };
}
