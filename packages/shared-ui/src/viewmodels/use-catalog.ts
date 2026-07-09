// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.1 / ADR-0006 — view-model for a browsable catalog row. Fetches a
// MetaPreview[] for a (type, catalogId) from the addon engine; the first
// consumer is the IPTV channels list (catalog "iptv:all"), but it is generic
// over any addon catalog. Follows the fetch-on-id sub-pattern established by
// useDetail: a useEffect keyed on the query with a stale-response guard. Errors
// surface as a label, never the raw message (ADR-0007). Plain React state,
// core via useCore() (ADR-0011).

import { useEffect, useState } from "react";
import type { CatalogExtra, MediaType, MetaPreview } from "@shrimpler/core";
import { labels } from "../labels/index";
import { useCore } from "../context/core-context";

export interface UseCatalogResult {
  items: readonly MetaPreview[];
  isLoading: boolean;
  /** A labels value ready to render, or null. Never the raw error message. */
  error: string | null;
}

export function useCatalog(
  type: MediaType,
  catalogId: string,
  extra?: CatalogExtra,
): UseCatalogResult {
  const addons = useCore().addons;
  const [items, setItems] = useState<readonly MetaPreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Stale-guard: a newer query must win (see useDetail).
    let ignore = false;
    setIsLoading(true);
    setError(null);
    setItems([]);

    async function load(): Promise<void> {
      try {
        const result = await addons.getCatalog(type, catalogId, extra);
        if (!ignore) {
          setItems(result);
        }
      } catch {
        // The engine isolates per-addon failures internally; this is a backstop.
        if (!ignore) {
          setError(labels.channelsError);
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
  }, [addons, type, catalogId, extra]);

  return { items, isLoading, error };
}
