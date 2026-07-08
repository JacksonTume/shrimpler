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
          credits: { cast: [{ name: "Tim Robbins" }, { name: "Morgan Freeman" }] },
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
      [`https://api.themoviedb.org/3/trending/all/week?api_key=${KEY}&page=1`]: {
        results: [
          { id: 1, media_type: "movie", title: "A Movie", poster_path: "/a.jpg" },
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
