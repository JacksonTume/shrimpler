// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — IPTV as an internal addon: M3U/M3U8 parser, addon
// builder, and playlist config. Xtream Codes + EPG are later Phase 2 increments.
export { parseM3U } from "./parse-m3u";
export type { Channel } from "./parse-m3u";
export { createIptvAddon, CATALOG_PAGE_SIZE } from "./iptv-addon";
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
  refreshIptvSources,
  m3uSourceKey,
  xtreamSourceKey,
  DEFAULT_IPTV_STALE_TTL_MS,
  IPTV_PLAYLISTS_STORAGE_KEY,
  IPTV_XTREAM_STORAGE_KEY,
} from "./create-iptv";
export type {
  IptvService,
  IptvPlaylist,
  BuildIptvAddonDeps,
  CreateIptvServiceDeps,
  RefreshIptvSourcesDeps,
  RefreshIptvOptions,
  IptvRefreshProgress,
  IptvRefreshPhase,
} from "./create-iptv";
export {
  createIptvContentCache,
  IPTV_SNAPSHOT_VERSION,
} from "./iptv-cache";
export type {
  IptvContentCache,
  IptvContentCacheDeps,
  IptvSnapshotMeta,
} from "./iptv-cache";
export { classifyM3U } from "./classify-m3u";
export {
  fetchXtreamContent,
  xtreamAccountKey,
  attachEpisodeLoaders,
  createEpisodeLoader,
} from "./xtream";
export type { XtreamAccount } from "./xtream";
