// SPDX-License-Identifier: AGPL-3.0-or-later
// Resolver tests: a fake addon getMeta + a fake MetadataProvider + a real TTL
// cache over in-memory storage. Plain Node, no network (§2.2).

import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../adapters/storage";
import { createTtlCache } from "../cache";
import type { MetaDetail, MetaPreview, EpisodeRef } from "../types/meta";
import type { MediaType } from "../types/ids";
import { createMetadataResolver } from "./create-resolver";
import type { MetadataProvider } from "./resolver";

function memoryStorage(): StorageAdapter {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string) =>
      Promise.resolve((store.get(key) as T | undefined) ?? null),
    set: <T>(key: string, value: T) => {
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

const RICH: MetaDetail = {
  id: "tt1",
  type: "movie",
  name: "Addon Title",
  description: "A full description from the addon.",
  poster: "https://addon/poster.jpg",
};

const SPARSE: MetaDetail = { id: "tt1", type: "movie", name: "Addon Title" };

const PROVIDER_DETAIL: MetaDetail = {
  id: "tt1",
  type: "movie",
  name: "TMDB Title",
  description: "TMDB description.",
  poster: "https://tmdb/poster.jpg",
  background: "https://tmdb/bg.jpg",
  genres: ["Drama"],
};

function resolverWith(opts: {
  getMeta?: (id: string, type: MediaType) => Promise<MetaDetail | null>;
  provider?: Partial<MetadataProvider>;
}) {
  const getMeta = vi.fn(opts.getMeta ?? (() => Promise.resolve(null)));
  const provider: MetadataProvider = {
    id: "tmdb",
    getDetail: vi.fn(() => Promise.resolve(null)),
    ...opts.provider,
  };
  const resolver = createMetadataResolver({
    addons: { getMeta },
    providers: [provider],
    cache: createTtlCache({ storage: memoryStorage() }),
  });
  return { resolver, getMeta, provider };
}

describe("resolveDetail precedence (ADR-0003)", () => {
  it("uses rich addon meta as-is and never calls the provider", async () => {
    const getDetail = vi.fn(() => Promise.resolve(PROVIDER_DETAIL));
    const { resolver } = resolverWith({
      getMeta: () => Promise.resolve(RICH),
      provider: { getDetail },
    });

    expect(await resolver.resolveDetail("tt1", "movie")).toEqual(RICH);
    expect(getDetail).not.toHaveBeenCalled();
  });

  it("fills gaps from the provider when addon meta is sparse (addon fields win)", async () => {
    const { resolver } = resolverWith({
      getMeta: () => Promise.resolve(SPARSE),
      provider: { getDetail: () => Promise.resolve(PROVIDER_DETAIL) },
    });

    const detail = await resolver.resolveDetail("tt1", "movie");
    // Addon's name wins; provider fills description/poster/background/genres.
    expect(detail).toEqual({
      id: "tt1",
      type: "movie",
      name: "Addon Title",
      description: "TMDB description.",
      poster: "https://tmdb/poster.jpg",
      background: "https://tmdb/bg.jpg",
      genres: ["Drama"],
    });
  });

  it("falls back entirely to the provider when there is no addon meta", async () => {
    const { resolver } = resolverWith({
      getMeta: () => Promise.resolve(null),
      provider: { getDetail: () => Promise.resolve(PROVIDER_DETAIL) },
    });
    expect(await resolver.resolveDetail("tt1", "movie")).toEqual(
      PROVIDER_DETAIL,
    );
  });

  it("does not call the provider for a non-IMDb id (no pivot)", async () => {
    const getDetail = vi.fn(() => Promise.resolve(PROVIDER_DETAIL));
    const { resolver } = resolverWith({
      getMeta: () => Promise.resolve(null),
      provider: { getDetail },
    });

    expect(await resolver.resolveDetail("kitsu:123", "movie")).toBeNull();
    expect(getDetail).not.toHaveBeenCalled();
  });

  it("caches the merged result: a repeat call re-hits neither addon nor provider", async () => {
    const getDetail = vi.fn(() => Promise.resolve(PROVIDER_DETAIL));
    const { resolver, getMeta } = resolverWith({
      getMeta: () => Promise.resolve(SPARSE),
      provider: { getDetail },
    });

    await resolver.resolveDetail("tt1", "movie");
    await resolver.resolveDetail("tt1", "movie");
    expect(getMeta).toHaveBeenCalledTimes(1);
    expect(getDetail).toHaveBeenCalledTimes(1);
  });

  it("isolates a provider failure, returning the sparse addon meta", async () => {
    const { resolver } = resolverWith({
      getMeta: () => Promise.resolve(SPARSE),
      provider: { getDetail: () => Promise.reject(new Error("tmdb down")) },
    });
    expect(await resolver.resolveDetail("tt1", "movie")).toEqual(SPARSE);
  });
});

describe("resolveEpisodes", () => {
  const VIDEOS: EpisodeRef[] = [
    { id: "tt1:1:1", season: 1, episode: 1, name: "Pilot" },
  ];
  const PROVIDER_EPS: EpisodeRef[] = [
    { id: "tt1:1:1", season: 1, episode: 1, name: "From TMDB" },
  ];

  it("prefers addon meta videos when present", async () => {
    const getEpisodes = vi.fn(() => Promise.resolve(PROVIDER_EPS));
    const { resolver } = resolverWith({
      getMeta: () =>
        Promise.resolve({ ...SPARSE, type: "series", videos: VIDEOS }),
      provider: { getEpisodes },
    });

    expect(await resolver.resolveEpisodes("tt1")).toEqual(VIDEOS);
    expect(getEpisodes).not.toHaveBeenCalled();
  });

  it("falls back to the provider when the addon has no videos", async () => {
    const { resolver } = resolverWith({
      getMeta: () => Promise.resolve(null),
      provider: { getEpisodes: () => Promise.resolve(PROVIDER_EPS) },
    });
    expect(await resolver.resolveEpisodes("tt1")).toEqual(PROVIDER_EPS);
  });
});

describe("buildHomeFeeds", () => {
  it("composes rows from the first feed-capable provider", async () => {
    const items: MetaPreview[] = [
      { id: "tmdb:1", type: "movie", name: "One" },
    ];
    const { resolver } = resolverWith({
      provider: { getFeed: () => Promise.resolve(items) },
    });

    const rows = await resolver.buildHomeFeeds();
    expect(rows.map((r) => r.id)).toEqual(["trending", "popular"]);
    expect(rows[0]?.items).toEqual(items);
  });

  it("returns no rows when no provider supplies feeds", async () => {
    const { resolver } = resolverWith({});
    expect(await resolver.buildHomeFeeds()).toEqual([]);
  });
});
