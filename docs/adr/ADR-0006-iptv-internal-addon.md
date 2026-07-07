# ADR-0006 — IPTV modeled as an internal addon, not a parallel subsystem

- Status: Accepted
- Date: 2026-07-07

## Context

IPTV (M3U/Xtream + EPG) could easily become a second app bolted onto the
first, duplicating discovery, search, and playback plumbing (spec §8).

## Decision

The IPTV module emits the same catalog/meta/stream shapes as any addon
(`type: 'tv' | 'channel'`), so discovery, search, and the player layer reuse
it for free.

## Consequences

TBD — revisit after Phase 2.
