// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — IPTV config + addon build. Sources are user-supplied M3U
// playlist URLs and Xtream Codes accounts (neutrality §14.3: none bundled),
// persisted via the StorageAdapter. Config is stored here; the channels are
// served as an internal addon through the engine.
//
// Loading is split so a slow subscription (minutes to fetch + parse) never blocks
// the app: buildIptvAddon is CACHE-ONLY (it serves persisted per-source snapshots
// and never touches the network), so startup and reloadCore are instant. The
// network fetch lives in refreshIptvSources, run in the background — it fetches
// each missing/stale source, updates its snapshot, and reports whether anything
// changed so the shell can rebuild once. See iptv-cache.ts for the snapshot store.

import type { HttpAdapter } from "../adapters/http";
import type { StorageAdapter } from "../adapters/storage";
import type { AddonEngineErrorHandler } from "../addon/create-engine";
import type { InternalAddon } from "../addon/internal-addon";
import { normalizeManifestUrl } from "../addon/manifest";
import { hashString } from "../util/hash";
import { createIptvAddon } from "./iptv-addon";
import { classifyM3U } from "./classify-m3u";
import { parseM3U } from "./parse-m3u";
import { mergeIptvContent } from "./content";
import type { IptvContent } from "./content";
import {
  attachEpisodeLoaders,
  fetchXtreamContent,
  xtreamAccountKey,
} from "./xtream";
import type { XtreamAccount } from "./xtream";
import type { IptvContentCache } from "./iptv-cache";

/** Storage keys for the user's IPTV sources (read at core-build time). */
export const IPTV_PLAYLISTS_STORAGE_KEY = "settings:iptvPlaylists";
export const IPTV_XTREAM_STORAGE_KEY = "settings:iptvXtream";

const DEFAULT_TIMEOUT_MS = 15_000;
/**
 * How long a snapshot is considered fresh before a background refresh re-fetches
 * it. Also what terminates the refresh→reload cycle: a just-written snapshot is
 * fresh, so the refresh that runs after the reload is a no-op. Tune per taste
 * (shorter = fresher content, more frequent multi-minute background fetches).
 */
export const DEFAULT_IPTV_STALE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface IptvPlaylist {
  url: string;
  addedAt: number;
  name?: string;
}

/** Content-cache source key for an M3U playlist (stable per normalized url). */
export function m3uSourceKey(url: string): string {
  return `m3u:${url}`;
}

/** Content-cache source key for an Xtream account (stable per host+username). */
export function xtreamSourceKey(
  account: Pick<XtreamAccount, "host" | "username">,
): string {
  return `xtream:${xtreamAccountKey(account)}`;
}

/** Signature of a snapshot body (functions like loadEpisodes are dropped by JSON,
 *  so fresh and cached content of the same source hash identically). */
function contentSignature(content: IptvContent): string {
  return hashString(JSON.stringify(content));
}

/** Fetch + parse + classify one M3U playlist. Throws on a non-ok response. */
async function fetchPlaylistContent(
  http: HttpAdapter,
  url: string,
  timeoutMs: number,
  onPhase?: (phase: "download" | "parse") => void,
): Promise<IptvContent> {
  onPhase?.("download");
  const response = await http.get(url, { timeoutMs });
  if (!response.ok) {
    throw new Error(`Playlist fetch failed (${response.status})`);
  }
  const text = await response.text();
  onPhase?.("parse");
  return classifyM3U(parseM3U(text));
}

async function readPlaylists(storage: StorageAdapter): Promise<IptvPlaylist[]> {
  return (await storage.get<IptvPlaylist[]>(IPTV_PLAYLISTS_STORAGE_KEY)) ?? [];
}

