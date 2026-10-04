// SPDX-License-Identifier: AGPL-3.0-or-later
// Playback screen (§7.1, §10 step 4): mounts a real Html5VideoPlayerAdapter,
// renders its <video> element full-bleed, and drives it with transport controls
// (play/pause, seek, back) styled in the Reef palette (coral tide seek bar). The
// player is web-specific, so the screen constructs the concrete adapter directly
// to reach its `element` (the core PlayerAdapter contract is DOM-less by design,
// ADR-0001/0008). It receives an already-resolved source (a playable url from the
// stream picker → debrid), so no resolution happens here.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { labels, useWatchProgress } from "@shrimpler/shared-ui";
import type {
  ContentId,
  MediaType,
  PlayableSource,
  PlayerState,
} from "@shrimpler/core";
import { FocusContext, setFocus, useBackHandler, useFocusable } from "../focus";
import { BackButton } from "../components/BackButton";
import { Badge, Callout } from "../ui";
import { Html5VideoPlayerAdapter } from "../players/html5-video";
import type { Route } from "../navigation";

const SCREEN_FOCUS_KEY = "PLAYER";
const PLAYPAUSE_FOCUS_KEY = "PLAYER_PLAYPAUSE";
const BACK_FOCUS_KEY = "PLAYER_BACK";

/** Seconds → m:ss (or h:mm:ss) for the transport readout. */
function formatTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) {
    return "0:00";
  }
  const total = Math.floor(totalSec);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface PlaybackScreenProps {
  source: PlayableSource;
  /** The content identity being played — drives continue-watching progress. */
  contentId: ContentId;
  type: MediaType;
  /** Display snapshot for the continue-watching row. */
  title?: string;
  poster?: string;
  /** Where Back returns to (the detail it launched from). */
  back: Route;
  onNavigate: (route: Route) => void;
}

const timeReadout: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontSize: "var(--fs-small)",
  color: "var(--sand-dim)",
  minWidth: 52,
  textAlign: "center",
};

