// SPDX-License-Identifier: AGPL-3.0-or-later
// Engine tests run against an in-memory StorageAdapter and a route-table
// HttpAdapter — no network, plain Node (§2.2).

import { describe, expect, it, vi } from "vitest";
import type { HttpAdapter, HttpResponse } from "../adapters/http";
import type { StorageAdapter } from "../adapters/storage";
import { createAddonEngine } from "./create-engine";
import type { AddonEngineError } from "./create-engine";
import { AddonInstallError } from "./manifest";
import { AddonTimeoutError } from "./timeout";

function memoryStorage(): StorageAdapter {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string) =>
      Promise.resolve((store.get(key) as T | undefined) ?? null),
    set: <T>(key: string, value: T) => {
      // Structured clone so the engine's in-memory state and "persisted"
      // state cannot alias each other.
      store.set(key, JSON.parse(JSON.stringify(value)));
      return Promise.resolve();
    },
    delete: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    keys: (prefix = "") =>
      Promise.resolve([...store.keys()].filter((k) => k.startsWith(prefix))),
  };
}

interface Route {
  body?: unknown;
  status?: number;
  delayMs?: number;
}

/** Route-table HttpAdapter that records every requested URL. */
function mockHttp(
  routes: Record<string, Route>,
): HttpAdapter & { calls: string[] } {
  const calls: string[] = [];
  const respond = (route: Route | undefined): Promise<HttpResponse> => {
    const status = route === undefined ? 404 : (route.status ?? 200);
    const body = route?.body;
    const response: HttpResponse = {
      status,
      ok: status >= 200 && status < 300,
      text: () => Promise.resolve(JSON.stringify(body)),
      json: <T>() => Promise.resolve(body as T),
    };
    if (route?.delayMs !== undefined) {
      const delayMs = route.delayMs;
      return new Promise((resolve) => {
        setTimeout(() => resolve(response), delayMs);
      });
    }
    return Promise.resolve(response);
  };
  return {
    calls,
    get: (url) => {
      calls.push(url);
      return respond(routes[url]);
    },
    post: (url) => {
      calls.push(url);
      return respond(routes[url]);
    },
  };
}

const MOVIES_URL = "https://movies.example/manifest.json";
const MOVIES_MANIFEST = {
  id: "org.movies",
  version: "1.0.0",
  name: "Movies",
  resources: ["catalog", "meta", "stream"],
  types: ["movie"],
  catalogs: [{ type: "movie", id: "popular" }],
};

const EXTRAS_URL = "https://extras.example/manifest.json";
const EXTRAS_MANIFEST = {
  id: "org.extras",
  version: "2.0.0",
  name: "Extras",
  resources: ["catalog", "meta", "stream"],
  types: ["movie"],
  catalogs: [{ type: "movie", id: "popular" }],
};

const KITSU_URL = "https://kitsu.example/manifest.json";
const KITSU_MANIFEST = {
  id: "org.kitsu",
  version: "1.0.0",
  name: "Kitsu",
  resources: [{ name: "stream", idPrefixes: ["kitsu"] }],
  types: ["movie"],
};

async function engineWith(
  routes: Record<string, Route>,
  options?: {
    storage?: StorageAdapter;
    timeouts?: { streamMs?: number; catalogMs?: number };
    onError?: (error: AddonEngineError) => void;
  },
) {
  const http = mockHttp(routes);
  const storage = options?.storage ?? memoryStorage();
  const engine = await createAddonEngine({
    http,
    storage,
    timeouts: options?.timeouts,
    onError: options?.onError,
  });
  return { engine, http, storage };
}

