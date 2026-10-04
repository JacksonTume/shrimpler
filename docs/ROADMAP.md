# Roadmap

Working status of the build phases from [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md)
§11. Check items off (with a date) as they land, and keep "Next up"
honest — this file is the entry point for anyone (human or agent) picking up
work. Architectural decisions live in [adr/](adr/README.md); do not re-litigate
them here.

_Last updated: 2026-10-04_

## Next up

1. **First real run of `shell-rn`** on an Android device or emulator (Expo dev
   client). Mobile VOD parity has only been verified by lint/typecheck/unit
   tests and a Metro bundle export — never on hardware. Do this before building
   anything further on the RN shell. Since the shell was written, it moved to
   Expo SDK 57 / RN 0.86 (2026-10-04), so this is also the first run on that SDK.
2. Then pick one: **resume IPTV** (start with the ⏸ live stream-selection bug,
   then live playback performance) or **open Phase 3**.

## Phase 0 — Foundations ✅ complete

- [x] Monorepo scaffold (pnpm workspaces), boundary lint in CI —
      dependency-cruiser + core's DOM-less tsconfig (2026-07-07)
- [x] `PlayerAdapter` + `PlayableSource` contracts frozen in
      `packages/core/src/adapters/player.ts` / `types/sources.ts` (ADR-0008)
- [x] Core/shell boundary: adapter interfaces + composition roots (ADR-0001)
- [x] Focus/navigation spike — web shell (ADR-0010); dev-only
      `FocusSpikeScreen` behind the toggle. The RN-TV focus spike is deferred
      with TV itself to Phase 3. _(Superseded 2026-07-18: the Reef restyle
      removed the toggle; `FocusSpikeScreen.tsx` is no longer reachable.)_
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
**mobile** (Expo dev client, Android first). The checklist below is the
increment record.

