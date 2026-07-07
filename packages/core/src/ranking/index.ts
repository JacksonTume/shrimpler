// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.3 / ADR-0004 — Merge & rank.
// Catalog merge lives in the addon engine (install-order, dedup by id, first
// wins). Stream ranking policy lives here so it stays tunable without
// touching the engine.
export { rankStreams, parseResolution } from "./stream-rank";