export function PlaybackScreen({
  source,
  contentId,
  type,
  title,
  poster,
  back,
  onNavigate,
}: PlaybackScreenProps) {
  // Live streams (IPTV channels) have no fixed duration: no seek bar, no resume,
  // and continue-watching must not record a channel as "in progress".
  const isLive = source.kind === "live";

  const playerRef = useRef<Html5VideoPlayerAdapter | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<PlayerState["status"]>("loading");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // True while hls.js recovers from a transient live-stream error.
  const [reconnecting, setReconnecting] = useState(false);

  // Continue-watching: record progress on timeupdate (throttled) + on
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

  const goBack = useCallback(() => onNavigate(back), [onNavigate, back]);
  useBackHandler(goBack);

  // Own the player for the screen's lifetime: create → mount element → load →
  // play; unsubscribe + destroy on unmount. Keyed on the source so a different
  // source (e.g. next episode) rebuilds cleanly.
  useEffect(() => {
    const player = new Html5VideoPlayerAdapter();
    playerRef.current = player;
    const element = player.element;
    element.controls = false;
    element.style.width = "100%";
    element.style.height = "100%";
    element.style.objectFit = "contain";
    element.style.background = "#000";
    containerRef.current?.appendChild(element);

    const trackPosition = (positionSec?: number): void => {
      if (positionSec !== undefined) {
        positionRef.current = positionSec;
        setPosition(positionSec);
      }
    };

    const live = source.kind === "live";

    const unsubscribe = [
      player.on("statuschange", (p) => {
        if (p.status !== undefined) setStatus(p.status);
        if (p.durationSec !== undefined) {
          durationRef.current = p.durationSec;
          setDuration(p.durationSec);
        }
        trackPosition(p.positionSec);
        if (p.status === "playing") {
          setReconnecting(false);
        }
        if (!live && p.status === "paused") {
          flushRef.current(positionRef.current, durationRef.current);
        }
      }),
      player.on("timeupdate", (p) => {
        trackPosition(p.positionSec);
        if (!live) {
          recordRef.current(positionRef.current, durationRef.current);
        }
      }),
      player.on("reconnecting", () => setReconnecting(true)),
      player.on("ended", () => {
        setStatus("ended");
        if (!live) {
          flushRef.current(durationRef.current, durationRef.current);
        }
      }),
      player.on("error", (p) => {
        if (p.error?.fatal === true) {
          if (import.meta.env.DEV) {
            console.warn("[playback] fatal", p.error?.code, p.error?.message, {
              url: source.url,
              kind: source.kind,
            });
          }
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
  }, [source]);

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

  const playPause = useFocusable<object, HTMLButtonElement>({
    focusKey: PLAYPAUSE_FOCUS_KEY,
    onEnterPress: togglePlay,
  });
  const seekBar = useFocusable<object, HTMLInputElement>({
    onFocus: () => seekBar.ref.current?.focus(),
  });
  const { ref, focusKey } = useFocusable<object, HTMLElement>({
    focusKey: SCREEN_FOCUS_KEY,
    saveLastFocusedChild: true,
  });

  useEffect(() => {
    void setFocus(PLAYPAUSE_FOCUS_KEY);
  }, []);

  const isPlaying = status === "playing";
  const seekable = Number.isFinite(duration) && duration > 0;

  return (
    <FocusContext.Provider value={focusKey}>
      <main
        ref={ref}
        style={{
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#000",
        }}
      >
        <header
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            padding: "1rem",
            background: "linear-gradient(180deg, rgba(0,0,0,0.6), transparent)",
          }}
        >
          <BackButton onBack={goBack} focusKey={BACK_FOCUS_KEY} />
          {source.title !== undefined && (
            <h1 style={{ fontSize: "var(--fs-h2)", fontWeight: 700 }}>
              {source.title}
            </h1>
          )}
          {isLive && <Badge tone="live">{labels.live}</Badge>}
        </header>

        <div
          ref={containerRef}
          style={{ flex: 1, minHeight: 0, display: "flex" }}
        />

        <div
          style={{
            padding: "1rem 1.25rem 1.5rem",
            background: "linear-gradient(0deg, rgba(0,0,0,0.75), transparent)",
          }}
        >
          {error !== null ? (
            <Callout tone="error" role="alert" style={{ margin: 0 }}>
              {error}
            </Callout>
          ) : (
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <button
                ref={playPause.ref}
                type="button"
                data-focused={playPause.focused}
                onClick={togglePlay}
                aria-label={isPlaying ? labels.pause : labels.play}
                style={{
                  width: 48,
                  height: 48,
                  flexShrink: 0,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(180deg, var(--coral), var(--coral-deep))",
                  color: "var(--bg)",
                  fontSize: "1.1rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span aria-hidden>{isPlaying ? "❚❚" : "▶"}</span>
              </button>
              <span style={timeReadout}>{formatTime(position)}</span>
              <input
                ref={seekBar.ref}
                className="reef-seek"
                type="range"
                min={0}
                max={seekable ? duration : 0}
                step={1}
                value={Math.min(position, seekable ? duration : 0)}
                data-focused={seekBar.focused}
                disabled={!seekable}
                onChange={(e) => onSeek(Number(e.target.value))}
                style={{ flex: 1 }}
                aria-label={labels.play}
              />
              <span style={timeReadout}>
                {seekable ? formatTime(duration) : "--:--"}
              </span>
            </div>
          )}

          {status === "loading" && error === null && (
            <Callout tone="status" role="status" style={{ marginBottom: 0 }}>
              {labels.playbackLoading}
            </Callout>
          )}
          {reconnecting && error === null && (
            <Callout tone="status" role="status" style={{ marginBottom: 0 }}>
              {labels.reconnecting}
            </Callout>
          )}
        </div>
      </main>
    </FocusContext.Provider>
  );
}
