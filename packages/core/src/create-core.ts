// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.3 — Composition entry point. Each shell wires concrete adapters into
// the core at startup via its composition root. Core purity invariant (§2.2,
// ADR-0001): this module must run in plain Node with no UI.

import type { PlayerAdapter } from "./adapters/player";
import type { StorageAdapter } from "./adapters/storage";
import type { HttpAdapter } from "./adapters/http";
import type { MetadataProvider } from "./metadata/resolver";

export interface CoreDependencies {
  storage: StorageAdapter;
  http: HttpAdapter;
  playerFactory?: () => PlayerAdapter;
  providers?: MetadataProvider[];
}

export interface Core {
  readonly adapters: {
    readonly storage: StorageAdapter;
    readonly http: HttpAdapter;
  };
  readonly providers: readonly MetadataProvider[];
  /** Undefined until the shell supplies a player factory. */
  readonly createPlayer: (() => PlayerAdapter) | undefined;
  // TODO(Phase 1): addon engine, metadata resolver, debrid resolver, library
  // surfaces hang off here (§6, §5, §10).
}

export function createCore(deps: CoreDependencies): Core {
  return {
    adapters: {
      storage: deps.storage,
      http: deps.http,
    },
    providers: deps.providers ?? [],
    createPlayer: deps.playerFactory,
  };
}
