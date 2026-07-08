// SPDX-License-Identifier: AGPL-3.0-or-later
// TmdbProvider tests: a route-table HttpAdapter returns canned TMDB JSON (same
// offline pattern as the addon engine). Plain Node, no network (§2.2).

import { describe, expect, it } from "vitest";
import type { HttpAdapter, HttpResponse } from "../adapters/http";
import { TmdbProvider } from "./tmdb";

function mockHttp(
  routes: Record<string, unknown>,
): HttpAdapter & { calls: string[] } {
  const calls: string[] = [];
  const respond = (url: string): Promise<HttpResponse> => {
    const hit = Object.prototype.hasOwnProperty.call(routes, url);
    const body = routes[url];
    return Promise.resolve({
      status: hit ? 200 : 404,
      ok: hit,
      text: () => Promise.resolve(JSON.stringify(body)),
      json: <T>() => Promise.resolve(body as T),
    });
  };
  return {
    calls,
    get: (url) => {
      calls.push(url);
      return respond(url);
    },
    post: (url) => {
      calls.push(url);
      return respond(url);
    },
  };
}

const KEY = "testkey";
const FIND = (id: string) =>
  `https://api.themoviedb.org/3/find/${id}?api_key=${KEY}&external_source=imdb_id`;

describe("TmdbProvider.getDetail", () => {
  it("resolves an IMDb id via /find, then maps movie details to MetaDetail", async () => {
    const http = mockHttp({
      [FIND("tt0111161")]: { movie_results: [{ id: 278 }] },
      [`https://api.themoviedb.org/3/movie/278?api_key=${KEY}&append_to_response=credits`]:
        {
          title: "The Shawshank Redemption",
          poster_path: "/poster.jpg",
          backdrop_path: "/bg.jpg",
          overview: "Two imprisoned men...",
          genres: [{ name: "Drama" }, { name: "Crime" }],
          runtime: 142,
          release_date: "1994-09-23",
          vote_average: 8.7,
          credits: {
            cast: [{ name: "Tim Robbins" }, { name: "Morgan Freeman" }],
          },
        },
    });
    const provider = new TmdbProvider({ http, apiKey: KEY });

    const detail = await provider.getDetail("tt0111161", "movie");
    expect(detail).toEqual({
      id: "tt0111161",
      type: "movie",
      name: "The Shawshank Redemption",
      poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
      background: "https://image.tmdb.org/t/p/original/bg.jpg",
      description: "Two imprisoned men...",
      genres: ["Drama", "Crime"],
      cast: ["Tim Robbins", "Morgan Freeman"],
      runtime: "142 min",
      released: "1994-09-23",
      imdbRating: "8.7",
    });
  });

  it("maps a tv detail using name/first_air_date/episode_run_time", async () => {
    const http = mockHttp({
      [FIND("tt0903747")]: { tv_results: [{ id: 1396 }] },
      [`https://api.themoviedb.org/3/tv/1396?api_key=${KEY}&append_to_response=credits`]:
        {
          name: "Breaking Bad",
          first_air_date: "2008-01-20",
          episode_run_time: [47],
          overview: "A chemistry teacher...",
        },
    });
    const provider = new TmdbProvider({ http, apiKey: KEY });

    const detail = await provider.getDetail("tt0903747", "series");
    expect(detail?.name).toBe("Breaking Bad");
    expect(detail?.released).toBe("2008-01-20");
    expect(detail?.runtime).toBe("47 min");
  });

  it("returns null when /find has no matching result", async () => {
    const http = mockHttp({ [FIND("tt0000000")]: { movie_results: [] } });
    const provider = new TmdbProvider({ http, apiKey: KEY });
    expect(await provider.getDetail("tt0000000", "movie")).toBeNull();
  });
});

describe("TmdbProvider.getEpisodes", () => {
  it("expands seasons into EpisodeRefs keyed by imdbId:S:E, skipping specials", async () => {
    const http = mockHttp({
      [FIND("tt0903747")]: { tv_results: [{ id: 1396 }] },
      [`https://api.themoviedb.org/3/tv/1396?api_key=${KEY}`]: {
        seasons: [{ season_number: 0 }, { season_number: 1 }],
      },
      [`https://api.themoviedb.org/3/tv/1396/season/1?api_key=${KEY}`]: {
        episodes: [
          {
            season_number: 1,
            episode_number: 1,
            name: "Pilot",
            air_date: "2008-01-20",
            still_path: "/still.jpg",
          },
        ],
      },
    });
    const provider = new TmdbProvider({ http, apiKey: KEY });

    const episodes = await provider.getEpisodes("tt0903747");
    expect(episodes).toEqual([
      {
        id: "tt0903747:1:1",
        season: 1,
        episode: 1,
        name: "Pilot",
        overview: undefined,
        released: "2008-01-20",
        thumbnail: "https://image.tmdb.org/t/p/w300/still.jpg",
      },
    ]);
    // Season 0 (specials) is never fetched.
    expect(http.calls).not.toContain(
      `https://api.themoviedb.org/3/tv/1396/season/0?api_key=${KEY}`,
    );
  });
});

