// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §5 — view-model for the search screen. Title search over core.metadata
// (TMDB-backed in v1). Submit-driven (not live/debounced) to keep requests
// deliberate on a remote; a monotonic request id guards against out-of-order
// responses so a slow earlier query can't overwrite a newer one. Errors surface
// as a label, never the raw message (ADR-0007). Plain React state (ADR-0011).

import { useCallback, useRef, useState } from "react";
import type { MetaPreview } from "@shrimpler/core";
import { labels } from "../labels/index";
import { useCore } from "../context/core-context";

export interface UseSearchResult {
  query: string;
  results: readonly MetaPreview[];
  isSearching: boolean;
  /** A labels value ready to render, or null. Never the raw error message. */
  error: string | null;
  setQuery(value: string): void;
  /** Run the current query. Empty/whitespace clears results without a request. */
  search(): Promise<void>;
}

export function useSearch(): UseSearchResult {
  const metadata = useCore().metadata;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly MetaPreview[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic id: only the latest in-flight request may commit its result.
  const requestRef = useRef(0);

  const search = useCallback(async (): Promise<void> => {
    const trimmed = query.trim();
    const requestId = ++requestRef.current;
    if (trimmed === "") {
      setResults([]);
      setError(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const found = await metadata.search(trimmed);
      if (requestRef.current === requestId) {
        setResults(found);
      }
    } catch {
      if (requestRef.current === requestId) {
        setError(labels.searchError);
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsSearching(false);
      }
    }
  }, [metadata, query]);

  return { query, results, isSearching, error, setQuery, search };
}
