// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.1 / ADR-0006 — view-model for a *paged* catalog (drill-down step 2).
// Unlike useCatalog (single page, replace-on-change), this accumulates pages via
// CatalogExtra.skip and appends, so a category with thousands of items renders
// incrementally instead of mounting all at once. Effect keys on primitive query
// fields (type/catalogId/genre/total) — never an object — so a caller passing a
// fresh { genre } each render cannot cause a refetch loop. Page size is the
// canonical value from core so client and addon agree. Plain React state, core
// via useCore() (ADR-0011); errors surface as a label (ADR-0007).

import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogExtra, MediaType, MetaPreview } from "@shrimpler/core";
import { CATALOG_PAGE_SIZE } from "@shrimpler/core";
import { labels } from "../labels/index";
import { useCore } from "../context/core-context";

export interface UseCatalogPageResult {
  items: readonly MetaPreview[];
  /** True while the first page is loading. */
  isLoading: boolean;
  /** True while a subsequent page (loadMore) is loading. */
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
}

export function useCatalogPage(
  type: MediaType,
  catalogId: string,
  genre?: string,
  total?: number,
): UseCatalogPageResult {
  const addons = useCore().addons;
  const [items, setItems] = useState<readonly MetaPreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs keep loadMore a stable callback and guard against stale/concurrent
  // loads: generation invalidates in-flight responses when the query changes;
  // page is the next slice to fetch; count mirrors items.length synchronously
  // (setItems' updater runs on commit, too late to derive hasMore from).
  const genRef = useRef(0);
  const pageRef = useRef(0);
  const countRef = useRef(0);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(false);

  const setMore = useCallback((value: boolean) => {
    hasMoreRef.current = value;
    setHasMore(value);
  }, []);

  const fetchPage = useCallback(
    async (generation: number, page: number, append: boolean) => {
      loadingRef.current = true;
      if (append) setIsLoadingMore(true);
      try {
        const extra: CatalogExtra = { skip: page * CATALOG_PAGE_SIZE };
        if (genre !== undefined) extra.genre = genre;
        const result = await addons.getCatalog(type, catalogId, extra);
        if (genRef.current !== generation) return;
        const base = append ? countRef.current : 0;
        countRef.current = base + result.length;
        pageRef.current = page + 1;
        setItems((prev) => (append ? [...prev, ...result] : result));
        setMore(
          total !== undefined
            ? countRef.current < total
            : result.length === CATALOG_PAGE_SIZE,
        );
      } catch {
        if (genRef.current === generation) {
          setError(labels.channelsError);
          setMore(false);
        }
      } finally {
        if (genRef.current === generation) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
        loadingRef.current = false;
      }
    },
    [addons, type, catalogId, genre, total, setMore],
  );

  // Reset + fetch page 0 whenever the query changes (primitive deps only).
  useEffect(() => {
    const generation = ++genRef.current;
    pageRef.current = 0;
    countRef.current = 0;
    loadingRef.current = false;
    setItems([]);
    setError(null);
    setIsLoading(true);
    setIsLoadingMore(false);
    setMore(false);
    void fetchPage(generation, 0, false);
  }, [fetchPage, setMore]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return;
    void fetchPage(genRef.current, pageRef.current, true);
  }, [fetchPage]);

  return { items, isLoading, isLoadingMore, hasMore, error, loadMore };
}