describe("TmdbProvider.getFeed", () => {
  it("maps trending list items to previews with tmdb: namespaced ids", async () => {
    const http = mockHttp({
      [`https://api.themoviedb.org/3/trending/all/week?api_key=${KEY}&page=1`]:
        {
          results: [
            {
              id: 1,
              media_type: "movie",
              title: "A Movie",
              poster_path: "/a.jpg",
            },
            { id: 2, media_type: "tv", name: "A Show" },
          ],
        },
    });
    const provider = new TmdbProvider({ http, apiKey: KEY });

    const items = await provider.getFeed("trending");
    expect(items).toEqual([
      {
        id: "tmdb:1",
        type: "movie",
        name: "A Movie",
        poster: "https://image.tmdb.org/t/p/w500/a.jpg",
      },
      { id: "tmdb:2", type: "series", name: "A Show", poster: undefined },
    ]);
  });

  it("returns [] for user_list (no direct TMDB endpoint)", async () => {
    const provider = new TmdbProvider({ http: mockHttp({}), apiKey: KEY });
    expect(await provider.getFeed("user_list")).toEqual([]);
  });
});

describe("TmdbProvider.search", () => {
  it("maps /search/multi movie+tv results to previews and skips persons", async () => {
    const http = mockHttp({
      [`https://api.themoviedb.org/3/search/multi?api_key=${KEY}&query=obs&page=1`]:
        {
          results: [
            {
              id: 1339713,
              media_type: "movie",
              title: "Obsession",
              release_date: "2026-05-14",
              poster_path: "/o.jpg",
            },
            {
              id: 5,
              media_type: "tv",
              name: "Obs Show",
              first_air_date: "2020-01-02",
            },
            { id: 9, media_type: "person", name: "Some Actor" },
          ],
        },
    });
    const provider = new TmdbProvider({ http, apiKey: KEY });

    const results = await provider.search("obs");
    expect(results).toEqual([
      {
        id: "tmdb:1339713",
        type: "movie",
        name: "Obsession",
        poster: "https://image.tmdb.org/t/p/w500/o.jpg",
        releaseInfo: "2026",
      },
      {
        id: "tmdb:5",
        type: "series",
        name: "Obs Show",
        poster: undefined,
        releaseInfo: "2020",
      },
    ]);
  });

  it("returns [] when the search has no results", async () => {
    const provider = new TmdbProvider({ http: mockHttp({}), apiKey: KEY });
    expect(await provider.search("nothing")).toEqual([]);
  });
});

describe("TmdbProvider.getDetailById", () => {
  it("resolves a tmdb: id straight to detail with no /find hop", async () => {
    const http = mockHttp({
      [`https://api.themoviedb.org/3/movie/278?api_key=${KEY}&append_to_response=credits`]:
        {
          title: "The Shawshank Redemption",
          overview: "Two imprisoned men...",
          runtime: 142,
          release_date: "1994-09-23",
        },
    });
    const provider = new TmdbProvider({ http, apiKey: KEY });

    const detail = await provider.getDetailById("tmdb:278", "movie");
    expect(detail?.id).toBe("tmdb:278");
    expect(detail?.name).toBe("The Shawshank Redemption");
    expect(detail?.runtime).toBe("142 min");
    // No IMDb /find call is made for a native id.
    expect(http.calls.some((u) => u.includes("/find/"))).toBe(false);
  });

  it("returns null for an id with no numeric tmdb part", async () => {
    const provider = new TmdbProvider({ http: mockHttp({}), apiKey: KEY });
    expect(await provider.getDetailById("tmdb:", "movie")).toBeNull();
  });
});

describe("TmdbProvider.getImdbId", () => {
  it("maps a tmdb: movie id to its IMDb id via /external_ids", async () => {
    const http = mockHttp({
      [`https://api.themoviedb.org/3/movie/27205/external_ids?api_key=${KEY}`]:
        {
          imdb_id: "tt1375666",
        },
    });
    const provider = new TmdbProvider({ http, apiKey: KEY });
    expect(await provider.getImdbId("tmdb:27205", "movie")).toBe("tt1375666");
  });

  it("maps a tmdb: series id to the show IMDb id via /tv/{id}/external_ids", async () => {
    const http = mockHttp({
      [`https://api.themoviedb.org/3/tv/1396/external_ids?api_key=${KEY}`]: {
        imdb_id: "tt0903747",
      },
    });
    const provider = new TmdbProvider({ http, apiKey: KEY });
    // An episode-coordinate id still resolves to the show id (resolver adds S:E).
    expect(await provider.getImdbId("tmdb:1396:2:5", "series")).toBe(
      "tt0903747",
    );
  });

  it("returns null when TMDB has no imdb_id", async () => {
    const http = mockHttp({
      [`https://api.themoviedb.org/3/movie/5/external_ids?api_key=${KEY}`]: {
        imdb_id: null,
      },
    });
    const provider = new TmdbProvider({ http, apiKey: KEY });
    expect(await provider.getImdbId("tmdb:5", "movie")).toBeNull();
  });

  it("returns null for an id with no numeric tmdb part", async () => {
    const provider = new TmdbProvider({ http: mockHttp({}), apiKey: KEY });
    expect(await provider.getImdbId("tmdb:", "movie")).toBeNull();
  });
});

describe("TmdbProvider.getEpisodesById", () => {
  it("expands a tmdb: series id into EpisodeRefs keyed tmdb:<id>:S:E", async () => {
    const http = mockHttp({
      [`https://api.themoviedb.org/3/tv/1396?api_key=${KEY}`]: {
        seasons: [{ season_number: 0 }, { season_number: 1 }],
      },
      [`https://api.themoviedb.org/3/tv/1396/season/1?api_key=${KEY}`]: {
        episodes: [
          {
            season_number: 1,
            episode_number: 1,
            name: "Pilot",
            air_date: "2008-01-20",
          },
        ],
      },
    });
    const provider = new TmdbProvider({ http, apiKey: KEY });

    const episodes = await provider.getEpisodesById("tmdb:1396");
    expect(episodes[0]?.id).toBe("tmdb:1396:1:1");
    expect(episodes[0]?.name).toBe("Pilot");
  });
});
