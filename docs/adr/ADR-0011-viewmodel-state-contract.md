# ADR-0011 — View-model/state contract: plain React state via shared-ui hooks

- Status: Accepted
- Date: 2026-07-08

## Context

Spec §13.4 left the shell state-management contract open: how UI reaches core
logic and holds view state, kept "core-agnostic". It had to be settled with the
first real consumer of the engine — the add-by-URL addon manager (spec §11
Phase 1, ADR-0007). The layered model (ADR-0001) already fixes the direction:
`@shrimpler/shared-ui` may depend on core and React, never on a shell, so the
shared logic lives there and both shells reuse it. The open part was _how_ that
shared logic exposes state — plain React state, or an external store
(zustand/valtio/redux) — and how a shell hands its composed `Core` to it.

## Decision

Shared view-models are **React hooks in `shared-ui/src/viewmodels/`** built on
plain React state (`useState`/`useReducer`/`useCallback`) — **no external store
library.** The core stays the single source of truth for logic; view-models are
a thin reactive skin over it.

- **Core access via context.** `shared-ui/src/context/core-context.tsx` provides
  `CoreProvider` + `useCore()`. Each shell wires its adapters at the composition
  root, awaits `createCore` (now async — the addon engine loads persisted state
  at startup), and wraps its tree in `<CoreProvider core={core}>`. The context
  holds the whole `Core`, so later hooks reach every namespace
  (`core.addons`, and later `core.metadata` / `core.debrid` / `core.library`).
- **One hook per surface.** `useAddonManager()` is the reference implementation:
  returns state + handlers, seeds synchronously from `engine.list()`, re-reads
  after each awaited mutation to re-sync, guards in-flight work with a ref (not
  state, which is stale within a render), and surfaces errors as **labels**
  never raw engine messages (ADR-0007) — the raw cause goes to the debug channel
  (the engine `onError` seed, spec §13.6).
- **Shells stay presentational.** A shell owns rendering, focus, and routing; it
  calls hooks and renders their return. It does not talk to `core.*` directly
  from a screen.

## Consequences

- Zero new runtime dependencies; matches the "simpler" product thesis and keeps
  the core-agnostic constraint (§13.4) — hooks depend on core + React only.
- The RN-TV shell (Phase 2) reuses the same `shared-ui` hooks unchanged; only
  the presentational layer differs. `CoreProvider`/`useCore` is the shared seam.
- Cross-screen/global state (e.g. a playback session spanning screens) is not
  yet exercised. If plain hooks + context prove awkward for that, revisit with a
  superseding ADR — a store can slot in behind the same hook surface without
  changing screens. Until a concrete case demands it, no store is added.
- `createCore` is async from here on; every shell composition root and any test
  constructing a core must `await` it.
