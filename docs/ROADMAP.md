# Roadmap

Working status of the build phases from [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md)
§11. Check items off (with a date) as they land, and keep "Next up"
honest — this file is the entry point for anyone (human or agent) picking up
work. Architectural decisions live in [adr/](adr/README.md); do not re-litigate
them here.

_Last updated: 2026-07-09_

## Phase 0 — Foundations ✅ complete

- [x] Monorepo scaffold (pnpm workspaces), boundary lint in CI —
      dependency-cruiser + core's DOM-less tsconfig (2026-07-07)
- [x] `PlayerAdapter` + `PlayableSource` contracts frozen in
      `packages/core/src/adapters/player.ts` / `types/sources.ts` (ADR-0008)
- [x] Core/shell boundary: adapter interfaces + composition roots (ADR-0001)
- [x] Focus/navigation spike — web shell (ADR-0010); dev-only
      `FocusSpikeScreen` behind the toggle. The RN-TV focus spike is deferred
      to Phase 2 with the shell itself.
- [x] Governance bootstrap: LICENSE/NOTICE/README/CONTRIBUTING, templates,
      CI, ADRs 0001–0009 (2026-07-07)

## Phase 1 — Core + debrid VOD MVP ✅ complete

Target: **a build you actually use** (browser first). Reached: search → detail →
pick a source → Real-Debrid resolve → play, with continue-watching. Next up is
Phase 2 (second shell + IPTV).

- [x] Addon engine (`packages/core/src/addon/`): manifest install/validate,
      persistence, fan-out with per-addon timeouts + partial-failure
      isolation, merge/dedup, `onError` hook (2026-07-08)
- [x] Stream ranking per ADR-0004 (`packages/core/src/ranking/`) —
      reliability signal still stubbed at 0 (2026-07-08)
- [x] Add-by-URL addon manager UI in the web shell — first consumer of the
      engine; `createCore` now async and exposes `core.addons`; view-model
      layer settled (`CoreProvider`/`useCore` + `useAddonManager` in
      `@shrimpler/shared-ui`, plain React state — decision §13.4) (2026-07-08)
- [x] TTL cache module (`core/cache`) backing the metadata resolver —
      provider-agnostic, injected-clock, `getOrCompute` (2026-07-08)
- [x] MetadataResolver (addon-meta-first, ADR-0003) + real `TmdbProvider` —
      TMDB API key is user-supplied and stored locally (never committed, §14.3);
      dev reads a git-ignored `VITE_TMDB_API_KEY`, settings-screen UI deferred to
      the detail screen. `core.metadata` exposes `resolveDetail`/`resolveEpisodes`;
      `buildHomeFeeds`/`getFeed` are minimal (home feeds are Phase 3) (2026-07-08)
