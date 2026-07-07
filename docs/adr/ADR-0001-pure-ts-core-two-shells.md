# ADR-0001 — Pure-TS core + two shells (RN-TV, web); core purity invariant

- Status: Accepted
- Date: 2026-07-07

## Context

~80% of behaviour (addon protocol, catalog merge, metadata resolution, EPG,
debrid, library state) is platform-independent and must not be written twice
(spec §1.2, §2).

## Decision

One pure-TypeScript core (`@shrimpler/core`) consumed by two platform shells
(react-native-tvos, React DOM). Core never imports from a shell and never
touches the DOM, a native module, or a player SDK; it declares adapter
interfaces and shells inject implementations at a composition root. Litmus
test: the entire core runs in plain Node with no UI (spec §2.2). Enforced by
dependency-cruiser in CI and core's DOM-less tsconfig.

## Consequences

TBD — revisit after Phase 1.
