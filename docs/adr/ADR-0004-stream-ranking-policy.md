# ADR-0004 — Stream ranking policy

- Status: Accepted
- Date: 2026-07-07

## Context

Multiple addons return overlapping stream candidates; the order shown to the
user is a product decision, not an engine detail (spec §6.3).

## Decision

Dedup by `infoHash`/`url`, then rank: resolution → debrid-`cached` → seeders
→ source reliability. The scoring function lives in `core/ranking` and is
tunable without touching the addon engine.

## Consequences

TBD — revisit after Phase 1.
