// SPDX-License-Identifier: AGPL-3.0-or-later
// Resource endpoint client (§6.1): builds `GET {base}/{resource}/{type}/{id}
// [/{extra}].json` URLs and maps protocol response bodies to domain types.

import type { HttpAdapter } from "../adapters/http";
import type { CatalogExtra } from "../types/addon";
import type { ContentId, MediaType } from "../types/ids";
import type { MetaDetail, MetaPreview } from "../types/meta";
import type {
  PlayableSource,
  PlaybackKind,
  SubtitleTrack,
} from "../types/sources";
import { withTimeout } from "./timeout";

/** Encode a path segment, but keep ':' verbatim — ids like "tt1:1:5" travel raw. */
function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(/%3A/gi, ":");
}

/** Deterministic extra-props segment: `search=…&genre=…&skip=…`. */
export function encodeExtra(extra: CatalogExtra): string {
  const parts: string[] = [];
  if (extra.search !== undefined) {
    parts.push(`search=${encodeURIComponent(extra.search)}`);
  }
  if (extra.genre !== undefined) {
    parts.push(`genre=${encodeURIComponent(extra.genre)}`);
  }
  if (extra.skip !== undefined) {
    parts.push(`skip=${extra.skip}`);
  }
  return parts.join("&");
}

/** The addon base URL is the manifest URL minus query/hash and last segment. */
export function buildResourceUrl(
  manifestUrl: string,
  resource: string,
  type: MediaType,
  id: string,
  extra?: CatalogExtra,
): string {
  const withoutQuery = manifestUrl.replace(/[?#].*$/, "");
  const base = withoutQuery.slice(0, withoutQuery.lastIndexOf("/"));
  const extraSegment = extra === undefined ? "" : encodeExtra(extra);
  return (
    `${base}/${resource}/${encodeSegment(type)}/${encodeSegment(id)}` +
    (extraSegment === "" ? "" : `/${extraSegment}`) +
    ".json"
  );
}

async function getJson(
  http: HttpAdapter,
  url: string,
  timeoutMs: number,
): Promise<unknown> {
  const response = await withTimeout(
    http.get(url, { timeoutMs }),
    timeoutMs,
    `GET ${url}`,
  );
  if (!response.ok) {
    throw new Error(`GET ${url} failed with status ${response.status}`);
  }
  return response.json<unknown>();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function fetchCatalog(
  http: HttpAdapter,
  manifestUrl: string,
  type: MediaType,
  catalogId: string,
  timeoutMs: number,
  extra?: CatalogExtra,
): Promise<MetaPreview[]> {
  const url = buildResourceUrl(manifestUrl, "catalog", type, catalogId, extra);
  const body = await getJson(http, url, timeoutMs);
  const metas = isRecord(body) ? body["metas"] : undefined;
  if (!Array.isArray(metas)) {
    throw new Error(`GET ${url} returned no "metas" array`);
  }
  return metas.filter(
    (m): m is MetaPreview =>
      isRecord(m) &&
      typeof m["id"] === "string" &&
      typeof m["name"] === "string",
  );
}

export async function fetchMeta(
  http: HttpAdapter,
  manifestUrl: string,
  type: MediaType,
  id: ContentId,
  timeoutMs: number,
): Promise<MetaDetail | null> {
  const url = buildResourceUrl(manifestUrl, "meta", type, id);
  const body = await getJson(http, url, timeoutMs);
  const meta = isRecord(body) ? body["meta"] : undefined;
  if (isRecord(meta) && typeof meta["id"] === "string") {
    return meta as unknown as MetaDetail;
  }
  return null;
}

/** Protocol stream object — only the fields the pipeline consumes. */
interface ProtocolStream {
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  title?: string;
  name?: string;
  behaviorHints?: { notWebReady?: boolean; bingeGroup?: string };
  subtitles?: unknown;
}

function parseSubtitleTracks(value: unknown): SubtitleTrack[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (s): s is SubtitleTrack =>
      isRecord(s) &&
      typeof s["url"] === "string" &&
      typeof s["lang"] === "string",
  );
}

function toPlayableSource(
  stream: ProtocolStream,
  kind: PlaybackKind,
  addonId: string,
  index: number,
): PlayableSource | null {
  const isMagnet = stream.url !== undefined && stream.url.startsWith("magnet:");
  const url = isMagnet ? undefined : stream.url;
  const magnet = isMagnet ? stream.url : undefined;
  if (
    url === undefined &&
    magnet === undefined &&
    stream.infoHash === undefined
  ) {
    // External/unsupported source (e.g. ytId-only) — nothing we can play.
    return null;
  }
  const id =
    stream.infoHash !== undefined
      ? `${stream.infoHash}:${stream.fileIdx ?? 0}`
      : (url ?? magnet ?? `${addonId}#${index}`);
  return {
    id,
    kind,
    url,
    magnet,
    infoHash: stream.infoHash,
    fileIdx: stream.fileIdx,
    title: stream.title ?? stream.name,
    behaviorHints:
      stream.behaviorHints === undefined
        ? undefined
        : {
            notWebReady: stream.behaviorHints.notWebReady,
            bingeGroup: stream.behaviorHints.bingeGroup,
          },
    subtitles: parseSubtitleTracks(stream.subtitles),
    source: addonId,
  };
}

export async function fetchStreams(
  http: HttpAdapter,
  manifestUrl: string,
  type: MediaType,
  id: ContentId,
  timeoutMs: number,
  addonId: string,
): Promise<PlayableSource[]> {
  const url = buildResourceUrl(manifestUrl, "stream", type, id);
  const body = await getJson(http, url, timeoutMs);
  const streams = isRecord(body) ? body["streams"] : undefined;
  if (!Array.isArray(streams)) {
    throw new Error(`GET ${url} returned no "streams" array`);
  }
  const kind: PlaybackKind =
    type === "tv" || type === "channel" ? "live" : "vod";
  const sources: PlayableSource[] = [];
  streams.forEach((raw, index) => {
    if (!isRecord(raw)) {
      return;
    }
    const source = toPlayableSource(
      raw as ProtocolStream,
      kind,
      addonId,
      index,
    );
    if (source !== null) {
      sources.push(source);
    }
  });
  return sources;
}

export async function fetchSubtitles(
  http: HttpAdapter,
  manifestUrl: string,
  type: MediaType,
  id: ContentId,
  timeoutMs: number,
): Promise<SubtitleTrack[]> {
  const url = buildResourceUrl(manifestUrl, "subtitles", type, id);
  const body = await getJson(http, url, timeoutMs);
  const subtitles = isRecord(body) ? body["subtitles"] : undefined;
  return parseSubtitleTracks(subtitles);
}

export { getJson };
