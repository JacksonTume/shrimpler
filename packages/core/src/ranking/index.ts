// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.3 / ADR-0004 — Merge & rank.
// Catalog: dedup by id, preserve per-addon ordering, merge into rows.
// Streams: dedup by infoHash/url; rank resolution → debrid-cached → seeders →
// source reliability. Policy is a product decision (ADR-0004), tunable without
// touching the engine.
// TODO(Phase 1): scoring function implementation.
export {};
