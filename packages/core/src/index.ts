// SPDX-License-Identifier: AGPL-3.0-or-later
// Public API surface of @shrimpler/core (§3). Shells and shared-ui import from
// here only — deep imports into module internals are not part of the contract.

export { createCore } from "./create-core";
export type { Core, CoreDependencies, CoreFeatures } from "./create-core";

export type {
  ContentId,
  MediaType,
  ParsedId,
  MetaPreview,
  MetaDetail,
  EpisodeRef,
  PlaybackKind,
  PlayableSource,
  SubtitleTrack,
  DrmConfig,
  AddonManifest,
  ResourceName,
  ResourceObject,
  CatalogDef,
  InstalledAddon,
  CatalogExtra,
  CatalogGenre,
} from "./types/index";

export type {
  PlayerAdapter,
  PlayerState,
  PlayerEventName,
  PlayerEventPayload,
  TrackInfo,
  PlayerError,
  StorageAdapter,
  HttpAdapter,
  HttpOpts,
  HttpResponse,
} from "./adapters/index";

export type { AddonEngine, InternalAddon } from "./addon/index";
export {
  createAddonEngine,
  DEFAULT_ADDON_TIMEOUTS,
  AddonInstallError,
  AddonTimeoutError,
  normalizeManifestUrl,
} from "./addon/index";
export type {
  AddonEngineDeps,
  AddonEngineError,
  AddonEngineErrorHandler,
  AddonEngineTimeouts,
} from "./addon/index";
export { rankStreams, parseResolution } from "./ranking/index";
export { createStreamService } from "./streams/index";
export type { StreamService, StreamServiceDeps } from "./streams/index";
export { createLibrary } from "./library/index";
export type {
  Library,
  LibraryDeps,
  ProgressEntry,
  ProgressInput,
} from "./library/index";
export {
  parseM3U,
  classifyM3U,
  createIptvAddon,
  CATALOG_PAGE_SIZE,
  buildIptvAddon,
  createIptvService,
  createIptvContentCache,
  refreshIptvSources,
  fetchXtreamContent,
  xtreamAccountKey,
  emptyIptvContent,
  mergeIptvContent,
  DEFAULT_IPTV_STALE_TTL_MS,
  IPTV_PLAYLISTS_STORAGE_KEY,
  IPTV_XTREAM_STORAGE_KEY,
} from "./iptv/index";
export type {
  Channel,
  IptvAddonOptions,
  IptvService,
  IptvPlaylist,
  IptvContent,
  IptvMovie,
  IptvSeries,
  IptvEpisode,
  IptvContentCache,
  RefreshIptvOptions,
  IptvRefreshProgress,
  IptvRefreshPhase,
  XtreamAccount,
} from "./iptv/index";
export {
  parseId,
  createMetadataResolver,
  DEFAULT_METADATA_TTLS,
} from "./metadata/index";
export type {
  MetadataProvider,
  MetadataResolver,
  MetadataResolverDeps,
  MetadataResolverTtls,
  FeedKind,
  FeedOpts,
  CatalogRow,
} from "./metadata/index";
export {
  createEpgService,
  createEpgCache,
  listEpgSources,
  parseXmltvStream,
  parseXmltvTime,
  matchChannels,
  normalizeName,
  DEFAULT_EPG_STALE_TTL_MS,
  EPG_SNAPSHOT_VERSION,
} from "./epg/index";
export type {
  EpgService,
  EpgSource,
  EpgProgramme,
  NowNext,
  EpgSnapshotBody,
  EpgCache,
  XmltvChannel,
  XmltvProgramme,
} from "./epg/index";
export { createTtlCache } from "./cache";
export type { TtlCache, TtlCacheDeps } from "./cache";
export type { DebridProvider } from "./debrid/index";
export { RealDebridProvider } from "./debrid/index";
export type { RealDebridProviderOptions } from "./debrid/index";

export { TmdbProvider } from "./providers/index";
export type { TmdbProviderOptions } from "./providers/index";
