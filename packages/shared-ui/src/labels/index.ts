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

  // Continue-watching row on the home screen (§10 step 8, ADR-0014). Populated
  // from local watch progress; empty until the user has played something.
  continueWatching: "Continue watching",
  removeFromContinue: "Remove",

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

  // Search screen (§5). Title search over metadata providers (TMDB in v1);
  // results are metadata previews only — never streams (neutrality, §5.1).
  searchTitle: "Search",
  searchPlaceholder: "Search by title",
  searchButton: "Search",
  searching: "Searching…",
  searchEmpty: "No results.",
  searchError: "Could not search. Please try again.",

  // Live TV / IPTV (§8, ADR-0006). "Channel"/"catalog" is internal vocabulary;
  // the presentation layer says "Live TV". Playlists are user-supplied M3U URLs
  // stored locally, never bundled (neutrality, §14.3). Error copy is generic —
  // the raw engine message goes to the debug channel, not the UI (ADR-0007).
  liveTv: "Live TV",
  moviesTitle: "Movies",
  seriesTitle: "Series",
  channelsTitle: "Live TV",
  channelsLoading: "Loading…",
  channelsEmpty: "Nothing here yet. Add an IPTV source to get started.",
  channelsError: "Could not load this. Please try again.",
  iptvTitle: "IPTV playlists",
  iptvUrlLabel: "M3U playlist URL",
  iptvAddButton: "Add playlist",
  iptvEmpty: "No IPTV playlists added",
  iptvAddError: "Could not add that playlist. Check the URL and try again.",
  // Xtream Codes account (§8): host + user + password, stored locally (§14.3).
  // Exposes live + VOD (movies/series) with richer metadata than a flat M3U.
  xtreamTitle: "Xtream accounts",
  xtreamHost: "Server URL",
  xtreamUsername: "Username",
  xtreamPassword: "Password",
  xtreamAddButton: "Add account",
  xtreamEmpty: "No Xtream accounts added",
  xtreamAddError:
    "Could not add that account. Check the details and try again.",
  removeAccount: "Remove",

  // Detail screen (§4.2 MetaDetail, ADR-0003). Presentation of metadata only —
  // never a stream source. Generic states; no title/id is ever hard-coded here.
  detailLoading: "Loading…",
  detailError: "Could not load details. Please try again.",
  detailEmpty: "No details found.",
  detailNoProviderHint:
    "Add a TMDB key in Settings for posters and descriptions.",
  castTitle: "Cast",
  genresTitle: "Genres",
  episodesTitle: "Episodes",
  seasonLabel: "Season",

  // Stream picker (§6.3) + playback (§7.1). "Stream" is internal vocabulary;
  // the presentation layer says "Sources" (§9.2). A chosen source is resolved
  // to a playable URL via debrid (ADR-0005/0013). Error copy stays generic —
  // the raw provider message never reaches the UI (ADR-0007).
  streamsTitle: "Sources",
  streamsLoading: "Finding sources…",
  streamsEmpty: "No sources found.",
  streamResolveError: "Could not play that source. Please try again.",
  streamNoDebridHint: "Add a debrid token in Settings to play this source.",
  play: "Play",
  pause: "Pause",
  playbackLoading: "Loading…",
  playbackError: "Could not play this. Please try again.",
  // Live playback (§8, ADR-0006): a channel has no fixed duration, so no
  // seek/resume; a transient stall shows "Reconnecting…" while hls.js recovers.
  live: "Live",
  reconnecting: "Reconnecting…",

  // Settings screen. TMDB is a metadata provider (presentation data only,
  // §5.1) — naming it is neutrality-safe; it is not a content source. The key
  // is user-supplied and stored locally, never committed (§14.3).
  settings: "Settings",
  tmdbKeyLabel: "TMDB API key",
  tmdbKeyHint:
    "Optional. Enables richer metadata (posters, descriptions, episodes). Get a free key at themoviedb.org.",
  tmdbKeyActive: "Metadata provider active",
  tmdbKeyInactive: "No metadata provider configured",
  // Real-Debrid is a stream resolver, not a content source (ADR-0005/0013):
  // it turns a source the user already added into a playable link. Naming it is
  // neutrality-safe. The token is user-supplied and stored locally (§14.3).
  debridTokenLabel: "Real-Debrid token",
  debridTokenHint:
    "Optional. Enables playback of torrent sources through your Real-Debrid account.",
  debridTokenActive: "Debrid provider active",
  debridTokenInactive: "No debrid provider configured",
  save: "Save",
  clear: "Clear",
  saved: "Saved",

  // Mirrored in NOTICE, README, and the About screen (§14.3).
  disclaimer:
    "Shrimpler hosts, stores, and distributes no content. You are responsible for the legality of the sources you add.",
} as const;

export type LabelKey = keyof typeof labels;
