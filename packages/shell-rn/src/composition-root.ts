// SPDX-License-Identifier: AGPL-3.0-or-later
// The RN shell's composition root — the one place concrete mobile adapters meet
// the pure core. Mirrors the web shell's createWebCore: same provider wiring,
// same two storage keys (imported from shared-ui so RN and web read the same
// persisted settings), swapping the browser adapters for RN ones.
//
// Unlike web, there is no build-time env fallback for keys (no import.meta):
// keys are entered at runtime via the Settings screen and read back from storage
// here; absent → no provider, and the app runs on addon meta alone.

import { createCore, RealDebridProvider, TmdbProvider } from "@shrimpler/core";
import type {
  Core,
  DebridProvider,
  HttpAdapter,
  MetadataProvider,
  StorageAdapter,
} from "@shrimpler/core";
import {
  REAL_DEBRID_TOKEN_STORAGE_KEY,
  TMDB_API_KEY_STORAGE_KEY,
} from "@shrimpler/shared-ui";
import { RnHttpAdapter } from "./adapters/rn-http";
import { RnStorageAdapter } from "./adapters/rn-storage";
import { RnVideoPlayerAdapter } from "./adapters/rn-video-player";
import { isIptvEnabled } from "./features";

// `__DEV__` is a react-native global (defined by Metro), undefined under Node/
// Vitest — guard with typeof so this module is safe to import in tests.
const isDev = typeof __DEV__ !== "undefined" && __DEV__;

async function metadataProviders(
  http: HttpAdapter,
  storage: StorageAdapter,
): Promise<MetadataProvider[]> {
  const apiKey = await storage.get<string>(TMDB_API_KEY_STORAGE_KEY);
  return apiKey === null || apiKey === ""
    ? []
    : [new TmdbProvider({ http, apiKey })];
}

async function debridProvider(
  http: HttpAdapter,
  storage: StorageAdapter,
): Promise<DebridProvider | undefined> {
  const token = await storage.get<string>(REAL_DEBRID_TOKEN_STORAGE_KEY);
  return token === null || token === ""
    ? undefined
    : new RealDebridProvider({ http, token });
}

// Async because the addon engine loads persisted state at startup and the TMDB
// key is read from storage. The shell awaits this before first render, and again
// on each reloadCore (settings/IPTV changes rebuild the core).
export async function createRnCore(): Promise<Core> {
  const http = new RnHttpAdapter();
  const storage = new RnStorageAdapter();
  return createCore({
    storage,
    http,
    // One source of truth with the screens (features.ts): the shell decides the
    // gate, core receives it (ADR-0001). Off while IPTV work is paused, so a dev
    // client doesn't refresh playlists/EPG against real subscription servers on
    // every launch.
    features: { iptv: isIptvEnabled() },
    playerFactory: () => new RnVideoPlayerAdapter(),
    providers: await metadataProviders(http, storage),
    debrid: await debridProvider(http, storage),
    onError: isDev
      ? (error) => console.warn("[addon-engine]", error)
      : undefined,
  });
}
