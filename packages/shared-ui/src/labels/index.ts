// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §9.2 / ADR-0007 — the labels module: every user-facing string routes
// through this map. It is the single audit point for the app's "voice" and must
// match store-listing copy. AUDIT THIS FILE BEFORE EVERY STORE SUBMISSION.
// Internal core vocabulary stays accurate; only this presentation layer renames:
//   addon / manifest URL  → "Source" / "Playlist"
//   catalog resource      → "Menu" / browsable rows
//   stream resource       → "Sources"
//   installAddon(url)     → "Add a Playlist"

export const labels = {
  appName: "Shrimpler",
  tagline: "A simple, neutral media player.",

  // Empty-by-default states (§9.1): the app ships with no sources.
  emptyHome: "No sources added",
  emptyHomeHint: "Add a playlist to get started.",

  // Core-vocabulary → user-facing renames (§9.2 table).
  source: "Source",
  sources: "Sources",
  menu: "Menu",
  addPlaylist: "Add a Playlist",
  playlistUrl: "Playlist URL",

  // Addon manager screen. "Addon"/"manifest" is internal vocabulary; the
  // presentation layer says "Playlist" (§9.2). Error copy is deliberately
  // generic — the raw engine message goes to the debug channel, not the UI.
  sourcesTitle: "Playlists",
  emptySources: "No playlists added",
  addSourceButton: "Add",
  installing: "Adding…",
  addSourceError: "Could not add that playlist. Check the URL and try again.",
  removeSource: "Remove",
  enableSource: "Enable",
  disableSource: "Disable",
  back: "Back",

  // Mirrored in NOTICE, README, and the About screen (§14.3).
  disclaimer:
    "Shrimpler hosts, stores, and distributes no content. You are responsible for the legality of the sources you add.",
} as const;

export type LabelKey = keyof typeof labels;
