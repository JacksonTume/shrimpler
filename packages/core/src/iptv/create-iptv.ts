// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — IPTV config + addon build. Sources are user-supplied M3U
// playlist URLs and Xtream Codes accounts (neutrality §14.3: none bundled),
// persisted via the StorageAdapter. Mirrors the TMDB-key / Real-Debrid-token
// pattern: config is stored here; applying it means rebuilding the core
// (reloadCore), which re-runs buildIptvAddon to fetch every source, classify M3U
// into live/movies/series, merge with Xtream, and build one internal addon.

import type { HttpAdapter } from "../adapters/http";
import type { StorageAdapter } from "../adapters/storage";
import type { AddonEngineErrorHandler } from "../addon/create-engine";
import type { InternalAddon } from "../addon/internal-addon";
import { normalizeManifestUrl } from "../addon/manifest";
import { createIptvAddon } from "./iptv-addon";
import { classifyM3U } from "./classify-m3u";
import { parseM3U } from "./parse-m3u";
import { mergeIptvContent } from "./content";
import type { IptvContent } from "./content";
import { fetchXtreamContent } from "./xtream";
import type { XtreamAccount } from "./xtream";

/** Storage keys for the user's IPTV sources (read at core-build time). */
export const IPTV_PLAYLISTS_STORAGE_KEY = "settings:iptvPlaylists";
export const IPTV_XTREAM_STORAGE_KEY = "settings:iptvXtream";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface IptvPlaylist {
  url: string;
  addedAt: number;
  name?: string;
}

export interface IptvService {
  listPlaylists(): Promise<IptvPlaylist[]>;
  /** Validate + persist a playlist URL (no-op if already present). */
  addPlaylist(url: string): Promise<void>;
  removePlaylist(url: string): Promise<void>;
  listXtreamAccounts(): Promise<XtreamAccount[]>;
  /** Validate + persist an Xtream account (no-op if host+username present). */
  addXtreamAccount(account: XtreamAccount): Promise<void>;
  removeXtreamAccount(host: string, username: string): Promise<void>;
}

export interface BuildIptvAddonDeps {
  http: HttpAdapter;
  storage: StorageAdapter;
  timeoutMs?: number;
  /** Per-source fetch/parse failures are reported here, never thrown. */
  onError?: AddonEngineErrorHandler;
}

async function readPlaylists(storage: StorageAdapter): Promise<IptvPlaylist[]> {
  return (await storage.get<IptvPlaylist[]>(IPTV_PLAYLISTS_STORAGE_KEY)) ?? [];
}

async function readXtreamAccounts(
  storage: StorageAdapter,
): Promise<XtreamAccount[]> {
  return (await storage.get<XtreamAccount[]>(IPTV_XTREAM_STORAGE_KEY)) ?? [];
}

/**
 * Fetch every persisted source into one internal IPTV addon, or undefined when
 * none are configured (so the engine's internalAddons stays empty). M3U entries
 * are classified into live/movies/series; Xtream accounts are fetched via the
 * player_api. A source that fails to fetch/parse is isolated and reported.
 */
export async function buildIptvAddon(
  deps: BuildIptvAddonDeps,
): Promise<InternalAddon | undefined> {
  const { http, storage, onError } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const playlists = await readPlaylists(storage);
  const accounts = await readXtreamAccounts(storage);
  if (playlists.length === 0 && accounts.length === 0) {
    return undefined;
  }

  const parts: IptvContent[] = [];

  for (const playlist of playlists) {
    try {
      const response = await http.get(playlist.url, { timeoutMs });
      if (!response.ok) {
        throw new Error(`Playlist fetch failed (${response.status})`);
      }
      parts.push(classifyM3U(parseM3U(await response.text())));
    } catch (error) {
      onError?.({ manifestUrl: playlist.url, resource: "manifest", error });
    }
  }

  for (let i = 0; i < accounts.length; i += 1) {
    const account = accounts[i]!;
    try {
      parts.push(
        await fetchXtreamContent({
          http,
          account,
          accountKey: `xt${i}`,
          timeoutMs,
        }),
      );
    } catch (error) {
      onError?.({ manifestUrl: account.host, resource: "manifest", error });
    }
  }

  return createIptvAddon(mergeIptvContent(parts));
}

/** The core.iptv surface: manage the persisted sources (storage only). */
export function createIptvService(deps: {
  storage: StorageAdapter;
}): IptvService {
  const { storage } = deps;

  return {
    listPlaylists: () => readPlaylists(storage),

    async addPlaylist(url: string): Promise<void> {
      // Reuse the addon URL validator (http(s) only); throws on a bad URL.
      const normalized = normalizeManifestUrl(url);
      const playlists = await readPlaylists(storage);
      if (playlists.some((p) => p.url === normalized)) {
        return;
      }
      playlists.push({ url: normalized, addedAt: Date.now() });
      await storage.set(IPTV_PLAYLISTS_STORAGE_KEY, playlists);
    },

    async removePlaylist(url: string): Promise<void> {
      const playlists = await readPlaylists(storage);
      await storage.set(
        IPTV_PLAYLISTS_STORAGE_KEY,
        playlists.filter((p) => p.url !== url),
      );
    },

    listXtreamAccounts: () => readXtreamAccounts(storage),

    async addXtreamAccount(account: XtreamAccount): Promise<void> {
      // Validate the host is an http(s) URL (throws otherwise).
      const host = normalizeManifestUrl(account.host).replace(/\/+$/, "");
      const username = account.username.trim();
      const password = account.password;
      if (username === "" || password === "") {
        return;
      }
      const accounts = await readXtreamAccounts(storage);
      if (accounts.some((a) => a.host === host && a.username === username)) {
        return;
      }
      accounts.push({ host, username, password });
      await storage.set(IPTV_XTREAM_STORAGE_KEY, accounts);
    },

    async removeXtreamAccount(host: string, username: string): Promise<void> {
      const accounts = await readXtreamAccounts(storage);
      await storage.set(
        IPTV_XTREAM_STORAGE_KEY,
        accounts.filter((a) => !(a.host === host && a.username === username)),
      );
    },
  };
}
