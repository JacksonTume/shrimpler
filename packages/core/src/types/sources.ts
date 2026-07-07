// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §4.3 — Playable sources, the output of the stream pipeline.
// This contract is frozen per Phase 0 (§11); changes require an ADR.

export type PlaybackKind = "vod" | "live";

export interface PlayableSource {
  id: string; // stable id for this candidate
  kind: PlaybackKind;
  url?: string; // direct HTTP(S)/HLS/TS URL (after debrid resolve)
  magnet?: string; // present only if unresolved torrent (v-later)
  infoHash?: string;
  fileIdx?: number; // file index within a multi-file torrent

  title?: string; // human label ("1080p BluRay", "Channel 4 HD")
  quality?: string; // "2160p" | "1080p" | ...
  headers?: Record<string, string>; // required request headers (some IPTV/CDN)
  drm?: DrmConfig; // reserved; v1 = undefined

  subtitles?: SubtitleTrack[]; // addon-provided subtitle tracks
  behaviorHints?: {
    notWebReady?: boolean; // codec/container unlikely to play in <video>
    bingeGroup?: string;
  };

  // ranking signals (populated by resolver/ranking layer)
  cached?: boolean; // debrid-cached (instant) vs needs download
  seeders?: number;
  source?: string; // originating addon id, for debugging/telemetry
}

export interface SubtitleTrack {
  id: string;
  lang: string; // ISO code
  url: string;
}

export interface DrmConfig {
  // reserved
  scheme: "widevine" | "fairplay" | "playready";
  licenseUrl: string;
  headers?: Record<string, string>;
}
