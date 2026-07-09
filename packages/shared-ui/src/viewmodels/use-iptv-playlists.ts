// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / §14.3 / ADR-0006 — view-model for IPTV playlist settings. Playlists
// are user-supplied M3U URLs stored locally via core.iptv (never committed).
// Because the channels are built into an internal addon at core-construction
// (§7.3), applying a playlist change means rebuilding the core: the shell passes
// `reloadCore`, which this hook calls after a mutation so the new channels
// appear. Mirrors useAddonManager (errors as labels, double-submit guard) and
// useTmdbSettings (reload injected, not imported). Plain React state (ADR-0011).

import { useCallback, useEffect, useRef, useState } from "react";
import type { IptvPlaylist } from "@shrimpler/core";
import { AddonInstallError } from "@shrimpler/core";
import { labels } from "../labels/index";
import { useCore } from "../context/core-context";

export interface UseIptvPlaylistsResult {
  playlists: readonly IptvPlaylist[];
  isSaving: boolean;
  /** A labels value ready to render, or null. Never the raw engine message. */
  error: string | null;
  /** Resolves true when the playlist was added, false on a handled input error. */
  addPlaylist(url: string): Promise<boolean>;
  removePlaylist(url: string): Promise<void>;
  clearError(): void;
}

export function useIptvPlaylists(
  reloadCore: () => Promise<void>,
): UseIptvPlaylistsResult {
  const iptv = useCore().iptv;
  const [playlists, setPlaylists] = useState<readonly IptvPlaylist[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guard double-submit with a ref (current within a render tick, unlike state).
  const savingRef = useRef(false);

  // Seed the list from storage; re-seed if the core (hence iptv) is rebuilt.
  useEffect(() => {
    let ignore = false;
    void iptv.listPlaylists().then((stored) => {
      if (!ignore) {
        setPlaylists(stored);
      }
    });
    return () => {
      ignore = true;
    };
  }, [iptv]);

  const addPlaylist = useCallback(
    async (url: string): Promise<boolean> => {
      if (savingRef.current) {
        return false; // guard double-submit
      }
      savingRef.current = true;
      setIsSaving(true);
      setError(null);
      try {
        await iptv.addPlaylist(url);
        setPlaylists(await iptv.listPlaylists());
        await reloadCore();
        return true;
      } catch (error) {
        // Neutral label to the UI. addPlaylist throws AddonInstallError for a
        // non-http(s) URL (caught before any request); anything else is unexpected.
        setError(labels.iptvAddError);
        if (!(error instanceof AddonInstallError)) {
          throw error;
        }
        return false;
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
    },
    [iptv, reloadCore],
  );

  const removePlaylist = useCallback(
    async (url: string): Promise<void> => {
      await iptv.removePlaylist(url);
      setPlaylists(await iptv.listPlaylists());
      await reloadCore();
    },
    [iptv, reloadCore],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    playlists,
    isSaving,
    error,
    addPlaylist,
    removePlaylist,
    clearError,
  };
}
