// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8.2 / ADR-0015 — the core.epg surface. Like the IPTV subsystem, loading is
// split: getNowNext serves whatever snapshots exist (instant), while refresh fetches
// stale/missing EPG sources in the background (stale-while-revalidate). EPG source
// URLs are discovered, not configured: Xtream accounts expose xmltv.php, and M3U
// playlists advertise `url-tvg` on their header. Channels for matching come from the
// already-fetched IPTV content snapshots — the EPG pass never re-parses a playlist.

import type { HttpAdapter } from "../adapters/http";
import type { StorageAdapter } from "../adapters/storage";
import type { AddonEngineErrorHandler } from "../addon/create-engine";
import { hashString } from "../util/hash";
import {
  IPTV_PLAYLISTS_STORAGE_KEY,
  IPTV_XTREAM_STORAGE_KEY,
  m3uSourceKey,
  parseM3UEpgUrl,
  xtreamSourceKey,
} from "../iptv/index";
import type {
  Channel,
  IptvContentCache,
  IptvPlaylist,
  XtreamAccount,
} from "../iptv/index";
import { parseXmltvStream } from "./parse-xmltv";
import type { XmltvChannel } from "./parse-xmltv";
import { matchChannels } from "./match-channels";
import type { EpgCache } from "./epg-cache";
import type { EpgProgramme, EpgSnapshotBody, NowNext } from "./types";

/** Live-channel content id prefix (the IPTV addon's `iptv:live:<channel.id>`). */
const LIVE_PREFIX = "iptv:live:";

/** XMLTV updates roughly daily; a snapshot's window stays valid long after fetch. */
export const DEFAULT_EPG_STALE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_PAST_MS = 2 * 60 * 60 * 1000; // keep 2h of history
const DEFAULT_FUTURE_MS = 36 * 60 * 60 * 1000; // and 36h ahead

/** One EPG-able source: its channels (join left side) + where to find its guide. */
export interface EpgSource {
  /** Cache key; mirrors the IPTV source key so it stays stable per source. */
  sourceKey: string;
  channels: Pick<Channel, "id" | "name" | "tvgId">[];
  /** Known EPG endpoint (Xtream xmltv.php). */
  epgUrl?: string;
  /** M3U playlist URL to sniff `url-tvg` from when `epgUrl` is absent. */
  playlistUrl?: string;
  /** Request headers some hosts require. */
  headers?: Record<string, string>;
}

export interface EpgService {
  /**
   * Fetch each stale/missing source's EPG, match it to that source's channels, and
   * persist the derived snapshot. TTL-gated and deduped; `{ force: true }` ignores
   * the TTL. Returns whether any snapshot changed (so the shell can react).
   */
  refresh(options?: { force?: boolean }): Promise<{ changed: boolean }>;
  /**
   * Now/next for the given live content ids (`iptv:live:<id>`) at `at` (default
   * now). Channels with no matched guide are omitted from the result.
   */
  getNowNext(
    contentIds: string[],
    at?: number,
  ): Promise<Record<string, NowNext>>;
}

export interface CreateEpgServiceDeps {
  http: HttpAdapter;
  cache: EpgCache;
  /** Yields the EPG-able sources (channels + guide URL). See listEpgSources. */
  listSources: () => Promise<EpgSource[]>;
  now?: () => number;
  ttlMs?: number;
  /** Window kept in a snapshot: now-`pastMs` … now+`futureMs`. */
  pastMs?: number;
  futureMs?: number;
  onError?: AddonEngineErrorHandler;
}

