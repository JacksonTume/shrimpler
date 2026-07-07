# ADR-0010 — Web-shell spatial navigation: Norigin engine behind a local seam

- Status: Accepted
- Date: 2026-07-07

## Context

Phase 0 (spec §11) requires the focus/navigation model to exist before real
screens are built — retrofitting spatial nav is the classic TV-port disaster.
Options were a hand-rolled geometric engine, Mozilla-style
js-spatial-navigation, or Norigin's React library.

## Decision

Use `@noriginmedia/norigin-spatial-navigation` (MIT, production TV pedigree,
supports old Tizen/webOS Chromium), wrapped behind
`packages/shell-web/src/focus/`: screens import `useFocusable`,
`FocusContext`, `setFocus` etc. from that seam only, never from the library
directly, so the engine is swappable without touching screens.

Back-key handling is deliberately outside the engine (`focus/back.ts`): a
stack of handlers where the most recently registered one consumes the press,
mapping browser Escape/Backspace plus TV keyCodes (461 webOS, 10009 Tizen)
and ignoring Backspace inside text fields.

Engine behaviours accepted as-is (validated by the spike and its tests):

- Entering a container focuses its last-focused child, else the child closest
  to the origin — column position is not preserved geometrically across rows.
  If column-preserving navigation is ever wanted, the engine's
  `nextFocusResolver` hook is the extension point.
- Layouts are cached and trusted for 16ms; tests must force `updateAllLayouts()`
  after synthetically positioning elements.

## Consequences

The RN-TV shell (Phase 2) uses native D-pad focus, not this engine — only the
seam's _concepts_ (focusable, container memory, back stack) should be
mirrored there. Revisit if webOS pointer ("magic remote") support demands a
hybrid pointer+spatial model in Phase 3.