describe("install / manage / persist", () => {
  it("installs, normalizes stremio:// URLs, and persists across recreation", async () => {
    const routes = { [MOVIES_URL]: { body: MOVIES_MANIFEST } };
    const { engine, http, storage } = await engineWith(routes);

    const installed = await engine.install(
      "stremio://movies.example/manifest.json",
    );
    expect(http.calls).toEqual([MOVIES_URL]);
    expect(installed.manifestUrl).toBe(MOVIES_URL);
    expect(installed.manifest.id).toBe("org.movies");
    expect(installed.enabled).toBe(true);

    // A new engine over the same storage sees the same state.
    const { engine: reloaded } = await engineWith(routes, { storage });
    expect(reloaded.list().map((a) => a.manifestUrl)).toEqual([MOVIES_URL]);
  });

  it("re-installing the same URL refreshes the manifest in place", async () => {
    const routes: Record<string, Route> = {
      [MOVIES_URL]: { body: MOVIES_MANIFEST },
    };
    const { engine } = await engineWith(routes);
    await engine.install(MOVIES_URL);
    await engine.setEnabled(MOVIES_URL, false);

    routes[MOVIES_URL] = { body: { ...MOVIES_MANIFEST, version: "1.1.0" } };
    await engine.install(MOVIES_URL);

    const list = engine.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.manifest.version).toBe("1.1.0");
    expect(list[0]?.enabled).toBe(false); // enabled state survives refresh
  });

  it("rejects invalid URLs, unreachable hosts, and unusable manifests", async () => {
    const { engine } = await engineWith({
      "https://bad.example/manifest.json": { body: { name: "no id" } },
      "https://down.example/manifest.json": { status: 500, body: {} },
    });
    await expect(engine.install("ftp://nope")).rejects.toBeInstanceOf(
      AddonInstallError,
    );
    await expect(
      engine.install("https://bad.example/manifest.json"),
    ).rejects.toThrow(/required field "id"/);
    await expect(
      engine.install("https://down.example/manifest.json"),
    ).rejects.toThrow(/Could not fetch manifest/);
    expect(engine.list()).toEqual([]);
  });

  it("remove is a no-op for unknown URLs; setEnabled throws for them", async () => {
    const { engine } = await engineWith({
      [MOVIES_URL]: { body: MOVIES_MANIFEST },
    });
    await engine.install(MOVIES_URL);
    await engine.remove("https://unknown.example/manifest.json");
    expect(engine.list()).toHaveLength(1);
    await expect(
      engine.setEnabled("https://unknown.example/manifest.json", true),
    ).rejects.toThrow(/not installed/);

    await engine.remove(MOVIES_URL);
    expect(engine.list()).toEqual([]);
  });
});