export function createEpgService(deps: CreateEpgServiceDeps): EpgService {
  const { http, cache, listSources, onError } = deps;
  const now = deps.now ?? (() => Date.now());
  const ttlMs = deps.ttlMs ?? DEFAULT_EPG_STALE_TTL_MS;
  const pastMs = deps.pastMs ?? DEFAULT_PAST_MS;
  const futureMs = deps.futureMs ?? DEFAULT_FUTURE_MS;

  // Merged programmes-by-channel index, memoized and invalidated on a changed write.
  let indexPromise: Promise<Map<string, EpgProgramme[]>> | null = null;
  const loadIndex = (): Promise<Map<string, EpgProgramme[]>> =>
    (indexPromise ??= buildIndex(cache));

  let inFlight: Promise<{ changed: boolean }> | null = null;

  async function runRefresh(force: boolean): Promise<{ changed: boolean }> {
    const sources = await listSources();
    const at = now();
    const windowStart = at - pastMs;
    const windowEnd = at + futureMs;
    const validKeys = new Set<string>();
    let changed = false;

    for (const source of sources) {
      validKeys.add(source.sourceKey);
      const meta = await cache.readMeta(source.sourceKey);
      if (!force && meta !== null && at - meta.fetchedAt < ttlMs) {
        continue;
      }
      try {
        const body = await buildSnapshot(http, source, windowStart, windowEnd);
        if (body === null) continue; // no guide URL — leave any prior snapshot
        const sig = hashString(JSON.stringify(body));
        const bodyChanged = meta?.sig !== sig;
        const ok = await cache.write(source.sourceKey, body, sig, bodyChanged);
        if (ok && bodyChanged) changed = true;
      } catch (error) {
        onError?.({
          manifestUrl: source.sourceKey,
          resource: "manifest",
          error,
        });
      }
    }

    // Drop snapshots for sources no longer configured.
    for (const key of await cache.listSourceKeys()) {
      if (!validKeys.has(key)) await cache.delete(key);
    }

    if (changed) indexPromise = null;
    return { changed };
  }

  return {
    refresh(options?: { force?: boolean }): Promise<{ changed: boolean }> {
      const force = options?.force ?? false;
      if (!force && inFlight !== null) return inFlight;
      const run = runRefresh(force).finally(() => {
        if (inFlight === run) inFlight = null;
      });
      if (!force) inFlight = run;
      return run;
    },

    async getNowNext(
      contentIds: string[],
      at?: number,
    ): Promise<Record<string, NowNext>> {
      const when = at ?? now();
      const index = await loadIndex();
      const result: Record<string, NowNext> = {};
      for (const contentId of contentIds) {
        if (!contentId.startsWith(LIVE_PREFIX)) continue;
        const programmes = index.get(contentId.slice(LIVE_PREFIX.length));
        if (programmes === undefined) continue;
        const nowNext = computeNowNext(programmes, when);
        if (nowNext.now !== undefined || nowNext.next !== undefined) {
          result[contentId] = nowNext;
        }
      }
      return result;
    },
  };
}

/** Now/next from an ascending-by-start programme list. */
function computeNowNext(programmes: EpgProgramme[], at: number): NowNext {
  const nowNext: NowNext = {};
  for (const programme of programmes) {
    if (programme.stop <= at) continue; // already ended
    if (programme.start <= at) {
      nowNext.now = programme; // covers the current instant
      continue;
    }
    nowNext.next = programme; // first future programme
    break;
  }
  return nowNext;
}

/** Fetch + stream-parse one source's XMLTV and match it to that source's channels. */
async function buildSnapshot(
  http: HttpAdapter,
  source: EpgSource,
  windowStart: number,
  windowEnd: number,
): Promise<EpgSnapshotBody | null> {
  const epgUrl =
    source.epgUrl ??
    (source.playlistUrl !== undefined
      ? await sniffPlaylistEpgUrl(http, source.playlistUrl)
      : undefined);
  if (epgUrl === undefined) return null;

  const opts = source.headers !== undefined ? { headers: source.headers } : {};
  const xmltvChannels: XmltvChannel[] = [];
  const programmesByXmltvId = new Map<string, EpgProgramme[]>();

  await parseXmltvStream(streamText(http, epgUrl, opts), {
    onChannel: (channel) => xmltvChannels.push(channel),
    onProgramme: (programme) => {
      // Window trim so a full multi-day guide doesn't bloat the snapshot.
      if (programme.stop <= windowStart || programme.start >= windowEnd) return;
      const kept: EpgProgramme = {
        start: programme.start,
        stop: programme.stop,
        title: programme.title,
      };
      if (programme.desc !== undefined) kept.desc = programme.desc;
      if (programme.category !== undefined) kept.category = programme.category;
      const list = programmesByXmltvId.get(programme.channel);
      if (list !== undefined) list.push(kept);
      else programmesByXmltvId.set(programme.channel, [kept]);
    },
  });

  return {
    byChannel: matchChannels({
      iptvChannels: source.channels,
      xmltvChannels,
      programmesByXmltvId,
    }),
  };
}

