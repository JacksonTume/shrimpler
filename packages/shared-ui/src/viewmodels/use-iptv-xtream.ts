// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / §14.3 / ADR-0006 — view-model for Xtream Codes account settings.
// Accounts are user-supplied (host/username/password) stored locally via
// core.iptv (never committed). Like useIptvPlaylists, applying a change rebuilds
// the core (reloadCore) so the new live + VOD content appears. Errors surface as
// labels (ADR-0007); plain React state (ADR-0011).

import { useCallback, useEffect, useRef, useState } from "react";
import type { XtreamAccount } from "@shrimpler/core";
import { AddonInstallError } from "@shrimpler/core";
import { labels } from "../labels/index";
import { useCore } from "../context/core-context";

export interface UseIptvXtreamResult {
  accounts: readonly XtreamAccount[];
  isSaving: boolean;
  /** A labels value ready to render, or null. Never the raw engine message. */
  error: string | null;
  /** Resolves true when the account was added, false on a handled input error. */
  addAccount(account: XtreamAccount): Promise<boolean>;
  removeAccount(host: string, username: string): Promise<void>;
  clearError(): void;
}

export function useIptvXtream(
  reloadCore: () => Promise<void>,
): UseIptvXtreamResult {
  const iptv = useCore().iptv;
  const [accounts, setAccounts] = useState<readonly XtreamAccount[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let ignore = false;
    void iptv.listXtreamAccounts().then((stored) => {
      if (!ignore) {
        setAccounts(stored);
      }
    });
    return () => {
      ignore = true;
    };
  }, [iptv]);

  const addAccount = useCallback(
    async (account: XtreamAccount): Promise<boolean> => {
      if (savingRef.current) {
        return false; // guard double-submit
      }
      savingRef.current = true;
      setIsSaving(true);
      setError(null);
      try {
        await iptv.addXtreamAccount(account);
        setAccounts(await iptv.listXtreamAccounts());
        await reloadCore();
        return true;
      } catch (error) {
        // Neutral label to the UI. addXtreamAccount throws AddonInstallError for
        // a non-http(s) host (caught before any request).
        setError(labels.xtreamAddError);
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

  const removeAccount = useCallback(
    async (host: string, username: string): Promise<void> => {
      await iptv.removeXtreamAccount(host, username);
      setAccounts(await iptv.listXtreamAccounts());
      await reloadCore();
    },
    [iptv, reloadCore],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    accounts,
    isSaving,
    error,
    addAccount,
    removeAccount,
    clearError,
  };
}
