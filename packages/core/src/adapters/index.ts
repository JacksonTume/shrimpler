// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapter interfaces are declared here in core and implemented per shell (§7).
export type {
  PlayerAdapter,
  PlayerState,
  PlayerEventName,
  PlayerEventPayload,
  TrackInfo,
  PlayerError,
} from "./player";
export type { StorageAdapter } from "./storage";
export type { HttpAdapter, HttpOpts, HttpResponse } from "./http";
