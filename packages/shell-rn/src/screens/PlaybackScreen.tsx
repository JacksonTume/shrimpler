// SPDX-License-Identifier: AGPL-3.0-or-later
// Playback screen (§7.1, §10 step 4) — the RN mirror of the web PlaybackScreen.
// It owns an RnVideoPlayerAdapter for the screen's lifetime and drives it with
// transport controls in the Reef palette (coral tide seek bar). The adapter's
// injected handle is built by RnVideoSurface, the <Video> binding this screen
// mounts, keeping the adapter itself component-free and unit-testable (ADR-0008).
//
// It receives an already-resolved source (a playable url from the stream picker →
// debrid), so nothing is resolved here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { labels, useWatchProgress } from "@shrimpler/shared-ui";
import type {
  ContentId,
  MediaType,
  PlayableSource,
  PlayerState,
} from "@shrimpler/core";
import { RnVideoPlayerAdapter } from "../adapters/rn-video-player";
import type { RnVideoHandleFactory } from "../adapters/rn-video-player";
import { RnVideoSurface } from "../components/RnVideoSurface";
import type { RnVideoSurfaceHandle } from "../components/RnVideoSurface";
import { Badge, Button, Callout, SeekBar, color, fontSize, space } from "../ui";
import { formatTime } from "../format";

interface PlaybackScreenProps {
  source: PlayableSource;
  /** The content identity being played — drives continue-watching progress. */
  contentId: ContentId;
  type: MediaType;
  /** Display snapshot for the continue-watching row. */
  title?: string;
  poster?: string;
  /** Pops the route stack (the detail screen it launched from is beneath). */
  onBack: () => void;
}

export function PlaybackScreen({
  source,
  contentId,
  type,
  title,
  poster,
  onBack,
}: PlaybackScreenProps) {
  // Live streams (IPTV channels) have no fixed duration: no seek bar, no resume,
  // and continue-watching must not record a channel as "in progress".
  const isLive = source.kind === "live";

  const surfaceRef = useRef<RnVideoSurfaceHandle | null>(null);
  const playerRef = useRef<RnVideoPlayerAdapter | null>(null);
  const [status, setStatus] = useState<PlayerState["status"]>("loading");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Continue-watching: record progress on each tick (throttled) + on
  // pause/ended/unmount (flush); resume from the saved position once loaded.
  const { resumePositionSec, record, flush } = useWatchProgress({
    id: contentId,
    type,
    name: title,
    poster,
  });
  const recordRef = useRef(record);
  recordRef.current = record;
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const resumedRef = useRef(false);

  // The surface's imperative handle is attached before this screen's effects run
  // (child refs precede parent effects), so the factory can read it eagerly.
  const handleFactory = useMemo<RnVideoHandleFactory>(
    () => (callbacks) => {
      const surface = surfaceRef.current;
      if (surface === null) {
        throw new Error("PlaybackScreen: video surface is not mounted");
      }
      return surface.createHandle(callbacks);
    },
    [],
  );

  // Own the player for the screen's lifetime: create → load → play; unsubscribe +
  // destroy on unmount. Keyed on the source so a different source (e.g. the next
  // episode) rebuilds cleanly.
  useEffect(() => {
    const player = new RnVideoPlayerAdapter(handleFactory);
    playerRef.current = player;

    const trackPosition = (positionSec?: number): void => {
      if (positionSec !== undefined) {
        positionRef.current = positionSec;
        setPosition(positionSec);
      }
    };

    const live = source.kind === "live";

    const unsubscribe = [
      player.on("statuschange", (payload) => {
        if (payload.status !== undefined) {
          setStatus(payload.status);
        }
        if (payload.durationSec !== undefined) {
          durationRef.current = payload.durationSec;
          setDuration(payload.durationSec);
        }
        trackPosition(payload.positionSec);
        if (!live && payload.status === "paused") {
          flushRef.current(positionRef.current, durationRef.current);
        }
      }),
      player.on("buffering", (payload) => {
        if (payload.status !== undefined) {
          setStatus(payload.status);
        }
      }),
      player.on("timeupdate", (payload) => {
        trackPosition(payload.positionSec);
        if (!live) {
          recordRef.current(positionRef.current, durationRef.current);
        }
      }),
      player.on("ended", () => {
        setStatus("ended");
        if (!live) {
          flushRef.current(durationRef.current, durationRef.current);
        }
      }),
      player.on("error", (payload) => {
        if (payload.error?.fatal === true) {
          setError(labels.playbackError);
        }
      }),
    ];

    void player
      .load(source)
      .then(() => player.play())
      .catch(() => setError(labels.playbackError));

    return () => {
      for (const dispose of unsubscribe) {
        dispose();
      }
      if (!live) {
        flushRef.current(positionRef.current, durationRef.current);
      }
      player.destroy();
      playerRef.current = null;
    };
  }, [source, handleFactory]);

  // Resume once both the saved position and the media duration are known; seek a
  // single time so it doesn't fight the user scrubbing.
  useEffect(() => {
    if (
      !isLive &&
      !resumedRef.current &&
      resumePositionSec > 0 &&
      duration > 0 &&
      resumePositionSec < duration
    ) {
      playerRef.current?.seek(resumePositionSec);
      positionRef.current = resumePositionSec;
      setPosition(resumePositionSec);
      resumedRef.current = true;
    }
  }, [resumePositionSec, duration, isLive]);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (player === null) {
      return;
    }
    if (status === "playing") {
      player.pause();
    } else {
      player.play();
    }
  }, [status]);

  const onSeek = useCallback((value: number) => {
    playerRef.current?.seek(value);
    setPosition(value);
  }, []);

  const isPlaying = status === "playing";
  const seekable = !isLive && Number.isFinite(duration) && duration > 0;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Button variant="ghost" size="sm" onPress={onBack}>
          {`‹ ${labels.back}`}
        </Button>
        {source.title !== undefined && (
          <Text style={styles.title} numberOfLines={1}>
            {source.title}
          </Text>
        )}
        {isLive && <Badge tone="live">{labels.live}</Badge>}
      </View>

      <RnVideoSurface ref={surfaceRef} style={styles.surface} />

      <View style={styles.controls}>
        {error !== null ? (
          <Callout tone="error" style={styles.flushCallout}>
            {error}
          </Callout>
        ) : (
          <View style={styles.transport}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? labels.pause : labels.play}
              onPress={togglePlay}
              style={styles.playPause}
            >
              <Text style={styles.playPauseGlyph}>
                {isPlaying ? "❚❚" : "▶"}
              </Text>
            </Pressable>
            <Text style={styles.time}>{formatTime(position)}</Text>
            <SeekBar
              positionSec={position}
              durationSec={seekable ? duration : 0}
              disabled={!seekable}
              onSeek={onSeek}
            />
            <Text style={styles.time}>
              {seekable ? formatTime(duration) : "--:--"}
            </Text>
          </View>
        )}

        {(status === "loading" || status === "buffering") && error === null && (
          <Callout tone="status" style={styles.flushCallout}>
            {labels.playbackLoading}
          </Callout>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.black },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.md,
  },
  title: {
    flexShrink: 1,
    fontSize: fontSize.h2,
    fontWeight: "700",
    color: color.sand,
  },
  surface: { flex: 1 },
  controls: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
  transport: { flexDirection: "row", alignItems: "center", gap: space.md },
  playPause: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.coral,
  },
  playPauseGlyph: { color: color.bg, fontSize: fontSize.body },
  time: {
    minWidth: 52,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    fontSize: fontSize.small,
    color: color.sandDim,
  },
  flushCallout: { marginBottom: 0 },
});
