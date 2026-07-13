// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.1 / ADR-0006 — view-model for a catalog's category list (drill-down
// step 1). Fetches CatalogGenre[] (name + count) from the addon engine, then
// presents them for the UI: a synthetic "All" bucket first (product decision),
// then each category alpha-sorted with the uncategorized bucket last (core
// already sorts). The empty-string genre key ("" = uncategorized) is mapped to
// a label here — display copy stays out of core (neutrality, ADR-0007). Follows
// the fetch-on-id pattern of useCatalog: an effect keyed on the query with a
// stale-response guard. Plain React state, core via useCore() (ADR-0011).

import { useEffect, useState } from "react";
import type { MediaType } from "@shrimpler/core";
import { labels } from "../labels/index";
import { useCore } from "../context/core-context";

export interface CatalogCategory {
  /** The extra.genre filter value: undefined = All, "" = uncategorized, else a group. */
  key: string | undefined;
  /** Ready-to-render display string (never raw for the synthetic buckets). */
  label: string;
  count: number;
}

export interface UseCatalogCategoriesResult {
  categories: readonly CatalogCategory[];
  isLoading: boolean;
  /** A labels value ready to render, or null. Never the raw error message. */
  error: string | null;
}

export function useCatalogCategories(
  type: MediaType,
  catalogId: string,
): UseCatalogCategoriesResult {
  const addons = useCore().addons;
  const [categories, setCategories] = useState<readonly CatalogCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Stale-guard: a newer query must win (see useDetail/useCatalog).
    let ignore = false;
    setIsLoading(true);
    setError(null);
    setCategories([]);

    async function load(): Promise<void> {
      try {
        const genres = await addons.getCatalogGenres(type, catalogId);
        if (ignore) return;
        // No genres ⇒ the catalog is empty; show nothing (the screen renders its
        // empty state) rather than a lone "All (0)" bucket.
        if (genres.length === 0) {
          setCategories([]);
          return;
        }
        const total = genres.reduce((sum, g) => sum + g.count, 0);
        const all: CatalogCategory = {
          key: undefined,
          label: labels.categoryAll,
          count: total,
        };
        const rest = genres.map((g) => ({
          key: g.name,
          label: g.name === "" ? labels.categoryUncategorized : g.name,
          count: g.count,
        }));
        setCategories([all, ...rest]);
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
  }, [addons, type, catalogId]);

  return { categories, isLoading, error };
}
