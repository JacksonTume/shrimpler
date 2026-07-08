// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared navigation types for the web shell's lightweight state-based routing
// (see App.tsx). Kept in its own module so screens and App can both import it
// without a circular dependency.
//
// Routes are a discriminated union so a screen can carry params (the detail
// screen needs a content id + type). This is still not a router — it grows one
// when the screen count justifies it.

import type { ContentId, MediaType, PlayableSource } from "@shrimpler/core";

export type Route =
  | { screen: "home" }
  | { screen: "addons" }
  | { screen: "settings" }
  | { screen: "search" }
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
