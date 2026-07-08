# ADR-0013 — Debrid resolver: Real-Debrid (v1), streams pivot to IMDb

- Status: Accepted
- Date: 2026-07-08

## Context

ADR-0005 froze the debrid seam — a `DebridProvider.resolve` that collapses a
magnet/infoHash into a direct, playable URL so the player never sees a torrent —
but left the concrete provider open (spec §13.3: Real-Debrid vs AllDebrid vs
Premiumize). `DebridProvider` existed as a type only. The first playback vertical
slice (getStreams → rank → pick → resolve → `<video>`) needs one client
end-to-end; without it the detail screen's "play" action is dead.

Two adjacent gaps had to close with it. ADR-0012 left a **tmdb→imdb hop**
deferred "with the stream picker": streams key on IMDb ids (ADR-0002), but a
title-search result carries a `tmdb:<id>` id, so a TMDB-only result cannot be
turned into a stream request without resolving its IMDb id first. And the shell's
`HttpAdapter.post` hard-coded a JSON body, whereas Real-Debrid's REST API expects
form-encoded bodies with a bearer token.

## Decision

Adopt **Real-Debrid** as the v1 debrid provider.

- `RealDebridProvider` (`core/src/debrid/real-debrid.ts`) implements
  `DebridProvider`. Like `TmdbProvider`, it lives in core but performs no fetch
  directly — the `HttpAdapter` and the user token are injected (core purity,
  ADR-0001). `resolve` runs `addMagnet` → `selectFiles` (largest video file, or
  an explicit `fileIdx`) → a **bounded** `torrents/info` poll for `downloaded` →
  `unrestrict/link`; a direct hoster `url` skips straight to `unrestrict/link`.
  Uncached torrents are not waited on beyond the poll budget (long server-side
  downloads are out of scope for v1) — `resolve` returns `null` and the UI shows
  a neutral message.
- `checkCached` maps to `torrents/instantAvailability` and feeds the ranking
  `cached` signal (ADR-0004). It is **best-effort**: Real-Debrid materially
  degraded that endpoint in 2024, so a missing/empty entry means "not cached" and
  any failure yields an all-false map rather than throwing. Ranking already
  tolerates a missing signal (resolution dominates; `cached` is only a tiebreak).
- The token is **user-supplied and stored locally**, never committed (neutrality,
  §14.3) — mirroring the TMDB key: a runtime token entered on the Settings screen
  is persisted via the `StorageAdapter` and takes precedence; in dev a git-ignored
  `VITE_REALDEBRID_TOKEN` is the fallback. Applying a new token **rebuilds the
  core** (ADR-0012's `reloadCore` pattern), since `createCore` takes `debrid` at
  construction. Absent token → `core.debrid` is undefined → the picker still
  lists/ranks, but torrent resolve is disabled.
- **Streams pivot to IMDb ids** (completes ADR-0012's deferred hop).
  `MetadataProvider` gains optional `getImdbId`; `MetadataResolver` gains
  `resolveStreamId`, which passes a `tt…` id through unchanged and routes a
  namespaced `tmdb:<id>` to the owning provider's `getImdbId` (TMDB
  `/{movie,tv}/{id}/external_ids`), re-attaching any `:S:E` episode coordinates —
  which is the Stremio series stream key (a series resolves to the *show* IMDb
  id, not the episode's own). A new `StreamService` (`core/src/streams/`)
  composes `resolveStreamId` → `AddonEngine.getStreams` → `checkCached` annotate →
  `rankStreams`, plus `resolveStream` (direct-url passthrough, else debrid).
- **HttpAdapter form bodies.** `HttpOpts` gains an optional `form?: boolean`; the
  web `FetchHttpAdapter.post` sends a form-encoded body with the right
  `content-type` when set, else JSON as before. This is a small extension of the
  §7.2 `HttpAdapter` contract (which, unlike `PlayerAdapter`/`PlayableSource`, is
  not frozen), kept backward-compatible.
- **Player: native `<video>` now, hls.js deferred.** `Html5VideoPlayerAdapter`
  wraps an `HTMLVideoElement` (DOM stays in the shell, ADR-0001/0008). VOD debrid
  unrestrict links are progressive MP4/MKV that native `<video>` plays; native
  HLS is used only where the browser supports it. hls.js is deferred to the
  live/IPTV work (Phase 2) and slots behind the same adapter with no core change.

## Consequences

- First real end-to-end playback: search → detail → pick a source → Real-Debrid
  resolve → play. Phase 1's "a build you actually use" milestone is reachable.
- The debrid seam stays generic — AllDebrid/Premiumize or a future torrent engine
  (ADR-0005) implement the same `resolve` seam with no pipeline change. Picking
  Real-Debrid first is not a lock-in.
- `resolveStreamId` routing by `provider.id === namespace` reuses ADR-0012's
  mechanism, so a future Trakt/TVDB provider that owns its namespace gets
  stream-id resolution for free.
- Deferred (noted here and as code TODOs): continue-watching / library
  persistence and the `addon-smoke.ts` dev tool (the rest of Phase 1); subtitle
  *rendering* (§13.5 — tracks are enumerated, not styled); hls.js and live
  reconnect (Phase 2); header-required sources in `<video>`; long-running uncached
  debrid downloads; non-web-codec native fallback (Tizen/webOS, Phase 3).
