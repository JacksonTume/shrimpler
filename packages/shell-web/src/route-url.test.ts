// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for the hash ⇄ Route mapping: round-trips for each screen, the
// synthetic category buckets (All / Uncategorized), id encoding, and the
// non-restorable/unknown fallbacks to Home.

import { describe, expect, it } from "vitest";
import { labels } from "@shrimpler/shared-ui";
import type { Route } from "./navigation";
import { hashToRoute, routeToHash } from "./route-url";

describe("routeToHash", () => {
  it("maps the simple screens", () => {
    expect(routeToHash({ screen: "home" })).toBe("/");
    expect(routeToHash({ screen: "search" })).toBe("/search");
    expect(routeToHash({ screen: "addons" })).toBe("/sources");
    expect(routeToHash({ screen: "settings" })).toBe("/settings");
  });

  it("maps categories and filtered catalogs to short kind slugs", () => {
    expect(
      routeToHash({
        screen: "categories",
        catalogType: "tv",
        catalogId: "iptv:live",
        title: "Live TV",
      }),
    ).toBe("/live");
    expect(
      routeToHash({
        screen: "catalog",
        catalogType: "tv",
        catalogId: "iptv:live",
        title: "Live TV · News",
        genre: "News",
      }),
    ).toBe("/live/News");
  });

  it("uses reserved slugs for the All and Uncategorized buckets", () => {
    const base = {
      screen: "catalog" as const,
      catalogType: "movie" as const,
      catalogId: "iptv:movies",
      title: "Movies",
    };
    expect(routeToHash({ ...base })).toBe("/movies/all"); // genre undefined
    expect(routeToHash({ ...base, genre: "" })).toBe("/movies/none");
  });

  it("encodes genre names and detail ids", () => {
    expect(
      routeToHash({
        screen: "catalog",
        catalogType: "tv",
        catalogId: "iptv:live",
        title: "Live TV · UK | Sport",
        genre: "UK | Sport",
      }),
    ).toBe(`/live/${encodeURIComponent("UK | Sport")}`);
    expect(
      routeToHash({ screen: "detail", id: "iptv:live:x", type: "tv" }),
    ).toBe("/detail/tv/iptv%3Alive%3Ax");
  });

  it("maps playback to the non-restorable sentinel", () => {
    expect(
      routeToHash({
        screen: "player",
        source: { id: "s", kind: "vod", source: "iptv" },
        contentId: "iptv:movie:m1",
        type: "movie",
        back: { screen: "home" },
      }),
    ).toBe("/watch");
  });
});

describe("hashToRoute", () => {
  it("decodes empty/unknown/playback hashes to Home", () => {
    expect(hashToRoute("")).toEqual({ screen: "home" });
    expect(hashToRoute("#/")).toEqual({ screen: "home" });
    expect(hashToRoute("#/watch")).toEqual({ screen: "home" });
    expect(hashToRoute("#/nonsense")).toEqual({ screen: "home" });
  });

  it("decodes the simple screens (with or without a leading #)", () => {
    expect(hashToRoute("#/search")).toEqual({ screen: "search" });
    expect(hashToRoute("/sources")).toEqual({ screen: "addons" });
    expect(hashToRoute("#/settings")).toEqual({ screen: "settings" });
  });

  it("rebuilds a categories route with its title from labels", () => {
    expect(hashToRoute("#/live")).toEqual({
      screen: "categories",
      catalogType: "tv",
      catalogId: "iptv:live",
      title: labels.liveTv,
    });
  });

  it("rebuilds filtered catalogs, including the synthetic buckets", () => {
    expect(hashToRoute("#/live/News")).toEqual({
      screen: "catalog",
      catalogType: "tv",
      catalogId: "iptv:live",
      title: `${labels.liveTv} · News`,
      genre: "News",
    });
    // "all" → no genre field (undefined); "none" → empty-string genre.
    expect(hashToRoute("#/movies/all")).toEqual({
      screen: "catalog",
      catalogType: "movie",
      catalogId: "iptv:movies",
      title: `${labels.moviesTitle} · ${labels.categoryAll}`,
    });
    expect(hashToRoute("#/series/none")).toEqual({
      screen: "catalog",
      catalogType: "series",
      catalogId: "iptv:series",
      title: `${labels.seriesTitle} · ${labels.categoryUncategorized}`,
      genre: "",
    });
  });

  it("decodes a detail route", () => {
    expect(hashToRoute("#/detail/tv/iptv%3Alive%3Ax")).toEqual({
      screen: "detail",
      type: "tv",
      id: "iptv:live:x",
    });
    expect(hashToRoute("#/detail/tv")).toEqual({ screen: "home" }); // missing id
  });
});

describe("round-trip (routeToHash → hashToRoute)", () => {
  const routes: Route[] = [
    { screen: "home" },
    { screen: "search" },
    { screen: "addons" },
    { screen: "settings" },
    {
      screen: "categories",
      catalogType: "series",
      catalogId: "iptv:series",
      title: "ignored-on-decode",
    },
    {
      screen: "catalog",
      catalogType: "tv",
      catalogId: "iptv:live",
      title: "ignored-on-decode",
      genre: "News",
    },
    { screen: "detail", type: "movie", id: "tmdb:123" },
  ];

  it("preserves the routable fields (titles are rebuilt, not carried)", () => {
    for (const route of routes) {
      const decoded = hashToRoute(`#${routeToHash(route)}`);
      expect(decoded.screen).toBe(route.screen);
      if (route.screen === "catalog" && decoded.screen === "catalog") {
        expect(decoded.catalogId).toBe(route.catalogId);
        expect(decoded.genre).toBe(route.genre);
      }
      if (route.screen === "detail" && decoded.screen === "detail") {
        expect(decoded.id).toBe(route.id);
        expect(decoded.type).toBe(route.type);
      }
    }
  });
});
