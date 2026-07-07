# ADR-0005 — Debrid-first; torrent engine deferred behind resolver seam

- Status: Accepted
- Date: 2026-07-07

## Context

A local torrent engine is heavy (sequential piece priority, local HTTP
serving, platform constraints); debrid services already collapse torrents
into direct HTTPS URLs (spec §1.3, §6.4).

## Decision

v1 resolves magnets/infoHashes via debrid providers so the player layer never
sees a magnet. A torrent engine, if added later, implements the same
"resolve a `PlayableSource.magnet` into a playable `url`" seam; the rest of
the pipeline is unchanged.

## Consequences

TBD — revisit after Phase 1.
