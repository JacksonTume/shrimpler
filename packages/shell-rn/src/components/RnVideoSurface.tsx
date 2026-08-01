// SPDX-License-Identifier: AGPL-3.0-or-later
// The <Video> binding the RN player adapter has been waiting for.
//
// RnVideoPlayerAdapter (adapters/rn-video-player.ts) is imperative and testable
// because it drives an injected `RnVideoHandle` rather than a component; this is
// the concrete handle, backed by react-native-video. react-native-video is
// declarative, so the handle's methods are setState calls and the component's
// callbacks are piped back into the adapter's `RnVideoCallbacks`. Mounting it and
// wiring the two is all the playback screen has to do.
//
// The adapter creates its handle inside `load()`, which the screen calls from an
// effect — child refs are attached before parent effects run, so `createHandle`
// is always reachable by then.

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Video from "react-native-video";
import type {
  OnBufferData,
  OnLoadData,
  OnProgressData,
  OnVideoErrorData,
  VideoRef,
} from "react-native-video";
import type { TrackInfo } from "@shrimpler/core";
import type {
  RnVideoCallbacks,
  RnVideoHandle,
} from "../adapters/rn-video-player";
import { color } from "../ui";

/** What the playback screen reaches for to build the adapter's handle factory. */
export interface RnVideoSurfaceHandle {
  createHandle(callbacks: RnVideoCallbacks): RnVideoHandle;
}

interface LoadedSource {
  uri: string;
  headers?: Record<string, string>;
}

/**
 * react-native-video identifies tracks by index; the core `TrackInfo` contract
 * (ADR-0008) wants a stable string id and a human label. Titles are optional on
 * both platforms, so fall back to the language and then the index — never to a
 * hard-coded language name.
 */
function toTrackInfo(
  tracks: { index: number; title?: string; language?: string }[],
): TrackInfo[] {
  return tracks.map((track) => ({
    id: String(track.index),
    label: track.title ?? track.language ?? String(track.index),
    lang: track.language,
  }));
}

/** Flatten RNV's platform-specific error blob into the core PlayerError shape. */
function toPlayerError(event: OnVideoErrorData): {
  code: string;
  message: string;
  fatal: boolean;
} {
  const error = event.error;
  return {
    code:
      error.errorCode ??
      (error.code !== undefined ? String(error.code) : "RN_VIDEO_ERROR"),
    message:
      error.errorString ??
      error.localizedDescription ??
      error.errorException ??
      "playback failed",
    // RNV only surfaces onError for failures it cannot recover from.
    fatal: true,
  };
}

export const RnVideoSurface = forwardRef<
  RnVideoSurfaceHandle,
  { style?: StyleProp<ViewStyle> }
>(function RnVideoSurface({ style }, ref) {
  const [source, setSource] = useState<LoadedSource | null>(null);
  // Starts unpaused: the adapter creates its handle from inside load(), which is
  // the point at which it has already decided to play (load → play, mirroring the
  // web screen).
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const videoRef = useRef<VideoRef>(null);
  // Held in a ref, not state: callbacks arrive from the adapter and must never
  // trigger a re-render of the surface by themselves.
  const callbacksRef = useRef<RnVideoCallbacks | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      createHandle(callbacks: RnVideoCallbacks): RnVideoHandle {
        callbacksRef.current = callbacks;
        return {
          setSource: (uri, headers) => setSource({ uri, headers }),
          play: () => setPaused(false),
          pause: () => setPaused(true),
          seek: (positionSec) => videoRef.current?.seek(positionSec),
          setRate,
          destroy: () => {
            callbacksRef.current = null;
            setSource(null);
            setPaused(true);
          },
        };
      },
    }),
    [],
  );

  return (
    <View style={[styles.container, style]}>
      {source !== null && (
        <Video
          ref={videoRef}
          source={{ uri: source.uri, headers: source.headers }}
          paused={paused}
          rate={rate}
          resizeMode="contain"
          // Native HLS/DASH playback — no hls.js equivalent is needed here, which
          // is why the RN shell closes the web live-playback gaps (ADR-0006).
          style={styles.video}
          onLoad={(event: OnLoadData) =>
            callbacksRef.current?.onLoad({
              durationSec: event.duration,
              audioTracks: toTrackInfo(event.audioTracks),
              subtitleTracks: toTrackInfo(event.textTracks),
            })
          }
          onProgress={(event: OnProgressData) =>
            callbacksRef.current?.onProgress({
              positionSec: event.currentTime,
              bufferedSec: event.playableDuration,
            })
          }
          onBuffer={(event: OnBufferData) =>
            callbacksRef.current?.onBuffering(event.isBuffering)
          }
          onEnd={() => callbacksRef.current?.onEnded()}
          onError={(event: OnVideoErrorData) =>
            callbacksRef.current?.onError(toPlayerError(event))
          }
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { backgroundColor: color.black },
  video: { flex: 1 },
});
