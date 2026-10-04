# Shrimpler

Neutral, cross-platform media player compatible with the Stremio addon protocol.
One pure-TypeScript core, consumed by a React DOM shell (`shell-web`) and a React
Native shell (`shell-rn`, Expo).

## Where to look

- **`docs/ROADMAP.md`** — current status, "Next up", paused work, dependency holds.
  Start every session here. All dated or status-bearing detail lives there, not in
  this file.
- `docs/TECHNICAL_SPEC.md` — architecture and domain model. Phasing notes in it
  marked "superseded" defer to the roadmap.
- `docs/adr/` — decisions. Don't re-litigate one; a change gets a new superseding ADR.
- `README.md` — dev setup, credentials, test commands. `CONTRIBUTING.md` — scope rules.

## Packages and the boundary

| Package              | Role                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| `packages/core`      | Pure-TS brain. Declares adapter interfaces; zero npm/runtime deps        |
| `packages/shared-ui` | React view-model hooks (`CoreProvider`/`useCore`, `use*`) + `labels`     |
| `packages/shell-web` | Vite + React DOM; Reef UI in `src/ui/`; spatial-nav focus (ADR-0010)     |
| `packages/shell-rn`  | Expo dev client, Android first; Reef port in `src/ui/` (RN `StyleSheet`) |

- **core never imports** a shell, shared-ui, React, the DOM, or any npm package
  (ADR-0001). Enforced by dependency-cruiser (`.dependency-cruiser.cjs`), core's
  DOM-less tsconfig, and an ESLint `no-restricted-imports` rule.
- shared-ui may import core and React, never a shell.
- Each shell owns a composition root that injects adapters into `createCore`.
- Shells resolve feature gates and pass them in as `CoreFeatures`. IPTV is gated by
  `shell-web/src/features.ts` (`VITE_IPTV_ENABLED`) and `shell-rn/src/features.ts`
  (a constant — Metro has no build-time env).

## Commands

```sh
pnpm verify     # lint + depcruise + typecheck + test + web build — must pass
pnpm format     # Prettier check — NOT part of verify or CI; run it too
pnpm dev        # web shell
pnpm smoke <manifest-url>                    # drive the addon engine in Node
npx vitest run --project <core|shared-ui|shell-web|shell-rn>
pnpm --filter @shrimpler/shell-rn android    # build/install the dev client
```

RN rendering has no test coverage (the shell-rn Vitest project is node-only). To check
the RN bundle without a device, run `pnpm exec expo export --platform android` in
`packages/shell-rn`.

## Toolchain rules

- **pnpm only.** No bun/npm/yarn lockfiles or a root `"workspaces"` field.
- **One React version workspace-wide**, pinned by the root `pnpm.overrides` to the
  Expo SDK's React version. Without it, shared-ui resolves a second React copy into
  the Metro bundle and hooks break. Bump the override together with Expo.
- shell-rn native deps (`expo`, `react-native`, AsyncStorage, …) are versioned by
  `expo install` / `expo install --fix`, not by `pnpm update`. For routine bumps, use
  `pnpm update -r --filter '!@shrimpler/shell-rn'`.
- Vite config files import relative modules with explicit `.ts` extensions
  (needed by Vite's native config loader).

## Conventions

- `// SPDX-License-Identifier: AGPL-3.0-or-later` header on every source file.
- User-facing strings go through `packages/shared-ui/src/labels`.
- **Neutrality is a hard rule:** no bundled sources, and no source/manifest/playlist
  URLs in code, docs, tests, or examples (ADR-0007, CONTRIBUTING.md).
- Credentials (TMDB key, Real-Debrid token, IPTV accounts) are user-supplied and
  stored locally. Dev values go in git-ignored `packages/shell-web/.env`; never commit
  them.
- When a roadmap item lands, check it off in `docs/ROADMAP.md` with the date and
  update "Next up".
- Commits: single-line title only — no body, no trailers, no `Signed-off-by`.
