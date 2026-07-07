// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — IPTV is an *internal addon*, not a parallel subsystem:
// it emits the same catalog/meta/stream shapes as any addon (type: 'tv'|'channel').
// TODO(Phase 2): M3U/M3U8 parser, Xtream Codes client, streaming XMLTV EPG
// pipeline (tvg-id match + fuzzy fallback, timezone-normalized now/next + grid).
export {};
