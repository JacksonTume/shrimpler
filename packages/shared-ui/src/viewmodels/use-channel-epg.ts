// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8.2 / ADR-0015 — view-model for now/next on live-channel rows. Given the
// visible page's content ids, it reads cached EPG immediately, then ensures a
// background refresh has run and re-reads if the guide changed. Core via useCore()
// (ADR-0011); the guide is supplementary, so a fetch failure is swallowed (the row
// just shows no programme info) rather than surfaced as an error.

import { useEffect, useRef, useState } from "react";
import type { NowNext } from "@shrimpler/core";
import { useCore } from "../context/core-context";

export interface UseNowNextResult {
  /** now/next keyed by live content id; ids with no matched guide are absent. */
  byId: Record<string, NowNext>;
  /** True until the first read resolves. */
  isLoading: boolean;
}

/**
 * now/next for a set of live content ids (`iptv:live:<id>`). Pass the ids of the
 * channels currently on screen; the hook batches them into one lookup and refetches
 * only when that set changes (keyed on the joined ids — content ids are comma-free).
 */
export function useNowNext(contentIds: readonly string[]): UseNowNextResult {
  const epg = useCore().epg;
  const [byId, setById] = useState<Record<string, NowNext>>({});
  const [isLoading, setIsLoading] = useState(true);
  const key = contentIds.join(",");
  // Guard against a stale async resolving after the query changed.
  const genRef = useRef(0);

  useEffect(() => {
    const generation = ++genRef.current;
    const ids = key === "" ? [] : key.split(",");
    setIsLoading(true);
    if (ids.length === 0) {
      setById({});
      setIsLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      // Fast path: whatever is already cached.
      const cached = await epg.getNowNext(ids).catch(() => ({}));
      if (active && genRef.current === generation) setById(cached);
      // Ensure the guide is up to date (TTL-gated + deduped), then re-read.
      const { changed } = await epg.refresh().catch(() => ({ changed: false }));
      if (changed) {
        const fresh = await epg.getNowNext(ids).catch(() => ({}));
        if (active && genRef.current === generation) setById(fresh);
      }
      if (active && genRef.current === generation) setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [epg, key]);

  return { byId, isLoading };
}
