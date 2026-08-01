// SPDX-License-Identifier: AGPL-3.0-or-later
// Feature gates for the RN shell — the mobile counterpart of
// shell-web/src/features.ts. The shell decides; core receives the resolved flags
// through its composition root (ADR-0001), and the screens read the same function,
// so there is one source of truth per flag.
//
// Web resolves its gate from `VITE_IPTV_ENABLED`; RN has no build-time env
// (no import.meta, and Metro inlines nothing equivalent), so the flag is a
// constant flipped in source.

/**
 * IPTV + EPG (§8, ADR-0006/ADR-0015). **Off** while IPTV work is paused
 * project-wide (docs/ROADMAP.md, 2026-07-29): the subsystem refreshes playlists
 * and XMLTV guides against real subscription servers on every app start, which a
 * dev client reloading all day should not be doing while nobody is on it.
 *
 * Off means: no internal IPTV addon, `iptv.refresh`/`epg.refresh` are no-ops, and
 * no Live TV surfaces in the UI. Saved playlists and Xtream accounts are left
 * untouched, so flipping this back to true restores the previous state. The RN
 * catalog/categories screens ship with that work, not before it.
 */
export function isIptvEnabled(): boolean {
  return false;
}
