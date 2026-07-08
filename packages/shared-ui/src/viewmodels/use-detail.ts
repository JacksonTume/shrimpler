// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §5 / ADR-0003 — view-model for the detail screen: the first consumer of
// core.metadata. Resolves a MetaDetail for a content id (addon-meta-first, TMDB
// gap-fill, TTL-cached — all handled in the core) and, for series, the episode
// list. Unlike useAddonManager (which seeds synchronously), this is async and
// network-bound, so it establishes the fetch-on-id sub-pattern: a useEffect
// keyed on [id, type] with a stale-response guard so a fast id change can't
// clobber a later render. Errors surface as a label, never the raw message
// (ADR-0007). Plain React state, core via useCore() (ADR-0011).

import { useEffect, useState } from "react";
import type {
  ContentId,
  EpisodeRef,
  MediaType,
  MetaDetail,
} from "@shrimpler/core";
import { labels } from "../labels/index";
import { useCore } from "../context/core-context";

export interface UseDetailResult {
  detail: MetaDetail | null;
  /** Series episode list; empty for movies or when none resolve. */
  episodes: readonly EpisodeRef[];
  isLoading: boolean;
  /** A labels value ready to render, or null. Never the raw error message. */
  error: string | null;
  /** True when a metadata provider is configured, so the empty state can hint
   *  at adding one (§5). Reflects the current core, so it updates after a
   *  Settings save rebuilds it. */
  hasProvider: boolean;
}

export function useDetail(id: ContentId, type: MediaType): UseDetailResult {
  const core = useCore();
  const metadata = core.metadata;
  const hasProvider = core.providers.length > 0;
  const [detail, setDetail] = useState<MetaDetail | null>(null);
  const [episodes, setEpisodes] = useState<readonly EpisodeRef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Stale-guard: a newer [id, type] must win. The cleanup flips `ignore`, so a
    // slow earlier response is dropped instead of overwriting the current one.
    let ignore = false;
    setIsLoading(true);
    setError(null);
    setDetail(null);
    setEpisodes([]);

    async function load(): Promise<void> {
      try {
        const isSeries = type === "series";
        const [resolvedDetail, resolvedEpisodes] = await Promise.all([
          metadata.resolveDetail(id, type),
          isSeries
            ? metadata.resolveEpisodes(id)
            : Promise.resolve<EpisodeRef[]>([]),
        ]);
        if (ignore) {
          return;
        }
        setDetail(resolvedDetail);
        setEpisodes(resolvedEpisodes);
      } catch {
        // The resolver isolates provider outages internally; this is a backstop
        // for anything that still throws. Neutral label to the UI.
        if (!ignore) {
          setError(labels.detailError);
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
  }, [metadata, id, type]);

  return { detail, episodes, isLoading, error, hasProvider };
}
