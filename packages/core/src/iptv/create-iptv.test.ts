// SPDX-License-Identifier: AGPL-3.0-or-later
// buildIptvAddon (cache-only) + refreshIptvSources (network) + createIptvService
// tests: refresh fetches/parses/persists snapshots over a route-table HttpAdapter
// + in-memory storage; build serves from those snapshots; staleness TTL, change
// detection, per-source failure isolation, snapshot pruning, Xtream loadEpisodes
// rehydration, and source persistence round-trips. Plain Node, no real I/O (§2.2).

import { describe, expect, it, vi } from "vitest";
import type { HttpAdapter, HttpResponse } from "../adapters/http";
import type { StorageAdapter } from "../adapters/storage";
import {
  IPTV_PLAYLISTS_STORAGE_KEY,
  IPTV_XTREAM_STORAGE_KEY,
  buildIptvAddon,
  createIptvService,
  refreshIptvSources,
  xtreamSourceKey,
} from "./create-iptv";
import type { IptvPlaylist } from "./create-iptv";
import { createIptvContentCache } from "./iptv-cache";
import type { IptvContentCache } from "./iptv-cache";
import type { XtreamAccount } from "./xtream";

function memoryStorage(seed: Record<string, unknown> = {}): StorageAdapter {
  const store = new Map<string, unknown>(Object.entries(seed));
  return {
    get: <T>(key: string) => Promise.resolve((store.get(key) as T) ?? null),
    set: (key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    keys: (prefix = "") =>
      Promise.resolve(
        [...store.keys()].filter((k) => k.startsWith(prefix)),
      ),
  };
}

function textResponse(body: string, ok = true, status = 200): HttpResponse {
  return {
    status,
    ok,
    text: () => Promise.resolve(body),
    json: <T>() => Promise.resolve(JSON.parse(body) as T),
  };
}

/** HttpAdapter serving a fixed route table; unknown URLs 404. */
function routeHttp(routes: Record<string, HttpResponse>): HttpAdapter {
  return {
    get: (url) =>
      Promise.resolve(routes[url] ?? textResponse("not found", false, 404)),
    post: () => Promise.reject(new Error("unused")),
  };
}

const PLAYLIST_A = ['#EXTINF:-1 tvg-id="a",A', "http://h/a.ts"].join("\n");
const PLAYLIST_B = ['#EXTINF:-1 tvg-id="b",B', "http://h/b.ts"].join("\n");

/** Build the addon after refreshing over the given routes; returns both. */
async function refreshThenBuild(
  storage: StorageAdapter,
  http: HttpAdapter,
  cache: IptvContentCache,
  onError?: ReturnType<typeof vi.fn>,
) {
  const result = await refreshIptvSources({ storage, http, cache, onError });
  const addon = await buildIptvAddon({ storage, http, cache });
  return { result, addon };
}

describe("buildIptvAddon (cache-only)", () => {
  it("returns undefined when there are no sources", async () => {
    const storage = memoryStorage();
    const addon = await buildIptvAddon({
      http: routeHttp({}),
      storage,
      cache: createIptvContentCache({ storage }),
    });
    expect(addon).toBeUndefined();
  });

  it("returns undefined when sources are configured but not yet cached", async () => {
    const storage = memoryStorage({
      [IPTV_PLAYLISTS_STORAGE_KEY]: [
        { url: "http://p/a.m3u", addedAt: 1 },
      ] satisfies IptvPlaylist[],
    });
    // No refresh has run, so no snapshot exists — nothing to serve.
    const addon = await buildIptvAddon({
      http: routeHttp({}),
      storage,
      cache: createIptvContentCache({ storage }),
    });
    expect(addon).toBeUndefined();
  });

  it("serves concatenated playlists from cached snapshots after a refresh", async () => {
    const storage = memoryStorage({
      [IPTV_PLAYLISTS_STORAGE_KEY]: [
        { url: "http://p/a.m3u", addedAt: 1 },
        { url: "http://p/b.m3u", addedAt: 2 },
      ] satisfies IptvPlaylist[],
    });
    const cache = createIptvContentCache({ storage });
    const { addon } = await refreshThenBuild(
      storage,
      routeHttp({
        "http://p/a.m3u": textResponse(PLAYLIST_A),
        "http://p/b.m3u": textResponse(PLAYLIST_B),
      }),
      cache,
    );
    const all = await addon!.getCatalog("tv", "iptv:live");
    expect(all.map((c) => c.id)).toEqual(["iptv:live:a", "iptv:live:b"]);
  });

  it("classifies M3U entries into live channels, movies, and series", async () => {
    const mixed = [
      '#EXTINF:-1 tvg-id="c",Channel',
      "http://h/live/1.ts",
      "#EXTINF:-1,Some Movie",
      "http://h/movie/9.mkv",
      "#EXTINF:-1,My Show S01E01",
      "http://h/series/1.mkv",
    ].join("\n");
    const storage = memoryStorage({
      [IPTV_PLAYLISTS_STORAGE_KEY]: [
        { url: "http://p/mixed.m3u", addedAt: 1 },
      ] satisfies IptvPlaylist[],
    });
    const cache = createIptvContentCache({ storage });
    const { addon } = await refreshThenBuild(
      storage,
      routeHttp({ "http://p/mixed.m3u": textResponse(mixed) }),
      cache,
    );

    expect(
      (await addon!.getCatalog("tv", "iptv:live")).map((c) => c.id),
    ).toEqual(["iptv:live:c"]);
    expect(await addon!.getCatalog("movie", "iptv:movies")).toHaveLength(1);
    const series = await addon!.getCatalog("series", "iptv:series");
    expect(series.map((s) => s.name)).toEqual(["My Show"]);
  });
});

/** Minimal Xtream HttpAdapter: answers by `action`, with a captured call count. */
function xtreamHttp(overrides: Record<string, unknown> = {}): {
  http: HttpAdapter;
  calls: () => number;
} {
  let calls = 0;
  const bodies: Record<string, unknown> = {
    get_vod_streams: [{ stream_id: 2, name: "Xtream Movie" }],
    get_series: [{ series_id: 5, name: "Xtream Show" }],
    get_series_info: { episodes: { "1": [{ id: 77, episode_num: 1 }] } },
    ...overrides,
  };
  return {
    calls: () => calls,
    http: {
      get: (url) => {
        calls += 1;
        const action = /[?&]action=([^&]+)/.exec(url)?.[1] ?? "";
        const body = bodies[action] ?? [];
        return Promise.resolve(textResponse(JSON.stringify(body)));
      },
      post: () => Promise.reject(new Error("unused")),
    },
  };
}

describe("refreshIptvSources", () => {
  const account: XtreamAccount = {
    host: "http://x:8080",
    username: "u",
    password: "p",
  };

  it("merges an Xtream account with a stable, index-independent id", async () => {
    const storage = memoryStorage({
      [IPTV_XTREAM_STORAGE_KEY]: [account] satisfies XtreamAccount[],
    });
    const cache = createIptvContentCache({ storage });
    const { http } = xtreamHttp();
    const { addon } = await refreshThenBuild(storage, http, cache);
    const movies = await addon!.getCatalog("movie", "iptv:movies");
    // Id namespace is the deterministic account key (xt-<hash>), not xt0.
    expect(movies).toHaveLength(1);
    expect(movies[0]!.id).toMatch(/^iptv:movie:xt-[a-z0-9]+-2$/);
  });

  it("skips a fresh source but re-fetches once stale (or forced)", async () => {
    const storage = memoryStorage({
      [IPTV_PLAYLISTS_STORAGE_KEY]: [
        { url: "http://p/a.m3u", addedAt: 1 },
      ] satisfies IptvPlaylist[],
    });
    let clock = 1_000;
    const now = () => clock;
    const cache = createIptvContentCache({ storage, now });
    const http = routeHttp({ "http://p/a.m3u": textResponse(PLAYLIST_A) });
    const getSpy = vi.spyOn(http, "get");

    await refreshIptvSources({ storage, http, cache, now, ttlMs: 1_000 });
    expect(getSpy).toHaveBeenCalledTimes(1);

    // Within the TTL → skipped.
    clock += 500;
    await refreshIptvSources({ storage, http, cache, now, ttlMs: 1_000 });
    expect(getSpy).toHaveBeenCalledTimes(1);

    // Past the TTL → re-fetched.
    clock += 1_000;
    await refreshIptvSources({ storage, http, cache, now, ttlMs: 1_000 });
    expect(getSpy).toHaveBeenCalledTimes(2);

    // force ignores freshness.
    await refreshIptvSources(
      { storage, http, cache, now, ttlMs: 1_000 },
      { force: true },
    );
    expect(getSpy).toHaveBeenCalledTimes(3);
  });

  it("reports changed only when content actually differs", async () => {
    const storage = memoryStorage({
      [IPTV_PLAYLISTS_STORAGE_KEY]: [
        { url: "http://p/a.m3u", addedAt: 1 },
      ] satisfies IptvPlaylist[],
    });
    const cache = createIptvContentCache({ storage });
    const http = routeHttp({ "http://p/a.m3u": textResponse(PLAYLIST_A) });

    const first = await refreshIptvSources({ storage, http, cache });
    expect(first.changed).toBe(true); // first fetch writes a new snapshot

    const second = await refreshIptvSources(
      { storage, http, cache },
      { force: true },
    );
    expect(second.changed).toBe(false); // identical content → no change
  });

  it("isolates a failing source via onError and keeps the good one", async () => {
    const onError = vi.fn();
    const storage = memoryStorage({
      [IPTV_PLAYLISTS_STORAGE_KEY]: [
        { url: "http://p/ok.m3u", addedAt: 1 },
        { url: "http://p/bad.m3u", addedAt: 2 },
      ] satisfies IptvPlaylist[],
    });
    const cache = createIptvContentCache({ storage });
    const { addon } = await refreshThenBuild(
      storage,
      routeHttp({ "http://p/ok.m3u": textResponse(PLAYLIST_A) }),
      cache,
      onError,
    );
    expect(
      (await addon!.getCatalog("tv", "iptv:live")).map((c) => c.id),
    ).toEqual(["iptv:live:a"]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      manifestUrl: "http://p/bad.m3u",
      resource: "manifest",
    });
  });

  it("rehydrates Xtream episode loaders after a cache round-trip", async () => {
    const storage = memoryStorage({
      [IPTV_XTREAM_STORAGE_KEY]: [account] satisfies XtreamAccount[],
    });
    const cache = createIptvContentCache({ storage });
    const { http } = xtreamHttp();
    await refreshIptvSources({ storage, http, cache });
    // Build reads the snapshot (loadEpisodes closure was dropped by serialization)
    // and must reconstruct the loader from source.xtreamSeriesId + the account.
    const addon = await buildIptvAddon({ storage, http, cache });
    const series = await addon!.getCatalog("series", "iptv:series");
    const meta = await addon!.getMeta(series[0]!.id, "series");
    expect(meta?.videos).toHaveLength(1);
    expect(meta?.videos?.[0]).toMatchObject({ season: 1, episode: 1 });
  });

  it("reports progress for each stale source and its fetch phases", async () => {
    const storage = memoryStorage({
      [IPTV_PLAYLISTS_STORAGE_KEY]: [
        { url: "http://p/a.m3u", addedAt: 1 },
        { url: "http://p/b.m3u", addedAt: 2 },
      ] satisfies IptvPlaylist[],
    });
    const cache = createIptvContentCache({ storage });
    const http = routeHttp({
      "http://p/a.m3u": textResponse(PLAYLIST_A),
      "http://p/b.m3u": textResponse(PLAYLIST_B),
    });
    const events: Array<{
      total: number;
      completed: number;
      phase?: string;
    }> = [];
    await refreshIptvSources(
      { storage, http, cache },
      { onProgress: (p) => events.push(p) },
    );

    // Total reflects the two stale sources; both complete.
    expect(events.every((e) => e.total === 2)).toBe(true);
    expect(Math.max(...events.map((e) => e.completed))).toBe(2);
    // M3U fetch phases are reported.
    expect(events.map((e) => e.phase)).toEqual(
      expect.arrayContaining(["download", "parse"]),
    );
  });

  it("prunes snapshots for sources that are no longer configured", async () => {
    const storage = memoryStorage({
      [IPTV_PLAYLISTS_STORAGE_KEY]: [
        { url: "http://p/a.m3u", addedAt: 1 },
      ] satisfies IptvPlaylist[],
    });
    const cache = createIptvContentCache({ storage });
    const http = routeHttp({ "http://p/a.m3u": textResponse(PLAYLIST_A) });
    await refreshIptvSources({ storage, http, cache });
    expect(await cache.listSourceKeys()).toEqual(["m3u:http://p/a.m3u"]);

    // Drop the playlist from config, then refresh → its snapshot is pruned.
    await storage.set(IPTV_PLAYLISTS_STORAGE_KEY, [] satisfies IptvPlaylist[]);
    await refreshIptvSources({ storage, http, cache });
    expect(await cache.listSourceKeys()).toEqual([]);
  });
});

