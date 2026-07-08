// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §10 step 8 / ADR-0014 — view-model for writing continue-watching progress
// during playback. The playback screen drives it from player `timeupdate` /
// `ended`: `record` is throttled (writes only after ~10s of movement) to avoid
// hammering storage; `flush` writes immediately (pause/ended/unmount). It also
// seeds `resumePositionSec` from any saved entry for this exact item, so the
// screen can seek there. Core reached via useCore() (ADR-0011); plain state.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentId, MediaType } from "@shrimpler/core";
import { useCore } from "../context/core-context";

/** How far (seconds) playback must move before a throttled write fires. */
const THROTTLE_SEC = 10;

export interface WatchProgressTarget {
  /** The playable content id (movie id or episode id "show:S:E"). */
  id: ContentId;
  type: MediaType;
  /** Display snapshot stored on the entry for the home row. */
  name?: string;
  poster?: string;
}

export interface UseWatchProgressResult {
  /** Saved position for this exact item, or 0 — seek here once loaded. */
  resumePositionSec: number;
  /** Throttled write (call on every `timeupdate`). */
  record(positionSec: number, durationSec: number): void;
  /** Immediate write (call on pause / ended / unmount). */
  flush(positionSec: number, durationSec: number): void;
}

export function useWatchProgress(
  target: WatchProgressTarget,
): UseWatchProgressResult {
  const library = useCore().library;
  const { id, type, name, poster } = target;
  const [resumePositionSec, setResumePositionSec] = useState(0);
  const lastWrittenRef = useRef(Number.NEGATIVE_INFINITY);

  // Seed the resume point from a saved entry that matches this exact item.
  useEffect(() => {
    let ignore = false;
    void library.getEntry(id).then((entry) => {
      if (!ignore && entry !== null && entry.playableId === id) {
        setResumePositionSec(entry.positionSec);
      }
    });
    return () => {
      ignore = true;
    };
  }, [library, id]);

  const write = useCallback(
    (positionSec: number, durationSec: number): void => {
      lastWrittenRef.current = positionSec;
      void library.recordProgress({
        id,
        type,
        positionSec,
        durationSec,
        name,
        poster,
      });
    },
    [library, id, type, name, poster],
  );

  const record = useCallback(
    (positionSec: number, durationSec: number): void => {
      if (Math.abs(positionSec - lastWrittenRef.current) >= THROTTLE_SEC) {
        write(positionSec, durationSec);
      }
    },
    [write],
  );

  return { resumePositionSec, record, flush: write };
}
