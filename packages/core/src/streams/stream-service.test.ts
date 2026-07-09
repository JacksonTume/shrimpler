// SPDX-License-Identifier: AGPL-3.0-or-later
// StreamService tests: fake addons.getStreams + fake metadata.resolveStreamId +
// fake DebridProvider. Asserts the tmdb→imdb hop, the cached-annotation → rank
// ordering, and the resolve branches. Plain Node, no network (§2.2).

import { describe, expect, it, vi } from "vitest";
import type { DebridProvider } from "../debrid/provider";
import type { PlayableSource } from "../types/sources";
import type { StorageAdapter } from "../adapters/storage";
import { createTtlCache } from "../cache";
import { createMetadataResolver } from "../metadata/create-resolver";
import { createStreamService } from "./stream-service";

function memoryStorage(): StorageAdapter {
  const store = new Map<string, unknown>();
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

function source(over: Partial<PlayableSource>): PlayableSource {
  return { id: over.id ?? "s", kind: "vod", ...over };
}

describe("StreamService.getRankedStreams", () => {
  it("resolves the stream id, fetches, and ranks by resolution", async () => {
    const getStreams = vi.fn(() =>
      Promise.resolve([
        source({ id: "a", title: "720p", infoHash: "h1" }),
        source({ id: "b", title: "1080p", infoHash: "h2" }),
      ]),
    );
    const resolveStreamId = vi.fn(() => Promise.resolve("tt1"));
    const service = createStreamService({
      addons: { getStreams },
      metadata: { resolveStreamId },
    });

    const ranked = await service.getRankedStreams("tt1", "movie");
    expect(ranked.map((s) => s.id)).toEqual(["b", "a"]); // 1080p before 720p
    expect(getStreams).toHaveBeenCalledWith("tt1", "movie");
  });

  it("performs the tmdb→imdb hop before fetching streams", async () => {
    const getStreams = vi.fn(() => Promise.resolve([]));
    const resolveStreamId = vi.fn(() => Promise.resolve("tt1375666"));
    const service = createStreamService({
      addons: { getStreams },
      metadata: { resolveStreamId },
    });

    await service.getRankedStreams("tmdb:27205", "movie");
    expect(resolveStreamId).toHaveBeenCalledWith("tmdb:27205", "movie");
    expect(getStreams).toHaveBeenCalledWith("tt1375666", "movie"); // hopped id
  });

  it("returns [] when no IMDb stream id resolves (no streams fetched)", async () => {
    const getStreams = vi.fn(() => Promise.resolve([source({ id: "a" })]));
    const service = createStreamService({
      addons: { getStreams },
      metadata: { resolveStreamId: () => Promise.resolve(null) },
    });

    expect(await service.getRankedStreams("kitsu:5", "series")).toEqual([]);
    expect(getStreams).not.toHaveBeenCalled();
  });

  it("keeps an IPTV live source through the real resolver (ADR-0006)", async () => {
    // Regression: an id no provider owns must reach the addon, not be dropped.
    const live = source({
      id: "iptv:x#live",
      kind: "live",
      url: "http://h/x.m3u8",
    });
    const getStreams = vi.fn(() => Promise.resolve([live]));
    const metadata = createMetadataResolver({
      addons: { getMeta: () => Promise.resolve(null) },
      providers: [], // no provider owns "iptv:"
      cache: createTtlCache({ storage: memoryStorage() }),
    });
    const service = createStreamService({ addons: { getStreams }, metadata });

    const ranked = await service.getRankedStreams("iptv:x", "tv");
    expect(ranked).toEqual([live]);
    expect(getStreams).toHaveBeenCalledWith("iptv:x", "tv");
  });

  it("annotates the debrid cached signal so it breaks resolution ties", async () => {
    const getStreams = vi.fn(() =>
      Promise.resolve([
        source({ id: "uncached", title: "1080p", infoHash: "h1" }),
        source({ id: "cached", title: "1080p", infoHash: "h2" }),
      ]),
    );
    const debrid: DebridProvider = {
      id: "fake",
      resolve: () => Promise.resolve(null),
      checkCached: (hashes) =>
        Promise.resolve(Object.fromEntries(hashes.map((h) => [h, h === "h2"]))),
    };
    const service = createStreamService({
      addons: { getStreams },
      metadata: { resolveStreamId: () => Promise.resolve("tt1") },
      debrid,
    });

    const ranked = await service.getRankedStreams("tt1", "movie");
    // Same resolution → the cached one (h2) wins the tie (ADR-0004).
    expect(ranked.map((s) => s.id)).toEqual(["cached", "uncached"]);
    expect(ranked[0]?.cached).toBe(true);
  });

  it("survives a checkCached failure and still returns the ranked list", async () => {
    const getStreams = vi.fn(() =>
      Promise.resolve([source({ id: "a", title: "1080p", infoHash: "h1" })]),
    );
    const debrid: DebridProvider = {
      id: "fake",
      resolve: () => Promise.resolve(null),
      checkCached: () => Promise.reject(new Error("rd down")),
    };
    const service = createStreamService({
      addons: { getStreams },
      metadata: { resolveStreamId: () => Promise.resolve("tt1") },
      debrid,
    });

    const ranked = await service.getRankedStreams("tt1", "movie");
    expect(ranked.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("StreamService.resolveStream", () => {
  it("passes a direct-url source through without touching debrid", async () => {
    const resolve = vi.fn(() => Promise.resolve(null));
    const service = createStreamService({
      addons: { getStreams: () => Promise.resolve([]) },
      metadata: { resolveStreamId: () => Promise.resolve(null) },
      debrid: { id: "fake", resolve },
    });

    const direct = source({ id: "d", url: "https://cdn/x.mp4" });
    expect(await service.resolveStream(direct)).toBe(direct);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("resolves a torrent via debrid, filling url and cached", async () => {
    const resolve = vi.fn(() =>
      Promise.resolve({ url: "https://dl/x.mkv", cached: true }),
    );
    const service = createStreamService({
      addons: { getStreams: () => Promise.resolve([]) },
      metadata: { resolveStreamId: () => Promise.resolve(null) },
      debrid: { id: "fake", resolve },
    });

    const torrent = source({ id: "t", infoHash: "h1", fileIdx: 2 });
    const resolved = await service.resolveStream(torrent);
    expect(resolved).toEqual({
      ...torrent,
      url: "https://dl/x.mkv",
      cached: true,
    });
    expect(resolve).toHaveBeenCalledWith({
      magnet: undefined,
      infoHash: "h1",
      url: undefined,
      fileIdx: 2,
    });
  });

  it("returns null for a torrent when no debrid is configured", async () => {
    const service = createStreamService({
      addons: { getStreams: () => Promise.resolve([]) },
      metadata: { resolveStreamId: () => Promise.resolve(null) },
    });
    expect(
      await service.resolveStream(source({ id: "t", infoHash: "h1" })),
    ).toBeNull();
  });

  it("returns null when debrid resolution fails", async () => {
    const service = createStreamService({
      addons: { getStreams: () => Promise.resolve([]) },
      metadata: { resolveStreamId: () => Promise.resolve(null) },
      debrid: { id: "fake", resolve: () => Promise.resolve(null) },
    });
    expect(
      await service.resolveStream(source({ id: "t", magnet: "magnet:?x" })),
    ).toBeNull();
  });
});
