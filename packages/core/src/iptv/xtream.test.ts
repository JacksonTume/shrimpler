// SPDX-License-Identifier: AGPL-3.0-or-later
// fetchXtreamContent tests over a route-table HttpAdapter that serves
// player_api.php responses by action. Asserts deterministic URL construction,
// namespaced ids, lazy episode loading, category grouping, and error isolation.
// Plain Node, no real I/O (§2.2).

import { describe, expect, it } from "vitest";
import type { HttpAdapter, HttpResponse } from "../adapters/http";
import { fetchXtreamContent } from "./xtream";
import type { XtreamAccount } from "./xtream";

const ACCOUNT: XtreamAccount = {
  host: "http://x:8080",
  username: "u",
  password: "p",
};

interface Routes {
  live_categories?: unknown;
  vod_categories?: unknown;
  series_categories?: unknown;
  live_streams?: unknown;
  vod_streams?: unknown;
  series?: unknown;
  series_info?: Record<string, unknown>;
  failAction?: string;
}

function jsonResponse(body: unknown, ok = true, status = 200): HttpResponse {
  return {
    status,
    ok,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: <T>() => Promise.resolve(body as T),
  };
}

function xtreamHttp(routes: Routes): HttpAdapter {
  return {
    get: (url) => {
      const action = /[?&]action=([^&]+)/.exec(url)?.[1];
      const seriesId = /[?&]series_id=([^&]+)/.exec(url)?.[1];
      if (action !== undefined && action === routes.failAction) {
        return Promise.resolve(jsonResponse({}, false, 500));
      }
      switch (action) {
        case "get_live_categories":
          return Promise.resolve(jsonResponse(routes.live_categories ?? []));
        case "get_vod_categories":
          return Promise.resolve(jsonResponse(routes.vod_categories ?? []));
        case "get_series_categories":
          return Promise.resolve(jsonResponse(routes.series_categories ?? []));
        case "get_live_streams":
          return Promise.resolve(jsonResponse(routes.live_streams ?? []));
        case "get_vod_streams":
          return Promise.resolve(jsonResponse(routes.vod_streams ?? []));
        case "get_series":
          return Promise.resolve(jsonResponse(routes.series ?? []));
        case "get_series_info":
          return Promise.resolve(
            jsonResponse(
              routes.series_info?.[seriesId ?? ""] ?? { episodes: {} },
            ),
          );
        default:
          return Promise.resolve(jsonResponse([], false, 404));
      }
    },
    post: () => Promise.reject(new Error("unused")),
  };
}

describe("fetchXtreamContent", () => {
  it("maps live/movies/series with namespaced ids and deterministic urls", async () => {
    const content = await fetchXtreamContent({
      http: xtreamHttp({
        live_streams: [{ stream_id: 1, name: "Ch", stream_icon: "i" }],
        vod_streams: [
          {
            stream_id: 2,
            name: "Mov",
            container_extension: "mkv",
            rating: "7.5",
          },
        ],
        series: [{ series_id: 3, name: "Show", cover: "c", plot: "p" }],
      }),
      account: ACCOUNT,
      accountKey: "xt0",
    });

    expect(content.channels).toEqual([
      {
        id: "xt0-1",
        name: "Ch",
        url: "http://x:8080/live/u/p/1.m3u8",
        logo: "i",
      },
    ]);
    expect(content.movies).toEqual([
      {
        id: "xt0-2",
        name: "Mov",
        url: "http://x:8080/movie/u/p/2.mkv",
        rating: "7.5",
      },
    ]);
    expect(content.series[0]).toMatchObject({
      id: "xt0-3",
      name: "Show",
      poster: "c",
      description: "p",
    });
    expect(typeof content.series[0]?.loadEpisodes).toBe("function");
  });

  it("loads series episodes lazily with constructed episode urls", async () => {
    const content = await fetchXtreamContent({
      http: xtreamHttp({
        series: [{ series_id: 3, name: "Show" }],
        series_info: {
          "3": {
            episodes: {
              "1": [
                {
                  id: 10,
                  episode_num: 1,
                  title: "E1",
                  container_extension: "mp4",
                  season: 1,
                },
              ],
            },
          },
        },
      }),
      account: ACCOUNT,
      accountKey: "xt0",
    });

    const episodes = await content.series[0]!.loadEpisodes!();
    expect(episodes).toEqual([
      {
        season: 1,
        episode: 1,
        url: "http://x:8080/series/u/p/10.mp4",
        name: "E1",
      },
    ]);
  });

  it("labels groups from category names", async () => {
    const content = await fetchXtreamContent({
      http: xtreamHttp({
        vod_categories: [{ category_id: "5", category_name: "Action" }],
        vod_streams: [{ stream_id: 2, name: "Mov", category_id: "5" }],
      }),
      account: ACCOUNT,
      accountKey: "xt0",
    });
    expect(content.movies[0]?.group).toBe("Action");
  });

  it("trims a trailing slash from the host", async () => {
    const content = await fetchXtreamContent({
      http: xtreamHttp({
        live_streams: [{ stream_id: 1, name: "Ch" }],
      }),
      account: { ...ACCOUNT, host: "http://x:8080/" },
      accountKey: "xt0",
    });
    expect(content.channels[0]?.url).toBe("http://x:8080/live/u/p/1.m3u8");
  });

  it("throws when a required endpoint fails (account-level isolation)", async () => {
    await expect(
      fetchXtreamContent({
        http: xtreamHttp({ failAction: "get_live_streams" }),
        account: ACCOUNT,
        accountKey: "xt0",
      }),
    ).rejects.toThrow(/Xtream request failed/);
  });
});
