# ADR-0003 — Metadata precedence: addon-meta-first, provider (TMDB) fallback

- Status: Accepted
- Date: 2026-07-07

## Context

Stream-only addons return video sources without browsable catalogs or rich
detail, producing a blank UI without a fallback (spec §5).

## Decision

Addon meta wins when present; the MetadataProvider (TMDB in v1) fills gaps
keyed off `imdbId`; the merged result is TTL-cached. Providers supply
presentation data only — never streams.

## Consequences

TBD — revisit after Phase 1.