async function readXtreamAccounts(
  storage: StorageAdapter,
): Promise<XtreamAccount[]> {
  return (await storage.get<XtreamAccount[]>(IPTV_XTREAM_STORAGE_KEY)) ?? [];
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
  /**
   * Background refresh: fetch each missing/stale source, update its snapshot, and
   * report whether any content changed (so the shell rebuilds only when needed).
   * Pass `{ force: true }` to ignore the staleness TTL (used right after an add).
   * Gated off (CoreFeatures.iptv) this resolves `{ changed: false }` without
   * touching the network — `force` included.
   */
  refresh(options?: RefreshIptvOptions): Promise<{ changed: boolean }>;
}

export interface BuildIptvAddonDeps {
  storage: StorageAdapter;
  http: HttpAdapter;
  cache: IptvContentCache;
}

/**
 * Build one internal IPTV addon from persisted snapshots of the configured
 * sources — CACHE-ONLY, no network. Returns undefined when no source has a
 * snapshot yet (so the engine's internalAddons stays empty until the first
 * background refresh populates the cache). Xtream series regain their lazy episode
 * loaders here (the closure doesn't survive serialization).
 */
export async function buildIptvAddon(
  deps: BuildIptvAddonDeps,
): Promise<InternalAddon | undefined> {
  const { storage, http, cache } = deps;
  const playlists = await readPlaylists(storage);
  const accounts = await readXtreamAccounts(storage);
  if (playlists.length === 0 && accounts.length === 0) {
    return undefined;
  }

  const parts: IptvContent[] = [];

  for (const playlist of playlists) {
    const content = await cache.readContent(m3uSourceKey(playlist.url));
    if (content !== null) {
      parts.push(content);
    }
  }

  for (const account of accounts) {
    const content = await cache.readContent(xtreamSourceKey(account));
    if (content !== null) {
      parts.push(attachEpisodeLoaders(content, { http, account }));
    }
  }

  if (parts.length === 0) {
    return undefined;
  }
  return createIptvAddon(mergeIptvContent(parts));
}

export interface RefreshIptvSourcesDeps {
  storage: StorageAdapter;
  http: HttpAdapter;
  cache: IptvContentCache;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
  /** Per-source fetch failures are reported here, never thrown. */
  onError?: AddonEngineErrorHandler;
}

/** Coarse sub-step of a single source's fetch (drives the refresh indicator). */
export type IptvRefreshPhase =
  | "download" // fetching M3U playlist text
  | "parse" // parsing/classifying the M3U
  | "categories" // Xtream category lists
  | "streams"; // Xtream live/movie/series lists

export interface IptvRefreshProgress {
  /** Number of sources being refreshed this pass (0 when nothing is stale). */
  total: number;
  /** Sources fully processed so far. */
  completed: number;
  /** Current sub-step, present while a source is mid-fetch. */
  phase?: IptvRefreshPhase;
}

export interface RefreshIptvOptions {
  /** Ignore the staleness TTL and re-fetch every configured source. */
  force?: boolean;
  /** Progress callback for the (potentially slow) fetch. */
  onProgress?: (progress: IptvRefreshProgress) => void;
}

/**
 * Fetch each configured source that is missing or stale, persist its snapshot,
 * and prune snapshots for sources no longer configured. A per-source fetch
 * failure is isolated (reported via onError) and leaves the prior snapshot
 * intact. Returns whether any source's content actually changed.
 */
