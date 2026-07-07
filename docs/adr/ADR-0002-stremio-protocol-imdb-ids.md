# ADR-0002 — Adopt Stremio addon protocol + IMDb `tt…` ID convention unchanged

- Status: Accepted
- Date: 2026-07-07

## Context

An existing ecosystem of addons speaks the Stremio protocol; the `tt…` IMDb
ID is simultaneously the addon join key and the TMDB metadata-lookup key
(spec §1.2.4, §4.1, §6.1).

## Decision

Implement the Stremio addon protocol as-is (stateless GET manifest/resource
endpoints) and keep the IMDb-style ID convention unchanged. Do not invent a
competing ID scheme; unknown namespaces (`kitsu:…`) pass through verbatim.

## Consequences

TBD — revisit after Phase 1.
