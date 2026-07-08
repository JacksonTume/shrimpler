// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.4 / §14.3 — view-model for the Real-Debrid token settings. The token
// is user-supplied and stored locally via the StorageAdapter (never committed,
// ADR-0007). Like the TMDB key (§7.3), createCore takes the debrid provider at
// construction, so applying a new token means rebuilding the core: the shell
// passes in `reloadCore`, which this hook calls after persisting — keeping
// shared-ui shell-agnostic. Plain-React-state contract (ADR-0011).

import { useCallback, useEffect, useRef, useState } from "react";
import { useCore } from "../context/core-context";

/** Storage key for the persisted Real-Debrid token. Shared with the composition
 *  root so it reads back the same value at core-build time. */
export const REAL_DEBRID_TOKEN_STORAGE_KEY = "settings:realDebridToken";

export interface UseDebridSettingsResult {
  /** Current field value; seeded from the persisted token on mount. */
  token: string;
  /** True when a debrid provider is active in the current core. */
  hasDebrid: boolean;
  isSaving: boolean;
  /** True briefly after a successful save, for a "Saved" confirmation. */
  justSaved: boolean;
  setToken(value: string): void;
  /** Persist the trimmed token (empty clears it) and rebuild the core. */
  save(): Promise<void>;
  /** Remove the persisted token, clear the field, and rebuild the core. */
  clear(): Promise<void>;
}

export function useDebridSettings(
  reloadCore: () => Promise<void>,
): UseDebridSettingsResult {
  const core = useCore();
  const storage = core.adapters.storage;
  const hasDebrid = core.debrid !== undefined;

  const [token, setToken] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Guard double-submit with a ref (current within a render tick, unlike state).
  const savingRef = useRef(false);

  // Seed the field from the persisted token so it reflects the stored value.
  useEffect(() => {
    let ignore = false;
    void storage.get<string>(REAL_DEBRID_TOKEN_STORAGE_KEY).then((stored) => {
      if (!ignore && stored !== null) {
        setToken(stored);
      }
    });
    return () => {
      ignore = true;
    };
  }, [storage]);

  const save = useCallback(async (): Promise<void> => {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    setJustSaved(false);
    try {
      const trimmed = token.trim();
      if (trimmed === "") {
        await storage.delete(REAL_DEBRID_TOKEN_STORAGE_KEY);
      } else {
        await storage.set(REAL_DEBRID_TOKEN_STORAGE_KEY, trimmed);
      }
      await reloadCore();
      setJustSaved(true);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [token, storage, reloadCore]);

  const clear = useCallback(async (): Promise<void> => {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    setJustSaved(false);
    try {
      await storage.delete(REAL_DEBRID_TOKEN_STORAGE_KEY);
      setToken("");
      await reloadCore();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [storage, reloadCore]);

  const updateToken = useCallback((value: string): void => {
    setToken(value);
    setJustSaved(false);
  }, []);

  return {
    token,
    hasDebrid,
    isSaving,
    justSaved,
    setToken: updateToken,
    save,
    clear,
  };
}
