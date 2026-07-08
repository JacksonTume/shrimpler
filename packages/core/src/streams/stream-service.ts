// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.3–§6.4 — stream orchestration: turn a content id into a ranked list of
// candidates, then resolve a chosen candidate to a directly playable source via
// debrid (ADR-0005). Kept in core (not a shell view-model) so the flow is unit-
// testable offline and shells stay presentational. Composes existing pieces —
// resolveStreamId (tmdb→imdb hop), AddonEngine.getStreams, rankStreams — and the
// injected DebridProvider; providers supply candidates, debrid resolves them.

import type { AddonEngine } from "../addon/engine";
import type { DebridProvider } from "../debrid/provider";
import type { MetadataResolver } from "../metadata/resolver";
import { rankStreams } from "../ranking/stream-rank";
import type { ContentId, MediaType } from "../types/ids";
import type { PlayableSource } from "../types/sources";

export interface StreamService {
  /**
   * Ranked candidates for a content id (ADR-0004). Resolves the id to its IMDb
   * stream key first (title-search results carry tmdb: ids); annotates the
   * debrid-cached signal best-effort before ranking. Empty when no IMDb id
   * resolves or no addon serves the content.
   */
  getRankedStreams(id: ContentId, type: MediaType): Promise<PlayableSource[]>;
  /**
   * Resolve a chosen candidate to a source with a directly playable `url`. A
   * source that already has a `url` (direct/IPTV) passes through; a torrent is
   * resolved via debrid. Returns null when no debrid is configured for a
   * torrent, or resolution fails.
   */
  resolveStream(source: PlayableSource): Promise<PlayableSource | null>;
}

export interface StreamServiceDeps {
  addons: Pick<AddonEngine, "getStreams">;
  metadata: Pick<MetadataResolver, "resolveStreamId">;
  /** Undefined until the shell supplies a debrid token. */
  debrid?: DebridProvider;
}

export function createStreamService(deps: StreamServiceDeps): StreamService {
  const { addons, metadata, debrid } = deps;

  /** Overlay the debrid instant-availability signal onto sources (non-mutating,
   *  best-effort — a failed check must not drop the list, ADR-0004). */
  async function annotateCached(
    sources: PlayableSource[],
  ): Promise<PlayableSource[]> {
    if (debrid?.checkCached === undefined) {
      return sources;
    }
    const hashes = sources
      .map((s) => s.infoHash)
      .filter((h): h is string => h !== undefined);
    if (hashes.length === 0) {
      return sources;
    }
    try {
      const cached = await debrid.checkCached(hashes);
      return sources.map((s) =>
        s.infoHash === undefined
          ? s
          : { ...s, cached: cached[s.infoHash.toLowerCase()] ?? s.cached },
      );
    } catch {
      return sources; // best-effort; ranking tolerates a missing signal
    }
  }

  return {
    async getRankedStreams(
      id: ContentId,
      type: MediaType,
    ): Promise<PlayableSource[]> {
      const streamId = await metadata.resolveStreamId(id, type);
      if (streamId === null) {
        return [];
      }
      const sources = await addons.getStreams(streamId, type);
      return rankStreams(await annotateCached(sources));
    },

    async resolveStream(
      source: PlayableSource,
    ): Promise<PlayableSource | null> {
      // Already directly playable (direct URL / IPTV, and not a torrent).
      if (
        source.url !== undefined &&
        source.magnet === undefined &&
        source.infoHash === undefined
      ) {
        return source;
      }
      if (debrid === undefined) {
        return null; // a torrent with no debrid configured can't be played (v1)
      }
      const resolved = await debrid.resolve({
        magnet: source.magnet,
        infoHash: source.infoHash,
        url: source.url,
        fileIdx: source.fileIdx,
      });
      if (resolved === null) {
        return null;
      }
      return { ...source, url: resolved.url, cached: resolved.cached };
    },
  };
}