/** Stream a URL as text chunks, falling back to a single buffered read. */
function streamText(
  http: HttpAdapter,
  url: string,
  opts: { headers?: Record<string, string> },
): AsyncIterable<string> {
  if (http.getTextStream !== undefined) {
    return http.getTextStream(url, opts);
  }
  return bufferedText(http, url, opts);
}

async function* bufferedText(
  http: HttpAdapter,
  url: string,
  opts: { headers?: Record<string, string> },
): AsyncIterable<string> {
  const response = await http.get(url, opts);
  if (!response.ok) {
    throw new Error(`EPG fetch failed (${response.status})`);
  }
  yield await response.text();
}

/** Read just the head of a playlist to extract its `url-tvg` header attribute. */
async function sniffPlaylistEpgUrl(
  http: HttpAdapter,
  playlistUrl: string,
): Promise<string | undefined> {
  if (http.getTextStream !== undefined) {
    let head = "";
    for await (const chunk of http.getTextStream(playlistUrl)) {
      head += chunk;
      // The `#EXTM3U` header is the first line; stop as soon as we have it.
      if (head.includes("\n") || head.length > 8192) break;
    }
    return parseM3UEpgUrl(head);
  }
  const response = await http.get(playlistUrl);
  if (!response.ok) return undefined;
  return parseM3UEpgUrl(await response.text());
}

/** Read every persisted snapshot and merge into one programmes-by-channel index. */
async function buildIndex(
  cache: EpgCache,
): Promise<Map<string, EpgProgramme[]>> {
  const index = new Map<string, EpgProgramme[]>();
  for (const key of await cache.listSourceKeys()) {
    const body = await cache.readContent(key);
    if (body === null) continue;
    for (const [channelId, programmes] of Object.entries(body.byChannel)) {
      const existing = index.get(channelId);
      if (existing === undefined) {
        index.set(channelId, programmes);
      } else {
        existing.push(...programmes);
        existing.sort((a, b) => a.start - b.start);
      }
    }
  }
  return index;
}

export interface ListEpgSourcesDeps {
  storage: StorageAdapter;
  iptvCache: IptvContentCache;
}

/**
 * Assemble the EPG sources from the configured IPTV sources: read each source's
 * channels from its (already-fetched) IPTV content snapshot, derive the Xtream
 * xmltv.php endpoint, and mark M3U playlists for `url-tvg` sniffing. Sources with
 * no cached content yet (first run, before the IPTV refresh) are skipped.
 */
export async function listEpgSources(
  deps: ListEpgSourcesDeps,
): Promise<EpgSource[]> {
  const { storage, iptvCache } = deps;
  const playlists =
    (await storage.get<IptvPlaylist[]>(IPTV_PLAYLISTS_STORAGE_KEY)) ?? [];
  const accounts =
    (await storage.get<XtreamAccount[]>(IPTV_XTREAM_STORAGE_KEY)) ?? [];
  const sources: EpgSource[] = [];

  for (const playlist of playlists) {
    const sourceKey = m3uSourceKey(playlist.url);
    const content = await iptvCache.readContent(sourceKey);
    if (content === null || content.channels.length === 0) continue;
    sources.push({
      sourceKey,
      channels: content.channels,
      playlistUrl: playlist.url,
    });
  }

  for (const account of accounts) {
    const sourceKey = xtreamSourceKey(account);
    const content = await iptvCache.readContent(sourceKey);
    if (content === null || content.channels.length === 0) continue;
    const base = account.host.trim().replace(/\/+$/, "");
    const query = `username=${encodeURIComponent(
      account.username,
    )}&password=${encodeURIComponent(account.password)}`;
    sources.push({
      sourceKey,
      channels: content.channels,
      epgUrl: `${base}/xmltv.php?${query}`,
    });
  }

  return sources;
}
