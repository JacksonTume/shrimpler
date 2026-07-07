// SPDX-License-Identifier: AGPL-3.0-or-later
// Public API surface of @shrimpler/core (§3). Shells and shared-ui import from
// here only — deep imports into module internals are not part of the contract.

export { createCore } from "./create-core";
export type { Core, CoreDependencies } from "./create-core";

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

export type { AddonEngine } from "./addon/index";
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
export type {
  MetadataProvider,
  MetadataResolver,
  FeedKind,
  FeedOpts,
  CatalogRow,
} from "./metadata/index";
export type { DebridProvider } from "./debrid/index";

export { TmdbProvider } from "./providers/index";
export type { TmdbProviderOptions } from "./providers/index";
