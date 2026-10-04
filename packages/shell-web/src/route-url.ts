// SPDX-License-Identifier: AGPL-3.0-or-later
// Hash-based URL mapping for the web shell's routes. Hash (not History API) so
// deep links work from static hosting AND file:// — which the Phase 3 Tizen/webOS
// TV packaging needs (a pushState path has no server to resolve on reload there).
//
// The Route union (navigation.ts) is the in-app source of truth; this module is a
// lossy-but-stable projection to/from a URL fragment. Display-only fields (a
// catalog's `title`, a category's `total`) are NOT round-tripped: titles are
// rebuilt from labels on decode, and `total` is just a paging hint the catalog
// recomputes. Playback is not restorable (its source is an already-resolved
// stream), so it maps to a sentinel that decodes back to Home.
//
//   #/                     Home            #/live            Live TV categories
//   #/search               Search          #/live/News       Live TV · News
//   #/sources              Sources/addons  #/movies/all      Movies · All
//   #/settings             Settings        #/series/none     Series · Uncategorized
//   #/detail/tv/iptv%3A…   Detail          #/watch  → Home (playback not restorable)

import type { MediaType } from "@shrimpler/core";
import { labels } from "@shrimpler/shared-ui";
import type { Route } from "./navigation";

/** The three IPTV catalogs ⇄ their short URL slug + derived type/title. */
const KIND_BY_CATALOG: Record<string, string> = {
  "iptv:live": "live",
  "iptv:movies": "movies",
  "iptv:series": "series",
};
const CATALOG_BY_KIND: Record<
  string,
  { catalogId: string; type: MediaType; title: string }
> = {
  live: { catalogId: "iptv:live", type: "tv", title: labels.liveTv },
  movies: {
    catalogId: "iptv:movies",
    type: "movie",
    title: labels.moviesTitle,
  },
  series: {
    catalogId: "iptv:series",
    type: "series",
    title: labels.seriesTitle,
  },
};

// Synthetic category buckets get reserved slugs (a real group named exactly
// "all"/"none" would collide, but degrades gracefully to that bucket's view).
const ALL_SLUG = "all";
const UNCATEGORIZED_SLUG = "none";

/** Serialize a route to a hash fragment WITHOUT the leading '#'. */
export function routeToHash(route: Route): string {
  switch (route.screen) {
    case "home":
      return "/";
    case "search":
      return "/search";
    case "addons":
      return "/sources";
    case "settings":
      return "/settings";
    case "categories": {
      const kind = KIND_BY_CATALOG[route.catalogId];
      return kind === undefined ? "/" : `/${kind}`;
    }
    case "catalog": {
      const kind = KIND_BY_CATALOG[route.catalogId];
      if (kind === undefined) return "/";
      const slug =
        route.genre === undefined
          ? ALL_SLUG
          : route.genre === ""
            ? UNCATEGORIZED_SLUG
            : encodeURIComponent(route.genre);
      return `/${kind}/${slug}`;
    }
    case "detail":
      return `/detail/${route.type}/${encodeURIComponent(route.id)}`;
    case "player":
      // A resolved stream can't be reconstructed from a URL — see module note.
      return "/watch";
  }
}

/** Genre slug → the filter value (undefined=All, ""=uncategorized) + a label. */
function decodeGenre(slug: string): { genre?: string; label: string } {
  if (slug === ALL_SLUG) return { label: labels.categoryAll };
  if (slug === UNCATEGORIZED_SLUG) {
    return { genre: "", label: labels.categoryUncategorized };
  }
  const name = decodeURIComponent(slug);
  return { genre: name, label: name };
}

/** Parse a hash fragment (with or without the leading '#') into a Route. */
export function hashToRoute(hash: string): Route {
  const clean = hash.replace(/^#/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (clean === "") return { screen: "home" };
  const [head, a, b] = clean.split("/");

  switch (head) {
    case "search":
      return { screen: "search" };
    case "sources":
      return { screen: "addons" };
    case "settings":
      return { screen: "settings" };
    case "detail": {
      if (a === undefined || a === "" || b === undefined || b === "") {
        return { screen: "home" };
      }
      return {
        screen: "detail",
        type: a as MediaType,
        id: decodeURIComponent(b),
      };
    }
    case "live":
    case "movies":
    case "series": {
      const meta = CATALOG_BY_KIND[head]!;
      if (a === undefined || a === "") {
        return {
          screen: "categories",
          catalogType: meta.type,
          catalogId: meta.catalogId,
          title: meta.title,
        };
      }
      const { genre, label } = decodeGenre(a);
      const catalog: Route = {
        screen: "catalog",
        catalogType: meta.type,
        catalogId: meta.catalogId,
        title: `${meta.title} · ${label}`,
      };
      if (genre !== undefined) catalog.genre = genre;
      return catalog;
    }
    default:
      // "watch" and anything unrecognized fall back to Home.
      return { screen: "home" };
  }
}