describe("catalog fan-out & merge", () => {
  const CATALOG_A = "https://movies.example/catalog/movie/popular.json";
  const CATALOG_B = "https://extras.example/catalog/movie/popular.json";

  it("merges in install order, dedups by id keeping the first occurrence", async () => {
    const { engine } = await engineWith({
      [MOVIES_URL]: { body: MOVIES_MANIFEST },
      [EXTRAS_URL]: { body: EXTRAS_MANIFEST },
      [CATALOG_A]: {
        body: {
          metas: [
            { id: "tt1", type: "movie", name: "One", poster: "a" },
            { id: "tt2", type: "movie", name: "Two" },
          ],
        },
      },
      [CATALOG_B]: {
        body: {
          metas: [
            { id: "tt2", type: "movie", name: "Two (dupe)" },
            { id: "tt3", type: "movie", name: "Three" },
          ],
        },
      },
    });
    await engine.install(MOVIES_URL);
    await engine.install(EXTRAS_URL);

    const items = await engine.getCatalog("movie", "popular");
    expect(items.map((m) => m.id)).toEqual(["tt1", "tt2", "tt3"]);
    expect(items[1]?.name).toBe("Two"); // first-wins
  });

  it("skips disabled addons and addons without the requested catalog", async () => {
    const { engine, http } = await engineWith({
      [MOVIES_URL]: { body: MOVIES_MANIFEST },
      [EXTRAS_URL]: { body: EXTRAS_MANIFEST },
      [CATALOG_A]: {
        body: { metas: [{ id: "tt1", type: "movie", name: "One" }] },
      },
    });
    await engine.install(MOVIES_URL);
    await engine.install(EXTRAS_URL);
    await engine.setEnabled(EXTRAS_URL, false);

    const items = await engine.getCatalog("movie", "popular");
    expect(items.map((m) => m.id)).toEqual(["tt1"]);
    expect(http.calls).not.toContain(CATALOG_B);

    expect(await engine.getCatalog("movie", "nonexistent")).toEqual([]);
  });

  it("isolates failures: a broken addon never blocks the others", async () => {
    const errors: AddonEngineError[] = [];
    const { engine } = await engineWith(
      {
        [MOVIES_URL]: { body: MOVIES_MANIFEST },
        [EXTRAS_URL]: { body: EXTRAS_MANIFEST },
        [CATALOG_A]: { status: 500, body: {} },
        [CATALOG_B]: {
          body: { metas: [{ id: "tt9", type: "movie", name: "Nine" }] },
        },
      },
      { onError: (e) => errors.push(e) },
    );
    await engine.install(MOVIES_URL);
    await engine.install(EXTRAS_URL);

    const items = await engine.getCatalog("movie", "popular");
    expect(items.map((m) => m.id)).toEqual(["tt9"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.addonId).toBe("org.movies");
    expect(errors[0]?.resource).toBe("catalog");
  });

  it("encodes extra props deterministically in the request path", async () => {
    const url =
      "https://movies.example/catalog/movie/popular/search=bat%20man&skip=100.json";
    const { engine, http } = await engineWith({
      [MOVIES_URL]: { body: MOVIES_MANIFEST },
      [url]: { body: { metas: [] } },
    });
    await engine.install(MOVIES_URL);
    await engine.getCatalog("movie", "popular", {
      search: "bat man",
      skip: 100,
    });
    expect(http.calls).toContain(url);
  });
});

describe("timeouts", () => {
  it("drops an addon that exceeds its budget and reports a timeout error", async () => {
    const errors: AddonEngineError[] = [];
    const { engine } = await engineWith(
      {
        [MOVIES_URL]: { body: MOVIES_MANIFEST },
        [EXTRAS_URL]: { body: EXTRAS_MANIFEST },
        "https://movies.example/stream/movie/tt1.json": {
          body: { streams: [{ url: "https://cdn/slow.mp4" }] },
          delayMs: 120,
        },
        "https://extras.example/stream/movie/tt1.json": {
          body: { streams: [{ url: "https://cdn/fast.mp4" }] },
        },
      },
      { timeouts: { streamMs: 40 }, onError: (e) => errors.push(e) },
    );
    await engine.install(MOVIES_URL);
    await engine.install(EXTRAS_URL);

    const streams = await engine.getStreams("tt1", "movie");
    expect(streams.map((s) => s.url)).toEqual(["https://cdn/fast.mp4"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error).toBeInstanceOf(AddonTimeoutError);
  });
});

describe("meta", () => {
  it("returns the first non-null meta in install order", async () => {
    const { engine } = await engineWith({
      [MOVIES_URL]: { body: MOVIES_MANIFEST },
      [EXTRAS_URL]: { body: EXTRAS_MANIFEST },
      "https://movies.example/meta/movie/tt1.json": { body: { meta: null } },
      "https://extras.example/meta/movie/tt1.json": {
        body: { meta: { id: "tt1", type: "movie", name: "From extras" } },
      },
    });
    await engine.install(MOVIES_URL);
    await engine.install(EXTRAS_URL);

    const meta = await engine.getMeta("tt1", "movie");
    expect(meta?.name).toBe("From extras");
  });

  it("respects idPrefixes: non-matching addons are never called", async () => {
    const { engine, http } = await engineWith({
      [MOVIES_URL]: { body: MOVIES_MANIFEST },
      [KITSU_URL]: { body: KITSU_MANIFEST },
      "https://movies.example/stream/movie/tt1.json": { body: { streams: [] } },
    });
    await engine.install(MOVIES_URL);
    await engine.install(KITSU_URL);

    await engine.getStreams("tt1", "movie");
    expect(http.calls).not.toContain(
      "https://kitsu.example/stream/movie/tt1.json",
    );

    // Episode ids keep their colons unencoded in the path.
    await engine.getStreams("tt1:1:5", "movie");
    expect(http.calls).toContain(
      "https://movies.example/stream/movie/tt1:1:5.json",
    );
  });
});

describe("streams", () => {
  it("dedups by infoHash/url, maps protocol fields, ranks per ADR-0004", async () => {
    const { engine } = await engineWith({
      [MOVIES_URL]: { body: MOVIES_MANIFEST },
      [EXTRAS_URL]: { body: EXTRAS_MANIFEST },
      "https://movies.example/stream/movie/tt1.json": {
        body: {
          streams: [
            { title: "720p", url: "https://cdn/a.mp4" },
            { title: "1080p", infoHash: "abc", fileIdx: 2 },
            { externalUrl: "https://elsewhere.example" }, // unplayable → dropped
          ],
        },
      },
      "https://extras.example/stream/movie/tt1.json": {
        body: {
          streams: [
            { title: "1080p dupe", infoHash: "abc", fileIdx: 2 }, // dedup: first wins
            { name: "2160p", url: "magnet:?xt=urn:btih:def" },
            {
              title: "480p",
              url: "https://cdn/b.mp4",
              behaviorHints: { notWebReady: true, bingeGroup: "g1" },
              subtitles: [{ id: "s1", lang: "en", url: "https://subs/en.srt" }],
            },
          ],
        },
      },
    });
    await engine.install(MOVIES_URL);
    await engine.install(EXTRAS_URL);

    const streams = await engine.getStreams("tt1", "movie");
    expect(streams.map((s) => s.title)).toEqual([
      "2160p",
      "1080p",
      "720p",
      "480p",
    ]);

    const magnet = streams[0];
    expect(magnet?.magnet).toBe("magnet:?xt=urn:btih:def");
    expect(magnet?.url).toBeUndefined();

    const hash = streams[1];
    expect(hash?.id).toBe("abc:2");
    expect(hash?.source).toBe("org.movies"); // dedup kept the first addon's entry

    const sd = streams[3];
    expect(sd?.behaviorHints?.notWebReady).toBe(true);
    expect(sd?.subtitles).toEqual([
      { id: "s1", lang: "en", url: "https://subs/en.srt" },
    ]);
  });

  it("marks tv/channel streams as live", async () => {
    const tvManifest = {
      id: "org.tv",
      version: "1.0.0",
      name: "TV",
      resources: ["stream"],
      types: ["tv"],
    };
    const { engine } = await engineWith({
      "https://tv.example/manifest.json": { body: tvManifest },
      "https://tv.example/stream/tv/chan1.json": {
        body: { streams: [{ url: "https://live/stream.m3u8" }] },
      },
    });
    await engine.install("https://tv.example/manifest.json");
    const streams = await engine.getStreams("chan1", "tv");
    expect(streams[0]?.kind).toBe("live");
  });
});

describe("subtitles", () => {
  it("merges subtitle tracks across addons, deduped by url", async () => {
    const subsManifest = (id: string) => ({
      id,
      version: "1.0.0",
      name: id,
      resources: ["subtitles"],
      types: ["movie"],
    });
    const { engine } = await engineWith({
      "https://s1.example/manifest.json": { body: subsManifest("org.s1") },
      "https://s2.example/manifest.json": { body: subsManifest("org.s2") },
      "https://s1.example/subtitles/movie/tt1.json": {
        body: {
          subtitles: [{ id: "en", lang: "en", url: "https://subs/en.srt" }],
        },
      },
      "https://s2.example/subtitles/movie/tt1.json": {
        body: {
          subtitles: [
            { id: "en-dupe", lang: "en", url: "https://subs/en.srt" },
            { id: "de", lang: "de", url: "https://subs/de.srt" },
          ],
        },
      },
    });
    await engine.install("https://s1.example/manifest.json");
    await engine.install("https://s2.example/manifest.json");

    const tracks = await engine.getSubtitles("tt1", "movie");
    expect(tracks.map((t) => t.url)).toEqual([
      "https://subs/en.srt",
      "https://subs/de.srt",
    ]);
  });
});

describe("onError hook", () => {
  it("a throwing observer never breaks the pipeline", async () => {
    const onError = vi.fn(() => {
      throw new Error("observer bug");
    });
    const { engine } = await engineWith(
      {
        [MOVIES_URL]: { body: MOVIES_MANIFEST },
        "https://movies.example/catalog/movie/popular.json": {
          status: 500,
          body: {},
        },
      },
      { onError },
    );
    await engine.install(MOVIES_URL);
    await expect(engine.getCatalog("movie", "popular")).resolves.toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
