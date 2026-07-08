// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §3 / §13.4 — the first view-model. Wraps the addon engine (core.addons)
// as React state + handlers, shell-agnostic. Establishes the contract every
// later view-model follows: plain React state (no external store), the engine
// reached via useCore(), and user-facing errors rendered as labels (never the
// raw engine message — ADR-0007).

import { useCallback, useRef, useState } from "react";
import type { InstalledAddon } from "@shrimpler/core";
import { AddonInstallError } from "@shrimpler/core";
import { labels } from "../labels/index";
import { useCore } from "../context/core-context";

export interface UseAddonManagerResult {
  addons: readonly InstalledAddon[];
  isInstalling: boolean;
  /** A labels value ready to render, or null. Never the raw engine message. */
  installError: string | null;
  /** Resolves true when the source installed, false on a handled input error. */
  addByUrl(url: string): Promise<boolean>;
  remove(url: string): Promise<void>;
  setEnabled(url: string, enabled: boolean): Promise<void>;
  clearError(): void;
}

export function useAddonManager(): UseAddonManagerResult {
  const engine = useCore().addons;
  // Seed synchronously: the engine already loaded persisted state at createCore,
  // so there is no list-loading phase. Mutations are async; list() is sync — we
  // re-read it after each awaited mutation to re-sync React state.
  const [addons, setAddons] = useState<readonly InstalledAddon[]>(() =>
    engine.list(),
  );
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  // Guard double-submit with a ref, not the state: two calls in the same render
  // tick both read the stale `isInstalling` closure, but the ref is current.
  const installingRef = useRef(false);

  const addByUrl = useCallback(
    async (url: string): Promise<boolean> => {
      if (installingRef.current) {
        return false; // guard double-submit
      }
      installingRef.current = true;
      setIsInstalling(true);
      setInstallError(null);
      try {
        await engine.install(url);
        setAddons(engine.list());
        return true;
      } catch (error) {
        // Neutral label to the UI; the raw cause is left for the debug channel.
        // The engine's own onError hook (§13.6) already reports fetch/parse
        // failures; AddonInstallError also covers non-http(s) URLs caught before
        // any request, so surface a message for those too.
        setInstallError(labels.addSourceError);
        if (!(error instanceof AddonInstallError)) {
          throw error;
        }
        return false;
      } finally {
        installingRef.current = false;
        setIsInstalling(false);
      }
    },
    [engine],
  );

  const remove = useCallback(
    async (url: string): Promise<void> => {
      await engine.remove(url);
      setAddons(engine.list());
    },
    [engine],
  );

  const setEnabled = useCallback(
    async (url: string, enabled: boolean): Promise<void> => {
      await engine.setEnabled(url, enabled);
      setAddons(engine.list());
    },
    [engine],
  );

  const clearError = useCallback(() => setInstallError(null), []);

  return {
    addons,
    isInstalling,
    installError,
    addByUrl,
    remove,
    setEnabled,
    clearError,
  };
}
