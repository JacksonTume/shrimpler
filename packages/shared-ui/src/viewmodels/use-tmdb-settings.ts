// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §5 / §14.3 — view-model for the runtime TMDB API-key settings. The key
// is user-supplied and stored locally via the StorageAdapter (never committed).
// Because createCore takes its providers at construction (§7.3), applying a new
// key means rebuilding the core: the shell passes in `reloadCore`, which this
// hook calls after persisting — keeping shared-ui shell-agnostic (the reload is
// injected, not imported). Follows the plain-React-state contract (ADR-0011).

import { useCallback, useEffect, useRef, useState } from "react";
import { useCore } from "../context/core-context";

/** Storage key for the persisted TMDB API key. Shared with the composition
 *  root so it reads back the same value at core-build time. */
export const TMDB_API_KEY_STORAGE_KEY = "settings:tmdbApiKey";

export interface UseTmdbSettingsResult {
  /** Current field value; seeded from the persisted key on mount. */
  apiKey: string;
  /** True when a TMDB provider is active in the current core. */
  hasProvider: boolean;
  isSaving: boolean;
  /** True briefly after a successful save, for a "Saved" confirmation. */
  justSaved: boolean;
  setApiKey(value: string): void;
  /** Persist the trimmed key (empty clears it) and rebuild the core. */
  save(): Promise<void>;
  /** Remove the persisted key, clear the field, and rebuild the core. */
  clear(): Promise<void>;
}

export function useTmdbSettings(
  reloadCore: () => Promise<void>,
): UseTmdbSettingsResult {
  const core = useCore();
  const storage = core.adapters.storage;
  const hasProvider = core.providers.some((p) => p.id === "tmdb");

  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Guard double-submit with a ref (current within a render tick, unlike state).
  const savingRef = useRef(false);

  // Seed the field from the persisted key so it reflects the stored value.
  useEffect(() => {
    let ignore = false;
    void storage.get<string>(TMDB_API_KEY_STORAGE_KEY).then((stored) => {
      if (!ignore && stored !== null) {
        setApiKey(stored);
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
      const trimmed = apiKey.trim();
      if (trimmed === "") {
        await storage.delete(TMDB_API_KEY_STORAGE_KEY);
      } else {
        await storage.set(TMDB_API_KEY_STORAGE_KEY, trimmed);
      }
      await reloadCore();
      setJustSaved(true);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [apiKey, storage, reloadCore]);

  const clear = useCallback(async (): Promise<void> => {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    setJustSaved(false);
    try {
      await storage.delete(TMDB_API_KEY_STORAGE_KEY);
      setApiKey("");
      await reloadCore();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [storage, reloadCore]);

  const updateApiKey = useCallback((value: string): void => {
    setApiKey(value);
    setJustSaved(false);
  }, []);

  return {
    apiKey,
    hasProvider,
    isSaving,
    justSaved,
    setApiKey: updateApiKey,
    save,
    clear,
  };
}
