# ADR-0006 — IPTV modeled as an internal addon, not a parallel subsystem

- Status: Accepted
- Date: 2026-07-07

## Context

IPTV (M3U/Xtream + EPG) could easily become a second app bolted onto the
first, duplicating discovery, search, and playback plumbing (spec §8).

## Decision

The IPTV module emits the same catalog/meta/stream shapes as any addon
(`type: 'tv' | 'channel'`), so discovery, search, and the player layer reuse
it for free.

## Consequences

Realized across Phase 2 increments 1–3 (M3U live, hls.js live playback, then VOD
via M3U classification + Xtream). EPG remains a later increment, so this ADR is
not fully closed.

- **The seam is an `InternalAddon` interface** (`core/src/addon/internal-addon.ts`):
  a real `AddonManifest` (`types: ['tv','channel','movie','series']`,
  `idPrefixes: ['iptv:']`, `catalogs`) plus the four resource methods (catalog,
  meta, stream, subtitles).
  Because it carries a genuine manifest, every existing capability gate —
  `servesResource(...)` and `getCatalog`'s `catalogs.some(...)` filter — works on
  it unchanged.
- **Injected at construction, not persisted.** `createAddonEngine` takes an
  `internalAddons` dependency (analogous to the metadata resolver's `providers`).
  Internal addons are always enabled and are **not** returned by `list()`, so the
  frozen `AddonEngine` interface (§6.2) is untouched. The addon manager still
  manages only HTTP addons; IPTV playlists are managed via `core.iptv`.
- **Unified dispatch.** The engine fans out over a private `AddonTarget` that
  pairs a manifest with the four fetchers; an HTTP target calls the
  `resource-client`, an internal target calls in-memory methods. Fan-out
  ordering, per-resource timeouts, dedup, and ranking (ADR-0004) are shared
  verbatim — no branching in the hot path.
- **No frozen-contract change.** `PlayableSource` already carried `kind: 'live'`
  and `headers?` (ADR-0008), so a channel is one live source with optional
  request headers; nothing in the player contract changed.
- **Required a resolver bugfix.** `resolveStreamId` previously returned `null`
  for any namespace no metadata provider owns, silently dropping streams for
  addon-native ids. It now passes such ids through unchanged, so an `iptv:` id
  reaches the addon that served its catalog (this also unblocks other
  addon-native namespaces, e.g. `kitsu:`).
- **VOD reuses the same seam (increment 3).** The addon emits `movie`/`series`
  catalog/meta/stream shapes alongside live, under an `iptv:<kind>:<id>` id scheme
  (`iptv:live:`, `iptv:movie:`, `iptv:series:`; episodes `iptv:series:<id>:<S>:<E>`
  so `parseId` derives S/E and continue-watching folds a series to one entry).
  Series episodes ride on `MetaDetail.videos`, which short-circuits TMDB. Resume,
  seek, and continue-watching are duration-driven, so `kind:'vod'` sources get
  them for free — but the internal addon must set `kind` itself (it bypasses
  `resource-client`'s type→kind mapping). Episodes load lazily (`loadEpisodes`) so
  an Xtream account with thousands of series costs one request per series opened.
- **Two ingestion paths feed one addon.** A `content.ts` model (`IptvContent =
{ channels, movies, series }`) is produced by both `classify-m3u.ts` (heuristic:
  URL path / extension / group-title + `SxxExx` series folding — best-effort) and
  `xtream.ts` (the clean path: `player_api.php` typed endpoints with real
  metadata). `buildIptvAddon` merges them.
- **Config = user-supplied sources, applied by rebuild.** M3U URLs
  (`settings:iptvPlaylists`) and Xtream accounts (`settings:iptvXtream`) are stored
  locally (neutrality §14.3); applying a change re-runs `createCore` (`reloadCore`),
  mirroring the TMDB-key/debrid-token pattern.
- **Parsed-content cache + background refresh.** A full subscription can take
  minutes to fetch + parse, so parsed `IptvContent` is persisted per source as a
  snapshot (`iptv-cache.ts`, keys `cache/iptv/{meta,body}/<sourceKey>`; meta =
  `{version, fetchedAt, sig}` read on every startup, body = the large content read
  only at build). `buildIptvAddon` is **cache-only** (serves snapshots, never
  fetches), so startup and `reloadCore` are instant. The network fetch lives in
  `core.iptv.refresh()` (`refreshIptvSources`), run in the background by the
  `useIptvRefresh` hook: it fetches each missing/stale source (staleness TTL,
  default 6 h), updates snapshots, prunes removed sources, and reports whether
  content changed so the shell rebuilds only when needed — the TTL makes the
  post-reload refresh a no-op, terminating the cycle. On web the snapshot cache is
  backed by IndexedDB (`IdbStorageAdapter`), since large catalogs overflow
  localStorage's ~5 MB; it falls back to localStorage when IndexedDB is
  unavailable. Xtream series regain their lazy `loadEpisodes` loaders after a
  cache round-trip via `attachEpisodeLoaders` (the closure is dropped by
  serialization; a serializable `source.xtreamSeriesId` pointer is kept). Xtream
  `accountKey` is a deterministic hash of host+username (not the array index), so
  content ids stay stable across account reordering.
- **Live playback (increment 2).** HLS is played by hls.js, dynamically imported
  behind `Html5VideoPlayerAdapter`; recoverable errors surface as `reconnecting`.
  RN plays HLS natively. Web can't set `User-Agent`/`Referer` request headers
  (forbidden-header list), so header-gated live CDNs may fail on web (RN honors
  them); raw MPEG-TS (`.ts`) live needs `mpegts.js` — both deferred.