> **Everything not paused here has landed (2026-08-01).** With mobile at VOD
> parity, the only open Phase 2 items are the two ⏸ IPTV ones below, which stay
> parked with the subsystem. See [Next up](#next-up).

> **IPTV work is paused (2026-07-29), and the subsystem is gated off by
> default.** It refreshes playlists/Xtream catalogs and fetches XMLTV guides on
> every app start, which puts steady load on real subscription servers each time
> a dev build starts or reloads — not worth paying while nobody is working on it.
> The gate is `CoreFeatures.iptv` (a `createCore` dependency; the shell decides,
> per ADR-0001), resolved in the web shell by `shell-web/src/features.ts` from
> `VITE_IPTV_ENABLED` and in the RN shell by `shell-rn/src/features.ts` (a
> constant — Metro has no build-time env). Off means: no internal IPTV addon,
> `iptv.refresh` and `epg.refresh` are no-ops (`force` included), and no Live TV
> surfaces in the UI.
> Saved playlists and Xtream accounts are left untouched, so setting
> `VITE_IPTV_ENABLED=true` in a git-ignored `.env` restores the previous state.
> The unfinished IPTV items below stay open — they are deferred, not dropped.

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
      (`vite-plugin-iptv-proxy.ts`) since IPTV hosts omit the
      `Access-Control-Allow-Origin` header; and a muted-autoplay fallback
- [ ] ⏸ **Live playback performance** (paused) — web live is playable but **choppy**;
      needs work. Baseline tuning already exists (`mpegts-engine.ts` sets
      `enableStashBuffer: !isLive` + `liveBufferLatencyChasing: isLive`, and
      `html5-video.ts` has a muted-autoplay fallback). Remaining levers:
      `stashInitialSize`/`liveSync`/worker on mpegts.js; the dev CORS proxy adds
      latency + copies (a production/native path avoids it — the RN shell has no
      CORS wall); and the muted-autoplay stream still needs an unmute control.
      Web-only concern
- [x] `packages/shell-rn` — Expo (dev client), Android-first: **VOD parity on
      mobile**. Search → detail → pick a source → Real-Debrid resolve → play, with
      continue-watching, all on the same `shared-ui` hooks the web shell uses (no
      new view-model code). The `search`/`detail`/`player`/`settings`/`addons`
      screens plus the `App.tsx` route stack now sit on top of the previously
      landed adapters + `createRnCore`. Also in this increment: `RnVideoSurface`,
      the `<Video>` binding that finally supplies `RnVideoPlayerAdapter`'s injected
      handle (the adapter shipped against a placeholder factory); a `src/ui/` port
      of the Reef foundation to RN `StyleSheet` (same primitives/vocabulary as
      shell-web, flat coral instead of gradients and the platform UI font — no
      extra native dep, no font assets); a PanResponder seek bar rather than a
      slider package, so the dev client needs no rebuild; `src/back.ts` layering
      the Android back button (an open stream picker consumes the press before the
      route stack pops); and `src/features.ts` as the single IPTV gate, now read by
      both `createRnCore` and the screens. Verified by lint/typecheck/depcruise +
      the unit suite (pure helpers in `format.ts`); **not yet exercised on a device
      or emulator** — the RN Vitest project is node-only by design, so the first
      dev-client run is the outstanding confirmation. The `catalog`/`categories`
      screens stay IPTV-only and come with the paused IPTV work, not here
      (2026-08-01)
- [x] EPG pipeline (streaming XMLTV parse, tvg-id matching), increment 1 —
      `HttpAdapter.getTextStream` streaming seam (gzip in the shell, DOM-less
      core), `core/src/epg` (incremental parser, tvg-id + fuzzy match,
      UTC-normalized now/next+grid model, snapshot cache reusing IndexedDB),
      `core.epg` (background stale-while-revalidate refresh; Xtream `xmltv.php` + M3U `url-tvg` source discovery), and now/next strips on live channel
      rows (`useNowNext`) (ADR-0015, 2026-07-16). **Deferred: the dedicated
      timeline "TV Guide" grid screen.**
- [x] IndexedDB `StorageAdapter` for web (spec §7.2) — `IdbStorageAdapter`
      (JSON-string KV over IndexedDB, localStorage fallback) backs the large
      IPTV content-snapshot cache and the EPG cache; the parsed-channel snapshot
      cache (`iptv-cache.ts`) already drops the re-parse-on-reload cost. Small
      config stays in localStorage (the §7.2 large-IDB / small-localStorage
      split)
- [x] Web shell visual design system ("Reef"), first pass — a dark-first
      foundation in `shell-web/src/ui/` (tokens + `theme.css` + focus-aware
      primitives: `Screen`/`Button`/`TextField`/`PosterCard`/`ListRow`/`Dialog`/
      `TideBar`/`Badge`/`Callout`/…) replacing browser-default controls and ad-hoc
      inline hex. One global `[data-focused]` rule restyles all spatial-nav focus
      (ADR-0010) into a TV-legible coral ring; the signature coral "tide" progress
      motif recurs on continue-watching, EPG now-bars, and the player seek. Every
      screen restyled (home, search, detail, catalog/categories, settings, addons,
      playback) with all `data-*`/label test hooks preserved; bundled Space Grotesk + Inter. Removed the dev-only content-id opener + focus-spike toggle. Ported
      to the RN shell's `src/ui/` alongside the shell-rn screens (2026-08-01).
      **Ongoing — more polish to come** (2026-07-18)
- [ ] ⏸ **IPTV live stream selection bug** (paused) — playing a live channel can
      play the wrong stream (e.g. selecting an "NZ" channel plays a different
      one). Points at a channel-id → stream mismatch on the internal-addon live
      path (`getStreams`/`resolveStreamId`, ADR-0006). First item to pick up
      whenever IPTV work resumes — investigate before building anything further
      on the live path

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

## Dependency holds

Last full refresh 2026-10-04 (Expo SDK 57, TypeScript 6.0, Vite 8, Vitest 5,
ESLint 10, dependency-cruiser 18). Packages deliberately held below latest, and
what unblocks each:

| Package                                     | Held at | Why / unblocked by                                                                                                                                                                     |
| ------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react`, `react-dom` (+ `@types`)           | 19.2.x  | Expo SDK 57 pins `react@19.2.3`. Root `pnpm.overrides` pins it workspace-wide so Metro bundles one React — without it, shared-ui's devDependency resolves a second copy. Next Expo SDK |
| `react-native`                              | 0.86.3  | Expo SDK 57 pin. Next Expo SDK                                                                                                                                                         |
| `@react-native-async-storage/async-storage` | 2.2.0   | Expo SDK 57 pin (v3 is a native-module change). Next Expo SDK                                                                                                                          |
| `typescript`                                | 6.0     | `typescript-eslint` 8.x peers `typescript <6.1`, so TS 7 waits for typescript-eslint support                                                                                           |
| `@types/node`                               | 22      | Matches the Node 22 runtime/CI; bump with the engine                                                                                                                                   |

Upgrade Expo with `pnpm exec expo install expo@^<sdk>` then `expo install --fix`
in `packages/shell-rn`, update the root override to the SDK's React pin, and run
`npx expo-doctor` plus `pnpm exec expo export --platform android` (a Metro bundle
check that needs no device).

## Working conventions

- Read `docs/TECHNICAL_SPEC.md` and skim `docs/adr/` before starting;
  architectural changes get a new ADR.
- `pnpm verify` must pass; SPDX header on every source file; user-facing
  strings via `shared-ui/src/labels`; boundary rules per ADR-0001.
- Neutrality is a hard scope rule (CONTRIBUTING.md): no bundled sources,
  no source URLs in code, docs, or examples.
- When a roadmap item lands, check it off here with the date and update
  "Next up".
