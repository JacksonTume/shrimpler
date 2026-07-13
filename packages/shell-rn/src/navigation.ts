// SPDX-License-Identifier: AGPL-3.0-or-later
// Navigation types for the RN shell's lightweight state-based routing (a route
// stack held in App.tsx — hardware-back pops it). Deliberately a copy of the web
// shell's navigation.ts: the `Route` union is DOM-free (it imports only core
// types), and keeping a per-shell copy lets the two shells' route sets diverge
// (RN skips the web-only dev screens). Consolidating the shared shape into
// shared-ui is possible later but out of scope here.

import type { ContentId, MediaType, PlayableSource } from "@shrimpler/core";

export type Route =
  | { screen: "home" }
  | { screen: "addons" }
  | { screen: "settings" }
  | { screen: "search" }
  // A browsable IPTV catalog (Live TV / Movies / Series) — carries the addon
  // catalog identity + a display title.
  | {
      screen: "catalog";
      catalogType: MediaType;
      catalogId: string;
      title: string;
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
