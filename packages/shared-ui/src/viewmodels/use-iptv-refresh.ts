// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — ambient IPTV background refresh. buildIptvAddon is
// cache-only, so a fresh core serves whatever snapshots exist instantly; this
// hook then fetches missing/stale sources in the background (core.iptv.refresh)
// and, when content changed, rebuilds the core so the new channels appear.
//
// Runs once per core instance: after a rebuild the new core's snapshots are fresh
// (within the staleness TTL), so the follow-up refresh is a no-op and the
// refresh→reload cycle self-terminates. A ref keyed on the iptv instance also
// dedupes React StrictMode's double-effect in dev, so a source is fetched once.
// Mounted at the app root (App.tsx); `isRefreshing` drives an "updating…" hint.

import { useEffect, useRef, useState } from "react";
import type { IptvRefreshProgress } from "@shrimpler/core";
import { useCore } from "../context/core-context";

export interface UseIptvRefreshResult {
  /** True while a background fetch of IPTV sources is in flight. */
  isRefreshing: boolean;
  /** Live progress of the current refresh, or null when idle. */
  progress: IptvRefreshProgress | null;
}

export function useIptvRefresh(
  reloadCore: () => Promise<void>,
): UseIptvRefreshResult {
  const iptv = useCore().iptv;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<IptvRefreshProgress | null>(null);
  // The iptv instance we've already kicked a refresh for (dedupes StrictMode).
  const refreshedFor = useRef<unknown>(null);

  useEffect(() => {
    if (refreshedFor.current === iptv) {
      return;
    }
    refreshedFor.current = iptv;
    let active = true;
    setIsRefreshing(true);
    setProgress(null);
    void iptv
      .refresh({
        onProgress: (p) => {
          if (active) {
            setProgress(p);
          }
        },
      })
      .then(({ changed }) => (changed ? reloadCore() : undefined))
      .catch(() => {
        // Per-source failures are already isolated + reported inside core; a
        // whole-refresh rejection here is non-fatal — cached content still shows.
      })
      .finally(() => {
        if (active) {
          setIsRefreshing(false);
          setProgress(null);
        }
      });
    return () => {
      active = false;
    };
  }, [iptv, reloadCore]);

  return { isRefreshing, progress };
}
