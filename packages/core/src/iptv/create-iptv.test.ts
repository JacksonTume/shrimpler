// SPDX-License-Identifier: AGPL-3.0-or-later
// buildIptvAddon + createIptvService tests: playlist fetch/parse/concat over a
// route-table HttpAdapter + in-memory storage, per-playlist failure isolation,
// and playlist persistence round-trips. Plain Node, no real I/O (§2.2).

import { describe, expect, it, vi } from "vitest";
import type { HttpAdapter, HttpResponse } from "../adapters/http";
import type { StorageAdapter } from "../adapters/storage";
import {
  IPTV_PLAYLISTS_STORAGE_KEY,
  IPTV_XTREAM_STORAGE_KEY,
  buildIptvAddon,
  createIptvService,
} from "./create-iptv";
import type { IptvPlaylist } from "./create-iptv";
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
    keys: () => Promise.resolve([...store.keys()]),
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

describe("buildIptvAddon", () => {
  it("returns undefined when there are no playlists", async () => {
    const addon = await buildIptvAddon({
      http: routeHttp({}),
      storage: memoryStorage(),
    });
    expect(addon).toBeUndefined();
  });

  it("fetches, parses, and concatenates multiple playlists", async () => {
    const storage = memoryStorage({
      [IPTV_PLAYLISTS_STORAGE_KEY]: [
        { url: "http://p/a.m3u", addedAt: 1 },
        { url: "http://p/b.m3u", addedAt: 2 },
      ] satisfies IptvPlaylist[],
    });
    const addon = await buildIptvAddon({
      http: routeHttp({
        "http://p/a.m3u": textResponse(PLAYLIST_A),
        "http://p/b.m3u": textResponse(PLAYLIST_B),
      }),
      storage,
    });
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
    const addon = await buildIptvAddon({
      http: routeHttp({ "http://p/mixed.m3u": textResponse(mixed) }),
      storage,
    });

    expect(
      (await addon!.getCatalog("tv", "iptv:live")).map((c) => c.id),
    ).toEqual(["iptv:live:c"]);
    expect(await addon!.getCatalog("movie", "iptv:movies")).toHaveLength(1);
    const series = await addon!.getCatalog("series", "iptv:series");
    expect(series.map((s) => s.name)).toEqual(["My Show"]);
  });

  it("merges an Xtream account alongside playlists", async () => {
    const storage = memoryStorage({
      [IPTV_XTREAM_STORAGE_KEY]: [
        { host: "http://x:8080", username: "u", password: "p" },
      ] satisfies XtreamAccount[],
    });
    const http: HttpAdapter = {
      get: (url) => {
        const action = /[?&]action=([^&]+)/.exec(url)?.[1];
        const body =
          action === "get_vod_streams"
            ? [{ stream_id: 2, name: "Xtream Movie" }]
            : [];
        return Promise.resolve(textResponse(JSON.stringify(body)));
      },
      post: () => Promise.reject(new Error("unused")),
    };
    const addon = await buildIptvAddon({ http, storage });
    expect(
      (await addon!.getCatalog("movie", "iptv:movies")).map((m) => m.id),
    ).toEqual(["iptv:movie:xt0-2"]);
  });

  it("isolates a failing playlist and reports it via onError", async () => {
    const onError = vi.fn();
    const storage = memoryStorage({
      [IPTV_PLAYLISTS_STORAGE_KEY]: [
        { url: "http://p/ok.m3u", addedAt: 1 },
        { url: "http://p/bad.m3u", addedAt: 2 },
      ] satisfies IptvPlaylist[],
    });
    const addon = await buildIptvAddon({
      http: routeHttp({ "http://p/ok.m3u": textResponse(PLAYLIST_A) }),
      storage,
      onError,
    });
    // The good playlist still yields its channel …
    expect(
      (await addon!.getCatalog("tv", "iptv:live")).map((c) => c.id),
    ).toEqual(["iptv:live:a"]);
    // … and the bad one is reported, not thrown.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      manifestUrl: "http://p/bad.m3u",
      resource: "manifest",
    });
  });
});

describe("createIptvService", () => {
  it("adds, lists, and removes playlists (persistence round-trip)", async () => {
    const storage = memoryStorage();
    const iptv = createIptvService({ storage });

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

  it("rejects a non-http(s) playlist URL", async () => {
    const iptv = createIptvService({ storage: memoryStorage() });
    await expect(iptv.addPlaylist("ftp://nope")).rejects.toThrow();
  });

  it("adds, lists, and removes Xtream accounts (host+username keyed)", async () => {
    const iptv = createIptvService({ storage: memoryStorage() });

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
});
