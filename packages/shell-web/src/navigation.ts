// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared navigation types for the web shell's lightweight state-based routing
// (see App.tsx). Kept in its own module so screens and App can both import it
// without a circular dependency.
//
// Routes are a discriminated union so a screen can carry params (the detail
// screen needs a content id + type). App.tsx keeps this as the in-app source of
// truth and mirrors it to the URL hash via route-url.ts, so screens are
// deep-linkable and survive a reload without pulling in a router dependency.

import type { ContentId, MediaType, PlayableSource } from "@shrimpler/core";

export type Route =
  | { screen: "home" }
  | { screen: "addons" }
  | { screen: "settings" }
  | { screen: "search" }
  // The category list for a catalog (drill-down step 1) — pick a group before
  // seeing items, so 10k+ channels stay navigable (ADR-0006).
  | {
      screen: "categories";
      catalogType: MediaType;
      catalogId: string;
      title: string;
    }
  // A browsable IPTV catalog (Live TV / Movies / Series) — carries the addon
  // catalog identity + a display title. When reached via a category, `genre` is
  // the selected group (undefined ⇒ All, "" ⇒ uncategorized) and `total` its
  // item count (lets paging know when to stop).
  | {
      screen: "catalog";
      catalogType: MediaType;
      catalogId: string;
      title: string;
      genre?: string;
      total?: number;
    }
  | { screen: "detail"; id: ContentId; type: MediaType }
  // Playback carries an already-resolved source (with a playable url), the
  // content identity it belongs to (for continue-watching progress + resume),
  // an optional display snapshot, and the route to return to on Back.
  | {
      screen: "player";
      source: PlayableSource;
      contentId: ContentId;
      type: MediaType;
      title?: string;
      poster?: string;
      back: Route;
    };

export type ScreenName = Route["screen"];

export interface NavigationProps {
  onNavigate: (route: Route) => void;
}
