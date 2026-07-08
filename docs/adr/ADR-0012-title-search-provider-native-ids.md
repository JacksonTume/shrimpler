# ADR-0012 — Title search + provider-native metadata ids

- Status: Accepted
- Date: 2026-07-08

## Context

The detail screen (Phase 1) had no real entry point — only a dev "open by ID"
trigger — because reaching detail needs a `ContentId` and there is no
browse/catalog UI yet (Phase 3). ADR-0003 fixed metadata resolution to pivot on
the IMDb id: the provider (TMDB) is reached via `/find?external_source=imdb_id`.
That makes a title search awkward and, worse, leaves **TMDB-only titles**
unreachable — an unreleased film often has no IMDb id at all, so there is no
`tt…` id to pivot on. We needed a search whose results open even when no IMDb id
exists. The roadmap had left the search backend open (addon catalog `search`
extra vs a TMDB search method).

## Decision

Add **title search backed by the metadata provider** (TMDB in v1) and resolve
results through **provider-native content ids**, so an IMDb pivot is not
required.

- `MetadataResolver` gains `search(query)`; `MetadataProvider` gains optional
  `search`, `getDetailById`, `getEpisodesById`. `TmdbProvider.search` uses
  `/search/multi` (movies + TV; persons skipped — the future actor/director
  axis).
- Results keep their provider-native ids — `tmdb:<id>` — verbatim (§4.1). A
  namespaced id resolves by **matching `provider.id` to the id's namespace**:
  the resolver routes `tmdb:…` to the TMDB provider's `getDetailById` /
  `getEpisodesById`, which fetch `/movie|/tv/{id}` directly — no `/find` hop.
- This **extends ADR-0003** (does not supersede it): addon meta still wins; for
  a provider-native id the owning provider is asked directly, ahead of the imdb
  path; the imdb pivot stays for `tt…` ids.
- Search is **not cached** (query-specific, interactive); detail/episodes stay
  TTL-cached.

## Consequences

- TMDB-only titles (no IMDb id) now open to a full detail screen — the
  previously dead case.
- **Streams still pivot on IMDb ids.** A `tmdb:` id resolves _metadata_ but not
  addon _streams_, which key on `tt…` / addon prefixes. Playback from a
  TMDB-only result therefore needs a tmdb→imdb hop, deferred with the stream
  picker; the ADR-0005 resolver seam is untouched.
- Routing by `provider.id === namespace` is generic: a future Trakt/TVDB
  provider gets native-id resolution for free by owning its namespace.
- Searching by other facets (actor, director, genre, year) layers on the same
  `search` surface later; only title is wired now. Merging addon catalog
  `search` (§6.1) into results is likewise deferred.
- The runtime TMDB key (entered on the settings screen) is applied by
  **rebuilding the core**, not mutating it: `createCore` takes its providers at
  construction (§7.3), so the shell composes a fresh `Core` and swaps the
  `CoreProvider` value. This keeps the core-construction contract (ADR-0001)
  frozen; addon state and the metadata cache are storage-backed, so a rebuild
  loses nothing.
