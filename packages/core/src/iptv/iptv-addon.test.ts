// SPDX-License-Identifier: AGPL-3.0-or-later
// createIptvAddon tests: manifest shape, the three catalogs (live/movies/series),
// the iptv:<kind>:<id> id scheme, movie/series meta, series episode videos with
// lazy loading, and kind (live vs vod). Plain Node, no I/O (§2.2).

import { describe, expect, it, vi } from "vitest";
import { createIptvAddon } from "./iptv-addon";
import type { IptvContent } from "./content";

const content: IptvContent = {
  channels: [
    { id: "one", name: "One", url: "http://h/1.m3u8", logo: "http://l/1.png" },
    { id: "two", name: "Two", url: "http://h/2.ts", group: "News" },
  ],
  movies: [
    {
      id: "m1",
      name: "A Movie",
      url: "http://h/m1.mkv",
      poster: "http://l/m1.png",
      description: "A film.",
      headers: { Referer: "http://r/" },
    },
  ],
  series: [
    {
      id: "s1",
      name: "A Show",
      poster: "http://l/s1.png",
      episodes: [
        { season: 1, episode: 1, url: "http://h/s1e1.mkv", name: "Pilot" },
        { season: 1, episode: 2, url: "http://h/s1e2.mkv" },
      ],
    },
  ],
};

describe("createIptvAddon", () => {
  it("declares live + VOD types and three catalogs", () => {
    const addon = createIptvAddon(content);
    expect(addon.manifest).toMatchObject({
      id: "org.shrimpler.iptv",
      types: ["tv", "channel", "movie", "series"],
      idPrefixes: ["iptv:"],
    });
    expect(addon.manifest.catalogs).toEqual([
      { type: "tv", id: "iptv:live", name: "Live TV" },
      { type: "movie", id: "iptv:movies", name: "Movies" },
      { type: "series", id: "iptv:series", name: "Series" },
    ]);
  });

  it("serves live channels with iptv:live: ids and square posters", async () => {
    const addon = createIptvAddon(content);
    const live = await addon.getCatalog("tv", "iptv:live");
    expect(live).toEqual([
      {
        id: "iptv:live:one",
        type: "tv",
        name: "One",
        posterShape: "square",
        poster: "http://l/1.png",
      },
      { id: "iptv:live:two", type: "tv", name: "Two", posterShape: "square" },
    ]);
  });

  it("serves movies with iptv:movie: ids and poster shape", async () => {
    const addon = createIptvAddon(content);
    const movies = await addon.getCatalog("movie", "iptv:movies");
    expect(movies).toEqual([
      {
        id: "iptv:movie:m1",
        type: "movie",
        name: "A Movie",
        posterShape: "poster",
        poster: "http://l/m1.png",
      },
    ]);
    const meta = await addon.getMeta("iptv:movie:m1", "movie");
    expect(meta).toMatchObject({
      id: "iptv:movie:m1",
      type: "movie",
      description: "A film.",
    });
  });

  it("returns a single vod stream for a movie carrying its headers", async () => {
    const addon = createIptvAddon(content);
    const streams = await addon.getStreams("iptv:movie:m1", "movie");
    expect(streams).toEqual([
      {
        id: "iptv:movie:m1#vod",
        kind: "vod",
        url: "http://h/m1.mkv",
        title: "A Movie",
        source: "org.shrimpler.iptv",
        headers: { Referer: "http://r/" },
      },
    ]);
  });

  it("serves a series with an episode list keyed by iptv:series:<id>:S:E", async () => {
    const addon = createIptvAddon(content);
    const meta = await addon.getMeta("iptv:series:s1", "series");
    expect(meta).toMatchObject({ id: "iptv:series:s1", type: "series" });
    expect(meta?.videos).toEqual([
      { id: "iptv:series:s1:1:1", season: 1, episode: 1, name: "Pilot" },
      { id: "iptv:series:s1:1:2", season: 1, episode: 2 },
    ]);
    // A bare series id has no direct stream — you play an episode.
    expect(await addon.getStreams("iptv:series:s1", "series")).toEqual([]);
  });

  it("returns a vod stream for a series episode id", async () => {
    const addon = createIptvAddon(content);
    const streams = await addon.getStreams("iptv:series:s1:1:1", "series");
    expect(streams).toEqual([
      {
        id: "iptv:series:s1:1:1#vod",
        kind: "vod",
        url: "http://h/s1e1.mkv",
        title: "Pilot",
        source: "org.shrimpler.iptv",
      },
    ]);
  });

  it("resolves lazy series episodes once and caches them", async () => {
    const loadEpisodes = vi.fn(() =>
      Promise.resolve([
        { season: 1, episode: 1, url: "http://h/lazy.mkv", name: "Lazy" },
      ]),
    );
    const addon = createIptvAddon({
      channels: [],
      movies: [],
      series: [{ id: "lz", name: "Lazy Show", loadEpisodes }],
    });

    const meta = await addon.getMeta("iptv:series:lz", "series");
    expect(meta?.videos).toHaveLength(1);
    const streams = await addon.getStreams("iptv:series:lz:1:1", "series");
    expect(streams[0]?.url).toBe("http://h/lazy.mkv");
    // getMeta + getStreams shared one resolution — the loader ran once.
    expect(loadEpisodes).toHaveBeenCalledTimes(1);
  });

  it("returns null/[] for unknown ids and mismatched catalog types", async () => {
    const addon = createIptvAddon(content);
    expect(await addon.getMeta("iptv:movie:nope", "movie")).toBeNull();
    expect(await addon.getStreams("iptv:live:nope", "tv")).toEqual([]);
    expect(await addon.getCatalog("movie", "iptv:live")).toEqual([]);
  });
});