export async function refreshIptvSources(
  deps: RefreshIptvSourcesDeps,
  options: RefreshIptvOptions = {},
): Promise<{ changed: boolean }> {
  const { storage, http, cache, onError } = deps;
  const now = deps.now ?? (() => Date.now());
  const ttlMs = deps.ttlMs ?? DEFAULT_IPTV_STALE_TTL_MS;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const force = options.force ?? false;
  const onProgress = options.onProgress;

  const playlists = await readPlaylists(storage);
  const accounts = await readXtreamAccounts(storage);
  const validKeys = new Set<string>();
  let changed = false;

  const isFresh = (fetchedAt: number): boolean => now() - fetchedAt < ttlMs;

  // First pass: record every configured key (so pruning is complete) and collect
  // the subset that actually needs a network fetch (missing or stale), so the
  // progress total reflects real work rather than the full source count.
  type Job =
    | { kind: "m3u"; key: string; url: string; sig?: string }
    | { kind: "xtream"; key: string; account: XtreamAccount; sig?: string };
  const jobs: Job[] = [];

  for (const playlist of playlists) {
    const key = m3uSourceKey(playlist.url);
    validKeys.add(key);
    const meta = await cache.readMeta(key);
    if (force || meta === null || !isFresh(meta.fetchedAt)) {
      jobs.push({ kind: "m3u", key, url: playlist.url, sig: meta?.sig });
    }
  }
  for (const account of accounts) {
    const key = xtreamSourceKey(account);
    validKeys.add(key);
    const meta = await cache.readMeta(key);
    if (force || meta === null || !isFresh(meta.fetchedAt)) {
      jobs.push({ kind: "xtream", key, account, sig: meta?.sig });
    }
  }

  const total = jobs.length;
  let completed = 0;
  const report = (phase?: IptvRefreshPhase): void =>
    onProgress?.({ total, completed, phase });
  report();

  for (const job of jobs) {
    try {
      const content =
        job.kind === "m3u"
          ? await fetchPlaylistContent(http, job.url, timeoutMs, (phase) =>
              report(phase),
            )
          : await fetchXtreamContent({
              http,
              account: job.account,
              accountKey: xtreamAccountKey(job.account),
              timeoutMs,
              onPhase: (phase) => report(phase),
            });
      const sig = contentSignature(content);
      const bodyChanged = job.sig !== sig;
      const ok = await cache.write(job.key, content, sig, bodyChanged);
      if (ok && bodyChanged) {
        changed = true;
      }
    } catch (error) {
      const manifestUrl = job.kind === "m3u" ? job.url : job.account.host;
      onError?.({ manifestUrl, resource: "manifest", error });
    }
    completed += 1;
    report();
  }

  // Drop snapshots for sources that are no longer configured.
  for (const key of await cache.listSourceKeys()) {
    if (!validKeys.has(key)) {
      await cache.delete(key);
    }
  }

  return { changed };
}

export interface CreateIptvServiceDeps {
  storage: StorageAdapter;
  http: HttpAdapter;
  cache: IptvContentCache;
  now?: () => number;
  ttlMs?: number;
  onError?: AddonEngineErrorHandler;
  /**
   * Whether the subsystem is on (CoreFeatures.iptv); default true. False makes
   * `refresh` a no-op. Config reads/writes stay live either way — they are pure
   * storage, and keeping them working means a gated-off build doesn't silently
   * lose the user's saved sources.
   */
  enabled?: boolean;
}

/** The core.iptv surface: manage persisted sources + trigger background refresh. */
export function createIptvService(deps: CreateIptvServiceDeps): IptvService {
  const { storage, http, cache, now, ttlMs, onError } = deps;
  const enabled = deps.enabled ?? true;

  return {
    listPlaylists: () => readPlaylists(storage),

    async addPlaylist(url: string): Promise<void> {
      // Reuse the addon URL validator (http(s) only); throws on a bad URL.
      const normalized = normalizeManifestUrl(url);
      const playlists = await readPlaylists(storage);
      if (playlists.some((p) => p.url === normalized)) {
        return;
      }
      playlists.push({ url: normalized, addedAt: now?.() ?? Date.now() });
      await storage.set(IPTV_PLAYLISTS_STORAGE_KEY, playlists);
    },

    async removePlaylist(url: string): Promise<void> {
      const playlists = await readPlaylists(storage);
      await storage.set(
        IPTV_PLAYLISTS_STORAGE_KEY,
        playlists.filter((p) => p.url !== url),
      );
      await cache.delete(m3uSourceKey(url));
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
      await cache.delete(xtreamSourceKey({ host, username }));
    },

    refresh(options?: RefreshIptvOptions): Promise<{ changed: boolean }> {
      if (!enabled) {
        return Promise.resolve({ changed: false });
      }
      return refreshIptvSources(
        { storage, http, cache, now, ttlMs, onError },
        options,
      );
    },
  };
}
