// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — IPTV as an internal addon: M3U/M3U8 parser, addon
// builder, and playlist config. Xtream Codes + EPG are later Phase 2 increments.
export { parseM3U } from "./parse-m3u";
export type { Channel } from "./parse-m3u";
export { createIptvAddon } from "./iptv-addon";
export type { IptvAddonOptions } from "./iptv-addon";
export { emptyIptvContent, mergeIptvContent } from "./content";
export type {
  IptvContent,
  IptvMovie,
  IptvSeries,
  IptvEpisode,
} from "./content";
export {
  buildIptvAddon,
  createIptvService,
  IPTV_PLAYLISTS_STORAGE_KEY,
  IPTV_XTREAM_STORAGE_KEY,
} from "./create-iptv";
export type {
  IptvService,
  IptvPlaylist,
  BuildIptvAddonDeps,
} from "./create-iptv";
export { classifyM3U } from "./classify-m3u";
export { fetchXtreamContent } from "./xtream";
export type { XtreamAccount } from "./xtream";
