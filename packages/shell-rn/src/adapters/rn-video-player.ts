// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.1 — the RN implementation of the frozen PlayerAdapter contract
// (ADR-0008), targeting react-native-video. It plays HLS natively (no hls.js)
// and honors request headers, so it closes the two web live-playback gaps at
// once (ADR-0006).
//
// react-native-video is a *declarative* <Video> component, not an imperative
// element, so — unlike the web adapter which owns an HTMLVideoElement — this
// adapter drives an injectable `RnVideoHandle` that a thin <Video> binding
// (delivered with the Playback screen in increment 4b) implements. This mirrors
// the `HlsEngine` injection seam in the web shell's hls-engine.ts and keeps the
// adapter unit-testable under Vitest with no native module. The state machine
// itself (merge-then-emit + listener fan-out) is the same shape as the web
// adapter's.

import type {
  PlayableSource,
  PlayerAdapter,
  PlayerError,
  PlayerEventName,
  PlayerEventPayload,
  PlayerState,
  TrackInfo,
} from "@shrimpler/core";

/**
 * The imperative surface a <Video> binding must expose to the adapter. The
 * binding translates these into react-native-video props/refs (`paused`,
 * `source`, `ref.seek()`, `rate`) and pipes the component's callbacks back
 * through the `RnVideoCallbacks` it was constructed with.
 */
export interface RnVideoHandle {
  setSource(url: string, headers?: Record<string, string>): void;
  play(): void;
  pause(): void;
  seek(positionSec: number): void;
  setRate(rate: number): void;
  destroy(): void;
}

/** Events the <Video> binding pushes into the adapter (bridged from RNV). */
export interface RnVideoCallbacks {
  /** onLoad — metadata + tracks are known; the load() promise resolves. */
  onLoad(info: {
    durationSec: number;
    audioTracks: TrackInfo[];
    subtitleTracks: TrackInfo[];
  }): void;
  /** onProgress — periodic position/buffer tick. */
  onProgress(info: { positionSec: number; bufferedSec: number }): void;
  /** onBuffer — true when stalled for data, false when it resumes. */
  onBuffering(buffering: boolean): void;
  /** onEnd — playback reached the end (VOD). */
  onEnded(): void;
  /** onError — a fatal playback error; the load() promise rejects. */
  onError(error: PlayerError): void;
}

export type RnVideoHandleFactory = (
  callbacks: RnVideoCallbacks,
) => RnVideoHandle;

/**
 * Placeholder used when no real handle factory is injected. The concrete
 * <Video>-backed factory arrives with the Playback screen in increment 4b; until
 * then, attempting to play surfaces a clear fatal error rather than hanging.
 */
const noop = (): void => {
  // Intentionally empty — the pending handle does nothing until 4b binds RNV.
};

const pendingHandleFactory: RnVideoHandleFactory = (callbacks) => ({
  setSource: () =>
    callbacks.onError({
      code: "RN_PLAYER_UNBOUND",
      message: "Video playback is not wired up yet (arrives in increment 4b).",
      fatal: true,
    }),
  play: noop,
  pause: noop,
  seek: noop,
  setRate: noop,
  destroy: noop,
});

const IDLE_STATE: PlayerState = {
  status: "idle",
  positionSec: 0,
  durationSec: 0,
  bufferedSec: 0,
  audioTracks: [],
  subtitleTracks: [],
};

export class RnVideoPlayerAdapter implements PlayerAdapter {
  private readonly listeners = new Map<
    PlayerEventName,
    Set<(payload: PlayerEventPayload) => void>
  >();
  private readonly handleFactory: RnVideoHandleFactory;
  private handle: RnVideoHandle | null = null;
  private state: PlayerState = { ...IDLE_STATE };
  private paused = true;
  private pendingLoad: {
    resolve: () => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor(handleFactory: RnVideoHandleFactory = pendingHandleFactory) {
    this.handleFactory = handleFactory;
  }

  private emit(event: PlayerEventName, payload: PlayerEventPayload = {}): void {
    // Merge the stateful fields so getState() reflects the latest event.
    this.state = { ...this.state, ...payload };
    const subs = this.listeners.get(event);
    if (subs !== undefined) {
      for (const cb of subs) {
        cb(payload);
      }
    }
  }

  private readonly callbacks: RnVideoCallbacks = {
    onLoad: (info) => {
      this.emit("tracks", {
        audioTracks: info.audioTracks,
        subtitleTracks: info.subtitleTracks,
      });
      this.emit("statuschange", {
        status: this.paused ? "paused" : "playing",
        durationSec: info.durationSec,
      });
      this.pendingLoad?.resolve();
      this.pendingLoad = null;
    },
    onProgress: (info) => {
      this.emit("timeupdate", {
        positionSec: info.positionSec,
        bufferedSec: info.bufferedSec,
      });
    },
    onBuffering: (buffering) => {
      if (buffering) {
        this.emit("buffering", { status: "buffering" });
      } else {
        this.emit("statuschange", {
          status: this.paused ? "paused" : "playing",
        });
      }
    },
    onEnded: () => {
      this.emit("ended", { status: "ended" });
    },
    onError: (error) => {
      this.emit("error", { status: "error", error });
      this.pendingLoad?.reject(
        new Error(`RnVideoPlayerAdapter.load: ${error.message}`),
      );
      this.pendingLoad = null;
    },
  };

  private destroyHandle(): void {
    if (this.handle !== null) {
      this.handle.destroy();
      this.handle = null;
    }
  }

  load(source: PlayableSource): Promise<void> {
    if (source.url === undefined) {
      return Promise.reject(
        new Error("RnVideoPlayerAdapter.load: source has no resolved url"),
      );
    }
    const url = source.url;
    this.destroyHandle();
    this.paused = false;
    return new Promise<void>((resolve, reject) => {
      this.pendingLoad = { resolve, reject };
      this.emit("statuschange", { status: "loading" });
      this.handle = this.handleFactory(this.callbacks);
      this.handle.setSource(url, source.headers);
    });
  }

  play(): void {
    this.paused = false;
    this.handle?.play();
    this.emit("statuschange", { status: "playing" });
  }

  pause(): void {
    this.paused = true;
    this.handle?.pause();
    this.emit("statuschange", { status: "paused" });
  }

  seek(positionSec: number): void {
    this.handle?.seek(positionSec);
    this.emit("timeupdate", { positionSec });
  }

  stop(): void {
    this.destroyHandle();
    this.paused = true;
    this.emit("statuschange", { status: "idle", positionSec: 0 });
  }

  selectSubtitle(trackId: string | null): void {
    // Track selection lands with the <Video> binding (4b); no-op is contract-legal.
    this.emit("tracks", { activeSubtitleTrackId: trackId });
  }

  selectAudioTrack(_trackId: string): void {
    // No-op until the <Video> binding (4b) — contract-legal.
  }

  setPlaybackRate(rate: number): void {
    this.handle?.setRate(rate);
  }

  getState(): PlayerState {
    return { ...this.state };
  }

  on(
    event: PlayerEventName,
    cb: (payload: PlayerEventPayload) => void,
  ): () => void {
    let subs = this.listeners.get(event);
    if (subs === undefined) {
      subs = new Set();
      this.listeners.set(event, subs);
    }
    subs.add(cb);
    return () => {
      this.listeners.get(event)?.delete(cb);
    };
  }

  destroy(): void {
    this.destroyHandle();
    this.listeners.clear();
    this.pendingLoad = null;
    this.paused = true;
  }
}
