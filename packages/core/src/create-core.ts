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
import { buildIptvAddon, createIptvService } from "./iptv/index";
import type { IptvService } from "./iptv/index";
import { createAddonEngine } from "./addon/index";
import type {
  AddonEngine,
  AddonEngineErrorHandler,
  AddonEngineTimeouts,
} from "./addon/index";

export interface CoreDependencies {
  storage: StorageAdapter;
  http: HttpAdapter;
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
}

/**
 * Async because the addon engine loads persisted installed addons from storage
 * on startup (see createAddonEngine); the returned Core has a ready engine.
 */
export async function createCore(deps: CoreDependencies): Promise<Core> {
  // Build the internal IPTV addon from persisted playlists (undefined when none)
  // and inject it alongside HTTP addons (ADR-0006).
  const iptvAddon = await buildIptvAddon({
    http: deps.http,
    storage: deps.storage,
    onError: deps.onError,
  });
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
  const iptv = createIptvService({ storage: deps.storage });
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
  };
}
