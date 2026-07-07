// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.1 — web implementation of the PlayerAdapter contract, wrapping an
// HTMLVideoElement.
//
// Implementation notes (from §7.1/§8.3, to honor in Phase 1/2):
// - Codec gap: <video> cannot play most HEVC/x265 and many MKV containers;
//   respect behaviorHints.notWebReady (warn/deprioritize, or fall back to a
//   native player API on Tizen/webOS in Phase 3).
// - kind:'live' is a first-class mode: reconnect-on-drop lives HERE (core only
//   observes 'reconnecting' events); seek is a no-op without a DVR window.

import type {
  PlayableSource,
  PlayerAdapter,
  PlayerEventName,
  PlayerEventPayload,
  PlayerState,
} from "@shrimpler/core";

export class Html5VideoPlayerAdapter implements PlayerAdapter {
  // TODO(Phase 1): create/own a <video> element, map its events to
  // PlayerEventName, implement track selection and state tracking.

  load(_source: PlayableSource): Promise<void> {
    return Promise.reject(
      new Error("Html5VideoPlayerAdapter.load not implemented (Phase 1)"),
    );
  }

  play(): void {}
  pause(): void {}
  seek(_positionSec: number): void {}
  stop(): void {}

  selectSubtitle(_trackId: string | null): void {}
  selectAudioTrack(_trackId: string): void {}

  getState(): PlayerState {
    return {
      status: "idle",
      positionSec: 0,
      durationSec: 0,
      bufferedSec: 0,
      audioTracks: [],
      subtitleTracks: [],
    };
  }

  on(
    _event: PlayerEventName,
    _cb: (payload: PlayerEventPayload) => void,
  ): () => void {
    return () => {};
  }

  destroy(): void {}
}
