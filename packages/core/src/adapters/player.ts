// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.1 — PlayerAdapter, the spine of the player abstraction.
// One contract, N implementations (ExoPlayer, AVPlayer, <video>, Tizen AVPlay,
// webOS, libmpv). This contract is frozen per Phase 0 (§11, ADR-0008);
// changes require an ADR.

import type { PlayableSource } from "../types/sources";

export interface PlayerAdapter {
  load(source: PlayableSource): Promise<void>;
  play(): void;
  pause(): void;
  seek(positionSec: number): void; // no-op / ignored for kind:'live'
  stop(): void;

  selectSubtitle(trackId: string | null): void;
  selectAudioTrack(trackId: string): void;
  setPlaybackRate?(rate: number): void;

  getState(): PlayerState;
  on(
    event: PlayerEventName,
    cb: (payload: PlayerEventPayload) => void,
  ): () => void;

  destroy(): void;
}

export interface PlayerState {
  status:
    "idle" | "loading" | "playing" | "paused" | "buffering" | "ended" | "error";
  positionSec: number;
  durationSec: number; // Infinity/0 for live
  bufferedSec: number;
  audioTracks: TrackInfo[];
  subtitleTracks: TrackInfo[];
  activeAudioTrackId?: string;
  activeSubtitleTrackId?: string | null;
  error?: PlayerError;
}

export type PlayerEventName =
  | "timeupdate"
  | "statuschange"
  | "buffering"
  | "tracks"
  | "ended"
  | "error"
  | "reconnecting";

export interface TrackInfo {
  id: string;
  label: string;
  lang?: string;
}

export interface PlayerError {
  code: string;
  message: string;
  fatal: boolean;
}

export type PlayerEventPayload = Partial<PlayerState> & { error?: PlayerError };
