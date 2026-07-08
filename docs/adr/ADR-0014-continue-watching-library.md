# ADR-0014 — Continue-watching library: data model, keys, throttle, eviction

- Status: Accepted
- Date: 2026-07-09

## Context

The spec assigns "library state" (watchlist, continue-watching, installed
sources) to the core `library` package (§3) and specifies exactly one concrete
flow: §10 step 8 — _"`timeupdate` → core updates continue-watching via
StorageAdapter."_ It defines no data model, key convention, write cadence,
completion semantics, or home-screen surfacing. With real playback now landed
(ADR-0013), continue-watching is the last Phase 1 feature; those gaps must be
decided.

## Decision

Implement continue-watching in `core/src/library` (`createLibrary`), persisting
through the injected `StorageAdapter` with an injectable clock (mirroring the TTL
cache) so eviction timing is testable.

- **Data model — one entry per title, keyed by detail id.** A `ProgressEntry`
  carries both an `id` (the _detail_ id — the show id for a series, the movie id
  for a movie — used to open detail and as the storage key) and a `playableId`
  (the exact movie/episode last watched — used to resume that specific item),
  plus `positionSec`/`durationSec`/`updatedAt` and a `name`/`poster` snapshot for
  the home row (re-resolving metadata per row would be costly and needs the
  network). A **series folds to a single entry** pointing at the latest-watched
  episode (with `season`/`episode`), not one row per episode.
- **Key scheme.** Entries live under the `library/cw/<detailId>` prefix;
  `listContinueWatching` enumerates them via `StorageAdapter.keys(prefix)` — the
  one structural hint the spec's `keys(prefix?)` signature offers.
- **Write cadence.** The `useWatchProgress` view-model throttles: a `record`
  driven by `timeupdate` writes only after ~10s of playback movement, and
  `flush` writes immediately on pause / ended / unmount. This keeps storage
  writes bounded without losing the last position.
- **Completion & noise thresholds.** At/above **95%** watched, the item counts as
  finished and is **evicted** rather than persisted (so a completed title leaves
  the row). Below **15s** of progress, nothing is recorded (a brief open should
  not create an entry). Both live in the core so every shell shares them.
- **Resume.** When a title is replayed, the playback screen seeks to the saved
  position — but only when the saved `playableId` matches the exact item being
  played (so opening a _different_ episode starts at 0), and only once, so it
  doesn't fight a user scrubbing.
- **Home surfacing.** A "Continue watching" row on the home screen lists entries
  most-recently-updated first; selecting a card opens the **detail** screen for
  the title (from which the user plays, and resume applies). The row is hidden
  when empty (empty-by-default still holds, §9.1).

## Consequences

- Continue-watching works end to end: play → progress persists locally → the home
  row shows it → reopening resumes. First library feature; Phase 1 is complete.
- `core.library` is the seam the remaining library domains (watchlist,
  installed-sources views) grow behind, with the same StorageAdapter persistence.
- All state is **local and neutral** (ADR-0007): a name/poster snapshot is stored,
  never a source URL or stream. No account or network is involved.
- Deferred: cross-device sync (a Trakt provider, Phase 3); an IndexedDB
  `StorageAdapter` for scale (Phase 2 — localStorage is fine for the entry
  counts here); a dedicated watchlist/“my library” screen; eviction of very old
  entries (the list is naturally small and user-driven for now).
