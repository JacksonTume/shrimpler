# Roadmap

Working status of the build phases from [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md)
§11. Check items off (with a date) as they land, and keep "Next up"
honest — this file is the entry point for anyone (human or agent) picking up
work. Architectural decisions live in [adr/](adr/README.md); do not re-litigate
them here.

_Last updated: 2026-07-08_

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

## Phase 1 — Core + debrid VOD MVP 🔨 in progress

Target: **a build you actually use** (browser first).

- [x] Addon engine (`packages/core/src/addon/`): manifest install/validate,
      persistence, fan-out with per-addon timeouts + partial-failure
      isolation, merge/dedup, `onError` hook (2026-07-08)
- [x] Stream ranking per ADR-0004 (`packages/core/src/ranking/`) —
      reliability signal still stubbed at 0 (2026-07-08)
- [ ] **Next up:** add-by-URL addon manager UI in the web shell — first
      consumer of the engine; includes wiring the engine into the `Core`
      facade / view-model layer (`@shrimpler/shared-ui`), which also settles
      the state-management contract (spec §13.4)
- [ ] MetadataResolver (addon-meta-first, ADR-0003) + real `TmdbProvider` —
      blocked on a decision about TMDB API-key handling
- [ ] TTL cache module (`core/cache`) backing the metadata resolver
- [ ] Debrid resolver, one provider end-to-end — blocked on provider choice
      (spec §13.3: Real-Debrid vs AllDebrid vs Premiumize)
- [ ] Real `Html5VideoPlayerAdapter` + stream picker/playback screen
- [ ] Library: continue-watching driven by player `timeupdate` (spec §10)
- [ ] Dev tooling: `scripts/addon-smoke.ts` — drives the real engine in
      plain Node against a manifest URL passed as an argument (must ship
      empty: no bundled/example source URLs, §14.3)

## Phase 2 — Second shell + IPTV

- [ ] `packages/shell-rn` (react-native-tvos) + native D-pad focus spike
- [ ] IPTV internal addon (ADR-0006): M3U/M3U8 parser + Xtream Codes client
- [ ] EPG pipeline (streaming XMLTV parse, tvg-id matching) + guide UI
- [ ] Live playback hardening (TS/HLS reconnect — `PlayerAdapter` live mode)
- [ ] IndexedDB `StorageAdapter` for web (EPG/cache scale, spec §7.2)

## Phase 3 — Breadth & polish

- [ ] Tizen + webOS packaging and store certification
- [ ] Subtitles: OpenSubtitles addon + rendering strategy (spec §13.5)
- [ ] Trakt provider + home-screen feeds
- [ ] Optional torrent engine behind the resolver seam (ADR-0005)
- [ ] Store-listing neutrality audit — review `shared-ui/src/labels` before
      every submission (ADR-0007)

## Open decisions (spec §13)

| #    | Decision                                 | Status                                                             |
| ---- | ---------------------------------------- | ------------------------------------------------------------------ |
| 13.1 | Monorepo tooling                         | ✅ pnpm workspaces only; add Turborepo/Nx if build times demand it |
| 13.2 | First shell                              | ✅ Web (Vite + React); RN-TV in Phase 2                            |
| 13.3 | Debrid provider for MVP                  | ⏳ open — pick before the debrid resolver work                     |
| 13.4 | View-model/state contract                | ⏳ open — settle with the addon manager UI                         |
| 13.5 | Subtitle rendering on web-native players | ⏳ open (Phase 3)                                                  |
| 13.6 | Telemetry/debug mode                     | ⏳ open — engine `onError` hook exists as the seed                 |

## Working conventions

- Read `docs/TECHNICAL_SPEC.md` and skim `docs/adr/` before starting;
  architectural changes get a new ADR.
- `pnpm verify` must pass; SPDX header on every source file; user-facing
  strings via `shared-ui/src/labels`; boundary rules per ADR-0001.
- Neutrality is a hard scope rule (CONTRIBUTING.md): no bundled sources,
  no source URLs in code, docs, or examples.
- When a roadmap item lands, check it off here with the date and update
  "Next up".
