// SPDX-License-Identifier: AGPL-3.0-or-later
// Build-time feature gates for the web shell. The shell decides; core receives
// the resolved flags through its composition root (ADR-0001), and the screens
// read the same functions — one source of truth per flag.
//
// Read at call time (not captured in a module const) so a test can flip one with
// vi.stubEnv without reordering imports.

/**
 * IPTV + EPG (§8, ADR-0006/ADR-0015). **Off unless opted in** with
 * `VITE_IPTV_ENABLED=true` in a git-ignored `.env` (see .env.example).
 *
 * The subsystem talks to real subscription servers on a background timer — the
 * app-start playlist/Xtream refresh and the XMLTV guide fetch — so a dev server
 * that is left running, or reloaded all day, keeps hitting them. Defaulting off
 * keeps that load off those hosts while IPTV work is paused. Off means: no
 * internal IPTV addon, no background refresh, and no Live TV surfaces in the UI.
 * Saved playlists and Xtream accounts are untouched, so turning it back on
 * restores the previous state.
 */
export function isIptvEnabled(): boolean {
  return import.meta.env.VITE_IPTV_ENABLED === "true";
}
