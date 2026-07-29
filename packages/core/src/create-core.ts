// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.3 — Composition entry point. Each shell wires concrete adapters into
// the core at startup via its composition root. Core purity invariant (§2.2,
// ADR-0001): this module must run in plain Node with no UI.

import type { PlayerAdapter } from "./adapters/player";
import type { StorageAdapter } from "./adapters/storage";
import type { HttpAdapter } from "./adapters/http";
import type { MetadataProvider, MetadataResolver } from "./metadata/resolver";
import { createMetadataResolver } from "./metadata/create-resolver";
import { createTtlCache } from "./cache";
import type { DebridProvider } from "./debrid/index";
import { createStreamService } from "./streams/index";
import type { StreamService } from "./streams/index";
import { createLibrary } from "./library/index";
import type { Library } from "./library/index";
import {
  buildIptvAddon,
  createIptvContentCache,
  createIptvService,
} from "./iptv/index";
import type { IptvService } from "./iptv/index";
import { createEpgCache, createEpgService, listEpgSources } from "./epg/index";
import type { EpgService } from "./epg/index";
import { createAddonEngine } from "./addon/index";
import type {
  AddonEngine,
  AddonEngineErrorHandler,
  AddonEngineTimeouts,
} from "./addon/index";

/**
 * Subsystem gates, decided by the shell at composition time (ADR-0001: the shell
 * chooses, core receives). Every flag defaults to on — a shell opts *out*.
 */
export interface CoreFeatures {
  /**
   * IPTV + EPG (§8, ADR-0006/ADR-0015). When false the internal IPTV addon is
   * not built and `iptv.refresh`/`epg.refresh` become no-ops, so no user
   * playlist, Xtream account, or XMLTV guide host is contacted — the reason to
   * turn it off is to keep dev builds from hammering those servers. Persisted
   * source config is left untouched, so flipping it back on restores everything.
   */
  iptv?: boolean;
}

export interface CoreDependencies {
  storage: StorageAdapter;
  http: HttpAdapter;
  /** Subsystem gates; omitted or partial means "everything on". */
  features?: CoreFeatures;
  /**
   * Storage for the (potentially large, multi-MB) IPTV content-snapshot cache.
   * Defaults to `storage`; on web the shell points this at IndexedDB so big
   * catalogs don't hit localStorage's ~5 MB quota (ADR-0006, §7.2).
   */
  iptvCacheStorage?: StorageAdapter;
  /** Injectable clock (default Date.now); threaded to the IPTV cache/refresh. */
  now?: () => number;
  playerFactory?: () => PlayerAdapter;
  providers?: MetadataProvider[];
  /** Debrid resolver (§6.4, ADR-0013). Undefined until the shell supplies a
   *  user token; a single provider in v1 (Real-Debrid). */
  debrid?: DebridProvider;
  /** Observability hook for skipped/failed addons (seed of the §13.6 debug mode). */
  onError?: AddonEngineErrorHandler;
  /** Override the engine's per-resource timeouts (defaults per §6.2). */
  timeouts?: Partial<AddonEngineTimeouts>;
}

export interface Core {
  readonly adapters: {
    readonly storage: StorageAdapter;
    readonly http: HttpAdapter;
  };
  readonly providers: readonly MetadataProvider[];
  /** Undefined until the shell supplies a player factory. */
  readonly createPlayer: (() => PlayerAdapter) | undefined;
  /**
   * Addon engine (§6.2), ready with persisted state loaded. Namespaced under
   * `addons`; §10's `core.getCatalog(...)` shorthand maps to `core.addons.*`.
   */
  readonly addons: AddonEngine;
  /**
   * Metadata resolver (§5, ADR-0003): addon-meta-first with provider (TMDB)
   * fallback, TTL-cached. Providers are those passed to createCore.
   */
  readonly metadata: MetadataResolver;
  /**
   * Debrid resolver (§6.4, ADR-0013). Undefined until the shell supplies a
   * token — the stream picker still lists/ranks, but torrent resolve is off.
   */
  readonly debrid: DebridProvider | undefined;
  /**
   * Stream orchestration (§6.3–§6.4): ranked candidates for a content id and
   * debrid resolution of a chosen one. Composes addons + metadata + debrid.
   */
  readonly streams: StreamService;
  /**
   * Library/state (§3, §10 step 8, ADR-0014): continue-watching persistence,
   * fed by player `timeupdate`. Watchlist + installed-sources surfaces grow
   * here later.
   */
  readonly library: Library;
  /**
   * IPTV playlist config (§8, ADR-0006): manage user-supplied M3U playlists.
   * The channels themselves are served as an internal addon through
   * `core.addons`; applying a playlist change means rebuilding the core.
   */
  readonly iptv: IptvService;
  /**
   * EPG now/next for live channels (§8.2, ADR-0015). Guide sources are discovered
   * from the configured IPTV sources (Xtream xmltv.php, M3U `url-tvg`); `refresh`
   * fetches them in the background, `getNowNext` reads the cached snapshots.
   */
  readonly epg: EpgService;
}

/**
 * Async because the addon engine loads persisted installed addons from storage
 * on startup (see createAddonEngine); the returned Core has a ready engine.
 */
export async function createCore(deps: CoreDependencies): Promise<Core> {
  const iptvEnabled = deps.features?.iptv ?? true;
  // IPTV content-snapshot cache (backed by iptvCacheStorage, or storage). The
  // addon is built cache-only from persisted snapshots (instant, no network);
  // the network fetch happens in core.iptv.refresh() in the background.
  const iptvCache = createIptvContentCache({
    storage: deps.iptvCacheStorage ?? deps.storage,
    now: deps.now,
    onError: deps.onError,
  });
  // Gated off ⇒ no internal addon at all, so IPTV catalogs, live streams, and
  // the Xtream lazy episode loaders never reach the engine (and never fetch).
  const iptvAddon = iptvEnabled
    ? await buildIptvAddon({
        http: deps.http,
        storage: deps.storage,
        cache: iptvCache,
      })
    : undefined;
  const addons = await createAddonEngine({
    http: deps.http,
    storage: deps.storage,
    onError: deps.onError,
    timeouts: deps.timeouts,
    internalAddons: iptvAddon ? [iptvAddon] : [],
  });
  const providers = deps.providers ?? [];
  const metadata = createMetadataResolver({
    addons,
    providers,
    cache: createTtlCache({ storage: deps.storage }),
  });
  const streams = createStreamService({
    addons,
    metadata,
    debrid: deps.debrid,
  });
  const library = createLibrary({ storage: deps.storage });
  const iptv = createIptvService({
    storage: deps.storage,
    http: deps.http,
    cache: iptvCache,
    now: deps.now,
    onError: deps.onError,
    enabled: iptvEnabled,
  });
  // EPG shares the IPTV cache storage (IndexedDB on web) and reads channels from
  // the IPTV content snapshots the cache already holds — no playlist re-parse.
  const epg = createEpgService({
    http: deps.http,
    cache: createEpgCache({
      storage: deps.iptvCacheStorage ?? deps.storage,
      now: deps.now,
      onError: deps.onError,
    }),
    listSources: () =>
      listEpgSources({ storage: deps.storage, iptvCache }),
    now: deps.now,
    onError: deps.onError,
    enabled: iptvEnabled,
  });
  return {
    adapters: {
      storage: deps.storage,
      http: deps.http,
    },
    providers,
    createPlayer: deps.playerFactory,
    addons,
    metadata,
    debrid: deps.debrid,
    streams,
    library,
    iptv,
    epg,
  };
}