- [x] Detail screen — first UI consumer of `core.metadata`: movie + series
      detail (`useDetail` in `@shrimpler/shared-ui`, addon-meta-first per
      ADR-0003), series episode/season list. Runtime TMDB key settings UI
      (`useTmdbSettings`, persisted via `StorageAdapter`, applied by rebuilding
      the core). Reachable from the search screen below (and a dev-only "open by
      ID" trigger). Display-only: no playback until the stream picker lands
      (2026-07-08)
- [x] Search screen (find by **title**, ADR-0012) — the detail screen's real
      entry point (`useSearch` in `@shrimpler/shared-ui`; a title query →
      results → select → detail). TMDB-backed via a new `TmdbProvider.search`
      (`/search/multi`) + `MetadataResolver.search`. To make TMDB-only titles
      openable without an IMDb pivot, results carry `tmdb:<id>` ids that resolve
      through new provider-native paths — `getDetailById`/`getEpisodesById`,
      routed by matching `provider.id` to the id namespace in the resolver.
      Streams still need a tmdb→imdb hop (deferred with the stream picker).
      **Future enhancement (not now):** searching by other facets — actor,
      director, genre, year — layered on the same screen (2026-07-08)
- [x] Debrid resolver, one provider end-to-end (Real-Debrid, ADR-0013 / §13.3
      resolved). `RealDebridProvider` in `core/debrid` on the injected
      `HttpAdapter` (addMagnet → selectFiles → bounded poll → unrestrict;
      `checkCached` → instantAvailability, best-effort). Token user-supplied,
      stored locally, applied by rebuilding the core (mirrors the TMDB key);
      `HttpAdapter` gained an opt-in form-encoded POST body. Wired as
      `core.debrid` + a `StreamService` (`core.streams`) composing
      resolveStreamId → `addons.getStreams` → cached-annotate → `rankStreams`
      (2026-07-08)
- [x] Real `Html5VideoPlayerAdapter` + stream picker/playback screen — the
      detail screen's primary action (play). `<video>` wrapper mapping element
      events to the frozen `PlayerAdapter` contract (native progressive/HLS;
      hls.js deferred to Phase 2 live). `useStreamPicker` in `@shrimpler/shared-ui`
      drives a focusable picker overlay from the detail screen; selecting a
      source resolves via debrid and navigates to `PlaybackScreen` (play/pause/
      seek/back). The deferred tmdb→imdb hop for streams now lands
      (`MetadataProvider.getImdbId` + `MetadataResolver.resolveStreamId`,
      ADR-0013). Runtime Real-Debrid token settings UI (`useDebridSettings`)
      (2026-07-08)
- [x] Library: continue-watching driven by player `timeupdate` (§10 step 8,
      ADR-0014). Core `library` module (`createLibrary`, `core.library`) persists
      progress via the `StorageAdapter`, keyed by detail id (a series folds to one
      entry at its latest episode); ≥95% evicts, <15s is ignored. `useWatchProgress`
      (throttled record + flush) drives it from `PlaybackScreen`, which also
      resumes at the saved position; `useContinueWatching` renders a home-screen
      row that opens detail (2026-07-09)
- [x] Dev tooling: `scripts/addon-smoke.ts` — drives the real engine in
      plain Node (via `tsx`, `pnpm smoke <manifest-url>`) against a manifest URL
      passed as an argument; in-memory storage + Node fetch. Ships empty: no
      bundled/example source URLs (§14.3) (2026-07-09)

## Phase 2 — Second shell + IPTV

Built iteratively, one shippable increment at a time. **TV is shelved** to
Phase 3 (Tizen/webOS, react-native-tvos, D-pad focus); the second shell targets
**mobile** (Expo dev client, Android first). See the increment plan for details.

- [x] IPTV internal addon (ADR-0006), increment 1 — M3U/M3U8 parser
      (`core/src/iptv`), the `InternalAddon` engine seam, `core.iptv` playlist
      config, the `resolveStreamId` pass-through fix, and a web browse surface
      (Live TV channels + playlist management). **Live HLS playback deferred.**
- [x] hls.js live playback for web (increment 2) — hls.js dynamically imported
      behind `Html5VideoPlayerAdapter` (own lazy chunk), `reconnecting` on
      recoverable errors, and a `kind:'live'` guard so channels skip
      continue-watching. Makes web IPTV live actually play.
- [x] IPTV VOD (increment 3) — the internal addon emits `movie`/`series` types
      under the `iptv:<kind>:<id>` scheme, fed by **both** M3U classification
      (`classify-m3u.ts`) and an Xtream Codes client (`xtream.ts`,
      `player_api.php`, lazy series episodes), with a generic web catalog screen
      (Live TV / Movies / Series) + an Xtream account form
- [x] Category browse + web live playback that actually works — drill-down
      category lists (`getCatalogGenres`, `useCatalogCategories`/`useCatalogPage`)
      so 10k-channel sources stay navigable; hash-based deep-link routing
      (`route-url.ts`); a Play action for live channels; Xtream live via raw
      MPEG-TS (`.ts` → mpegts.js, matching native players — the `.m3u8` HLS
      wrapper often serves a black placeholder); a **dev-only** Vite CORS proxy
      (`vite-plugin-iptv-proxy.ts`) since IPTV hosts omit `Access-Control-Allow-
      Origin`; and a muted-autoplay fallback
- [ ] **Live playback performance** — web live is playable but **choppy**;
      needs work. Levers: mpegts.js live buffering/latency config
      (`stashInitialSize`, `liveBufferLatencyChasing`/`liveSync`, worker), the dev
      CORS proxy adds latency + copies (a production/native path avoids it — the
      RN shell has no CORS wall), and the muted-autoplay stream needs an unmute
      control. Web-only concern; not started
- [ ] `packages/shell-rn` — Expo (dev client), Android-first: `StorageAdapter`
      (AsyncStorage/MMKV), `HttpAdapter` (fetch), `PlayerAdapter`
      (`react-native-video` — plays HLS natively + honors headers), composition
      root, screens reusing every `shared-ui` hook. Reaches VOD + IPTV parity
      on mobile
- [ ] EPG pipeline (streaming XMLTV parse, tvg-id matching) + guide UI
- [ ] IndexedDB `StorageAdapter` for web (EPG/cache scale, spec §7.2; also
      caches parsed channels to drop the re-parse-on-reload cost)

## Phase 3 — Breadth & polish

- [ ] Tizen + webOS packaging and store certification
- [ ] Subtitles: OpenSubtitles addon + rendering strategy (spec §13.5)
- [ ] Trakt provider + home-screen feeds
- [ ] Optional torrent engine behind the resolver seam (ADR-0005)
- [ ] Store-listing neutrality audit — review `shared-ui/src/labels` before
      every submission (ADR-0007)

## Open decisions (spec §13)

| #    | Decision                                 | Status                                                                                            |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 13.1 | Monorepo tooling                         | ✅ pnpm workspaces only; add Turborepo/Nx if build times demand it                                |
| 13.2 | First shell                              | ✅ Web (Vite + React); RN-TV in Phase 2                                                           |
| 13.3 | Debrid provider for MVP                  | ✅ Real-Debrid (ADR-0013); debrid seam stays generic for AllDebrid/Premiumize later               |
| 13.4 | View-model/state contract                | ✅ plain React state; `CoreProvider`/`useCore` + hooks in shared-ui, no external store (ADR-0011) |
| 13.5 | Subtitle rendering on web-native players | ⏳ open (Phase 3)                                                                                 |
| 13.6 | Telemetry/debug mode                     | ⏳ open — engine `onError` hook exists as the seed                                                |

## Working conventions

- Read `docs/TECHNICAL_SPEC.md` and skim `docs/adr/` before starting;
  architectural changes get a new ADR.
- `pnpm verify` must pass; SPDX header on every source file; user-facing
  strings via `shared-ui/src/labels`; boundary rules per ADR-0001.
- Neutrality is a hard scope rule (CONTRIBUTING.md): no bundled sources,
  no source URLs in code, docs, or examples.
- When a roadmap item lands, check it off here with the date and update
  "Next up".
