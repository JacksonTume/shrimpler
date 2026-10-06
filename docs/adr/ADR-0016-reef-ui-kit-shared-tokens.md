# ADR-0016 — Reef: in-house UI kit per shell, design tokens shared via shared-ui

- Status: Accepted
- Date: 2026-10-06 (records the Reef foundation that landed on the web shell
  2026-07-18 and was ported to the RN shell 2026-08-01, and moves its tokens to
  a single source)

## Context

Before Reef the web shell ran on browser-default controls and ad-hoc inline hex.
Reef replaced that with a dark-first foundation — tokens, `theme.css`, and
focus-aware primitives (`Screen`, `Button`, `TextField`, `PosterCard`,
`ListRow`, `Dialog`, `TideBar`, …) in `shell-web/src/ui/` — and was then ported
to RN `StyleSheet` in `shell-rn/src/ui/`. It landed without an ADR, so the
choices behind it were unrecorded, and its tokens had drifted into three
hand-synced copies: `theme.css` `:root`, `shell-web/src/ui/tokens.ts`, and
`shell-rn/src/ui/tokens.ts`.

The constraints it answers to are already decided elsewhere: focus is driven by
the Norigin spatial-nav engine, which marks the focused element with
`data-focused` (ADR-0010); shared code is logic only, and shells stay
presentational (ADR-0011); `shared-ui` may hold anything that depends on core
and React but never on a shell (ADR-0001); the product thesis is "simpler"
with minimal runtime dependencies (ADR-0011, spec §1).

## Decision

**1. An in-house UI kit, no component library.** Reef is our own set of
primitives, not MUI/Chakra/Radix or similar. Two reasons:

- **Spatial-nav focus.** Component libraries are built around pointer and Tab
  focus, with their own per-component focus states. Reef has exactly one focus
  style — a global `[data-focused="true"]` rule drawing a TV-legible coral ring
  — driven by the engine (ADR-0010). A library's focus model would have to be
  disabled or fought on every component.
- **Low dependencies.** Reef's only runtime dependencies are two `@fontsource`
  packages (bundled Space Grotesk + Inter), in line with ADR-0011's
  zero-new-runtime-deps stance.

**2. Components per shell, tokens shared.** Each shell implements its own
primitives under the same names and vocabulary; no component code is shared,
consistent with ADR-0011 (only hooks cross the shell boundary). The **palette and
corner radii** are the exception: their single source is
`packages/shared-ui/src/theme/reef.ts` (`reefColor`, `reefRadius`), plain values
with no React.

- **Web:** `applyReefTokens()` (`shell-web/src/ui/tokens.ts`), called from
  `main.tsx` before first render, writes them onto `<html>` as CSS custom
  properties (`--bg`, `--surface-2`, `--r-pill`, plus a derived `--coral-rgb`
  for `rgba()` tints). `theme.css` does not declare them. `index.html` keeps a
  literal background colour for the paint before JS runs.
- **RN:** `shell-rn/src/ui/tokens.ts` re-exports them as `color`/`radius`.
- **Per shell, by design:** type scale, font families, shadows, the focus ring,
  spacing, and press/disabled opacities. RN runs a type scale one step smaller at
  headline sizes (a phone viewport) and has no box-shadow or spatial-nav focus.

`shell-web/src/ui/tokens.test.ts` enforces the arrangement: every `var(--…)`
referenced in the web shell is defined, no shared token is re-declared in
`theme.css`, and the `index.html` literal matches `reefColor.bg`.

**3. Web styling mechanism: inline styles over tokens.** Components style
themselves with inline `style={{ … var(--token) … }}`. `theme.css` owns only
what inline styles cannot express: web-only tokens, resets, the global focus
ring, pseudo-elements (the seek bar's thumb, scrollbars, `::selection`), and
keyframes. Adopting a CSS framework (e.g. Tailwind), CSS-in-JS, CSS modules or a
component library requires a superseding ADR.

**4. Old-Chromium CSS floor.** Web styling stays within what the old Chromium
builds on Tizen/webOS support: custom properties (including `var()` inside
`rgba()`), flexbox and grid. TV packaging is Phase 3, but retrofitting a UI for
TV later is the costly path (spec Phase 0, ADR-0010), and holding the floor now
costs almost nothing.

**5. Dark now; a light theme stays possible but uncommitted.** Reef ships
dark-only (`color-scheme: dark`). Token names are semantic (`bg`, `surface`,
`sand`, `line`), so a light theme would be a second value set in
`shared-ui/src/theme/` plus a switch, not a component rewrite — provided
components keep taking colours from tokens rather than literals. No light theme
is planned.

**6. RN deviations are interim.** The RN port uses a flat coral instead of the
web's coral→coral-deep gradient, and the platform UI font instead of Space
Grotesk/Inter, to avoid `expo-font` and a dev-client rebuild. Bundling the fonts
follows the first real device run of `shell-rn` (see ROADMAP "Next up"), once the
rebuild path is confirmed; the gradient is optional polish.

**7. No formal contrast target.** Legibility is a judgement call. For
reference, `--sand-faint` (40% alpha) is about 3.4:1 on `--bg`, below WCAG AA
for body text, so it suits secondary or large text. The focus ring is
deliberately loud for 10-foot viewing.

## Consequences

- Changing a palette colour or radius is one edit in `shared-ui/src/theme/reef.ts`
  and reaches both shells. Adding a web-only token goes in `theme.css`; adding a
  shared one goes in `reef.ts` (the web picks it up automatically as
  `--kebab-case`).
- Shared tokens are set by JS on the web, so they don't exist until `main.tsx`
  runs. Anything painted before that (the `index.html` body) uses literals,
  guarded by the token test.
- Each shell maintains its own primitive implementations; a new primitive or a
  behaviour change has to be done twice if both shells need it. That is the
  accepted price of ADR-0011's split.
- New primitives, visual polish and token value changes are routine. Changing the
  styling mechanism, adopting a library, sharing components across shells, or
  committing to a theme strategy each need a superseding ADR.

## Alternatives considered

- **A component library** (MUI, Chakra, Radix + styling) — rejected for the two
  reasons in Decision 1.
- **Tailwind / CSS-in-JS** — adds build tooling or a runtime for no gain over
  inline styles on custom properties; still has to defer focus styling to the
  global rule.
- **Shared components** (react-native-web or a cross-platform kit) — conflicts
  with ADR-0011's presentational-shell split and adds heavy dependencies.
- **Keep the three hand-synced token copies** — cheapest, but they had already
  started to diverge (the web copy lacked `lineStrong`, `black` and `scrim`).
- **Generate `:root` at build time** (a Vite plugin emitting CSS) — avoids the
  pre-JS literal, but Vite's config loader would have to load shared-ui
  TypeScript across the package boundary. Runtime injection is a few lines with
  no tooling.
