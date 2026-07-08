// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.3–§6.4 — view-model for the stream picker: ranked candidates for a
// content id (core.streams.getRankedStreams, which handles the tmdb→imdb hop and
// ranking) plus resolving a chosen one to a playable source via debrid. Combines
// the fetch-on-id shape from useDetail (useEffect keyed on [id,type] with an
// `ignore` stale-guard) with a double-submit ref guard on `select` from
// useAddonManager. Errors surface as labels, never raw messages (ADR-0007).
// Plain React state, core via useCore() (ADR-0011).

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentId, MediaType, PlayableSource } from "@shrimpler/core";
import { labels } from "../labels/index";
import { useCore } from "../context/core-context";

export interface UseStreamPickerResult {
  /** Ranked candidates (ADR-0004); empty until loaded or when none resolve. */
  streams: readonly PlayableSource[];
  isLoading: boolean;
  /** A labels value ready to render, or null. Never the raw error message. */
  error: string | null;
  /** True when a debrid provider is configured, so the UI can hint at adding a
   *  token when a torrent source can't be resolved. Reflects the current core. */
  hasDebrid: boolean;
  /** True while a chosen source is being resolved to a playable URL. */
  isResolving: boolean;
  /** Resolve error as a labels value, or null. */
  resolveError: string | null;
  /**
   * Resolve a chosen candidate to a source with a playable `url`. Returns the
   * resolved source (hand it to the player), or null on failure — in which case
   * `resolveError` is set. A double-submit is ignored while one is in flight.
   */
  select(source: PlayableSource): Promise<PlayableSource | null>;
}

/** A torrent candidate needs debrid; a direct-url one does not. */
function needsDebrid(source: PlayableSource): boolean {
  return (
    source.url === undefined &&
    (source.magnet !== undefined || source.infoHash !== undefined)
  );
}

export function useStreamPicker(
  id: ContentId,
  type: MediaType,
): UseStreamPickerResult {
  const core = useCore();
  const streamService = core.streams;
  const hasDebrid = core.debrid !== undefined;

  const [streams, setStreams] = useState<readonly PlayableSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  // Guard double-submit with a ref (current within a render tick, unlike state).
  const resolvingRef = useRef(false);

  useEffect(() => {
    // Stale-guard: a newer [id, type] must win (mirrors useDetail).
    let ignore = false;
    setIsLoading(true);
    setError(null);
    setStreams([]);
    setResolveError(null);

    async function load(): Promise<void> {
      try {
        const ranked = await streamService.getRankedStreams(id, type);
        if (ignore) {
          return;
        }
        setStreams(ranked);
      } catch {
        if (!ignore) {
          setError(labels.streamResolveError);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [streamService, id, type]);

  const select = useCallback(
    async (source: PlayableSource): Promise<PlayableSource | null> => {
      if (resolvingRef.current) {
        return null;
      }
      // A torrent with no debrid configured can't be played — hint, don't call.
      if (!hasDebrid && needsDebrid(source)) {
        setResolveError(labels.streamNoDebridHint);
        return null;
      }
      resolvingRef.current = true;
      setIsResolving(true);
      setResolveError(null);
      try {
        const resolved = await streamService.resolveStream(source);
        if (resolved === null) {
          setResolveError(labels.streamResolveError);
        }
        return resolved;
      } catch {
        setResolveError(labels.streamResolveError);
        return null;
      } finally {
        resolvingRef.current = false;
        setIsResolving(false);
      }
    },
    [streamService, hasDebrid],
  );

  return {
    streams,
    isLoading,
    error,
    hasDebrid,
    isResolving,
    resolveError,
    select,
  };
}
