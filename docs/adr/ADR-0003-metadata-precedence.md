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

Implemented in Phase 1 (`packages/core/src/metadata/create-resolver.ts`):

- **Precedence is gated by a "sparse" test, not just presence.** Addon meta is
  used as-is only when it has a description and at least one image (poster or
  background); otherwise the provider fills gaps. This keeps thin stream-addon
  meta from producing a bare detail screen.
- **Gap-fill, not replace.** The merge overlays the addon's defined fields onto
  the provider result, so the addon always wins field-by-field and the provider
  only supplies what is missing.
- **No IMDb id → no fallback.** Non-IMDb ids (`kitsu:…`, etc.) have no TMDB
  pivot, so they get addon meta or nothing — parsing stays lenient (§4.1).
- **Provider failures are isolated** (engine philosophy): a TMDB outage degrades
  to whatever addon meta exists rather than throwing.
- **Merged results are TTL-cached** via the `core/cache` module (detail 1 day,
  episodes 12 h). Negative results (`null`) are intentionally not cached.
- The sparse/gap-fill heuristic is deliberately simple and lives in one place;
  revisit if real addons expose cases it mis-classifies.
