// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.3 — Composition entry point. Each shell wires concrete adapters into
// the core at startup via its composition root. Core purity invariant (§2.2,
// ADR-0001): this module must run in plain Node with no UI.

import type { PlayerAdapter } from "./adapters/player";
import type { StorageAdapter } from "./adapters/storage";
import type { HttpAdapter } from "./adapters/http";
import type { MetadataProvider } from "./metadata/resolver";
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
  // TODO(Phase 1): metadata resolver, debrid resolver, library surfaces hang
  // off here too (§5, §10).
}

/**
 * Async because the addon engine loads persisted installed addons from storage
 * on startup (see createAddonEngine); the returned Core has a ready engine.
 */
export async function createCore(deps: CoreDependencies): Promise<Core> {
  const addons = await createAddonEngine({
    http: deps.http,
    storage: deps.storage,
    onError: deps.onError,
    timeouts: deps.timeouts,
  });
  return {
    adapters: {
      storage: deps.storage,
      http: deps.http,
    },
    providers: deps.providers ?? [],
    createPlayer: deps.playerFactory,
    addons,
  };
}