describe("createIptvService", () => {
  const deps = (storage: StorageAdapter) => ({
    storage,
    http: routeHttp({}),
    cache: createIptvContentCache({ storage }),
  });

  it("adds, lists, and removes playlists (persistence round-trip)", async () => {
    const storage = memoryStorage();
    const iptv = createIptvService(deps(storage));

    await iptv.addPlaylist("http://p/a.m3u");
    await iptv.addPlaylist("http://p/a.m3u"); // duplicate is a no-op
    await iptv.addPlaylist("http://p/b.m3u");
    expect((await iptv.listPlaylists()).map((p) => p.url)).toEqual([
      "http://p/a.m3u",
      "http://p/b.m3u",
    ]);

    await iptv.removePlaylist("http://p/a.m3u");
    expect((await iptv.listPlaylists()).map((p) => p.url)).toEqual([
      "http://p/b.m3u",
    ]);
  });

  it("deletes the cached snapshot when a playlist is removed", async () => {
    const storage = memoryStorage();
    const cache = createIptvContentCache({ storage });
    const http = routeHttp({ "http://p/a.m3u": textResponse(PLAYLIST_A) });
    const iptv = createIptvService({ storage, http, cache });

    await iptv.addPlaylist("http://p/a.m3u");
    await iptv.refresh();
    expect(await cache.listSourceKeys()).toEqual(["m3u:http://p/a.m3u"]);

    await iptv.removePlaylist("http://p/a.m3u");
    expect(await cache.readContent("m3u:http://p/a.m3u")).toBeNull();
  });

  it("rejects a non-http(s) playlist URL", async () => {
    const iptv = createIptvService(deps(memoryStorage()));
    await expect(iptv.addPlaylist("ftp://nope")).rejects.toThrow();
  });

  it("adds, lists, and removes Xtream accounts (host+username keyed)", async () => {
    const storage = memoryStorage();
    const iptv = createIptvService(deps(storage));

    await iptv.addXtreamAccount({
      host: "http://x:8080/",
      username: "u",
      password: "p",
    });
    // Same host+username is a no-op; the trailing slash was normalized off.
    await iptv.addXtreamAccount({
      host: "http://x:8080",
      username: "u",
      password: "other",
    });
    const accounts = await iptv.listXtreamAccounts();
    expect(accounts).toEqual([
      { host: "http://x:8080", username: "u", password: "p" },
    ]);

    await iptv.removeXtreamAccount("http://x:8080", "u");
    expect(await iptv.listXtreamAccounts()).toEqual([]);
  });

  it("deletes the cached snapshot when an Xtream account is removed", async () => {
    const storage = memoryStorage();
    const cache = createIptvContentCache({ storage });
    const { http } = xtreamHttp();
    const iptv = createIptvService({ storage, http, cache });
    const account: XtreamAccount = {
      host: "http://x:8080",
      username: "u",
      password: "p",
    };

    await iptv.addXtreamAccount(account);
    await iptv.refresh();
    const key = xtreamSourceKey(account);
    expect(await cache.readContent(key)).not.toBeNull();

    await iptv.removeXtreamAccount(account.host, account.username);
    expect(await cache.readContent(key)).toBeNull();
  });

  it("refreshes nothing over the network when disabled, but keeps config live", async () => {
    const storage = memoryStorage({
      [IPTV_PLAYLISTS_STORAGE_KEY]: [
        { url: "http://p/a.m3u", addedAt: 1 },
      ] satisfies IptvPlaylist[],
    });
    const cache = createIptvContentCache({ storage });
    const get = vi.fn(() => Promise.resolve(textResponse(PLAYLIST_A)));
    const http: HttpAdapter = {
      get,
      post: () => Promise.reject(new Error("unused")),
    };
    const iptv = createIptvService({ storage, http, cache, enabled: false });

    // Even forced — the gate is about never touching the user's IPTV servers.
    expect(await iptv.refresh({ force: true })).toEqual({ changed: false });
    expect(get).not.toHaveBeenCalled();
    expect(await cache.listSourceKeys()).toEqual([]);

    // Saved sources are still readable/writable, so flipping the gate back on
    // picks up where it left off rather than starting from an empty config.
    await iptv.addPlaylist("http://p/b.m3u");
    expect((await iptv.listPlaylists()).map((p) => p.url)).toEqual([
      "http://p/a.m3u",
      "http://p/b.m3u",
    ]);
  });
});
