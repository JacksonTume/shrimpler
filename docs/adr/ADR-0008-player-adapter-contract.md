# ADR-0008 — `PlayerAdapter` single contract spanning VOD / live / (torrent-later)

- Status: Accepted
- Date: 2026-07-07

## Context

Playback spans debrid direct URLs, live TS/HLS with reconnect, and (later)
torrent-served local HTTP, across ExoPlayer, AVPlayer, `<video>`, Tizen
AVPlay, webOS, and libmpv (spec §7.1).

## Decision

One frozen `PlayerAdapter` contract (`packages/core/src/adapters/player.ts`)
with `kind: 'live'` as a first-class mode: live reconnect logic lives inside
each implementation (core only observes `'reconnecting'` events); seek on
live is a no-op without a DVR window. The contract is frozen in Phase 0,
before any UI work.

## Consequences

TBD — revisit after Phase 1.
