// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §3 / ADR-0014 — view-model for the home-screen "Continue watching" row.
// Reads core.library.listContinueWatching (most-recent first) on mount; each
// entry carries a detail id + type for navigation and a name/poster snapshot for
// the card. `remove` drops an entry and refreshes. Core via useCore() (ADR-0011).

import { useCallback, useEffect, useState } from "react";
import type { ContentId, ProgressEntry } from "@shrimpler/core";
import { useCore } from "../context/core-context";

export interface UseContinueWatchingResult {
  entries: readonly ProgressEntry[];
  isLoading: boolean;
  /** Remove an entry (id is a playable or detail id) and refresh the list. */
  remove(id: ContentId): Promise<void>;
}

export function useContinueWatching(): UseContinueWatchingResult {
  const library = useCore().library;
  const [entries, setEntries] = useState<readonly ProgressEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    void library.listContinueWatching().then((list) => {
      if (!ignore) {
        setEntries(list);
        setIsLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, [library]);

  const remove = useCallback(
    async (id: ContentId): Promise<void> => {
      await library.remove(id);
      const list = await library.listContinueWatching();
      setEntries(list);
    },
    [library],
  );

  return { entries, isLoading, remove };
}
