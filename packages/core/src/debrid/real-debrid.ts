// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.4 / ADR-0005, ADR-0013 — Real-Debrid client, the v1 DebridProvider.
// Collapses the torrent case into a direct URL (the player never sees a magnet):
// addMagnet → selectFiles → poll for `downloaded` → unrestrict a link. Lives in
// core but performs no fetch directly — the HttpAdapter and token are injected,
// preserving core purity (ADR-0001). The token is user-supplied and stored
// locally by the shell (neutrality, §14.3); it is never committed.

import type { HttpAdapter } from "../adapters/http";
import type { DebridProvider } from "./provider";

export interface RealDebridProviderOptions {
  http: HttpAdapter;
  /** User's Real-Debrid API token (private app token). */
  token: string;
  /** Per-request timeout handed to the HttpAdapter (default 15s). */
  timeoutMs?: number;
  /** Max `torrents/info` re-checks while waiting for a cached torrent to be
   *  ready (default 6). Long downloads are out of scope for v1 (§13.3). */
  maxPolls?: number;
  /** Delay between poll attempts in ms (default 2s). */
  pollIntervalMs?: number;
  /** Injectable sleep so tests run without real timers. */
  wait?: (ms: number) => Promise<void>;
}

const API_BASE = "https://api.real-debrid.com/rest/1.0";

const VIDEO_EXTENSIONS = [
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".m4v",
  ".webm",
  ".ts",
  ".wmv",
  ".flv",
  ".mpg",
  ".mpeg",
];

// --- Real-Debrid response shapes (only the fields we map) --------------------

interface RdAddMagnet {
  id: string;
}

interface RdFile {
  id: number;
  path: string;
  bytes: number;
  selected?: number;
}

interface RdTorrentInfo {
  id: string;
  status: string; // ...|waiting_files_selection|queued|downloading|downloaded|...
  files?: RdFile[];
  links?: string[];
}

interface RdUnrestrict {
  download: string;
}

function magnetFromHash(infoHash: string): string {
  return `magnet:?xt=urn:btih:${infoHash}`;
}

function isVideoPath(path: string): boolean {
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** RD file id to select: honour `fileIdx` as an index into the file list, else
 *  the largest video file (falling back to the largest file overall). */
function pickFileId(files: RdFile[], fileIdx?: number): number | null {
  if (files.length === 0) {
    return null;
  }
  if (fileIdx !== undefined && fileIdx >= 0 && fileIdx < files.length) {
    return files[fileIdx]!.id;
  }
  const videos = files.filter((f) => isVideoPath(f.path));
  const pool = videos.length > 0 ? videos : files;
  return pool.reduce((largest, f) => (f.bytes > largest.bytes ? f : largest))
    .id;
}

/** True when RD's instantAvailability entry lists at least one cached file. */
function hasCachedFiles(entry: unknown): boolean {
  if (entry === null || typeof entry !== "object") {
    return false;
  }
  // Shape: { <hoster>: [ { <fileId>: {...} }, ... ] }; empty array = not cached.
  return Object.values(entry as Record<string, unknown>).some(
    (hoster) => Array.isArray(hoster) && hoster.length > 0,
  );
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RealDebridProvider implements DebridProvider {
  readonly id = "real-debrid";
  private readonly timeoutMs: number;
  private readonly maxPolls: number;
  private readonly pollIntervalMs: number;
  private readonly wait: (ms: number) => Promise<void>;

  constructor(private readonly options: RealDebridProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxPolls = options.maxPolls ?? 6;
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
    this.wait = options.wait ?? defaultWait;
  }

  private authHeaders(): Record<string, string> {
    return { authorization: `Bearer ${this.options.token}` };
  }

  private async get<T>(path: string): Promise<T | null> {
    const res = await this.options.http.get(`${API_BASE}${path}`, {
      timeoutMs: this.timeoutMs,
      headers: this.authHeaders(),
    });
    return res.ok ? res.json<T>() : null;
  }

  /** Form-encoded POST that parses a JSON reply (addMagnet, unrestrict). */
  private async post<T>(
    path: string,
    body: Record<string, string>,
  ): Promise<T | null> {
    const res = await this.options.http.post(`${API_BASE}${path}`, body, {
      timeoutMs: this.timeoutMs,
      form: true,
      headers: this.authHeaders(),
    });
    return res.ok ? res.json<T>() : null;
  }

  /** Form-encoded POST with no useful body (selectFiles → 204). */
  private async postVoid(
    path: string,
    body: Record<string, string>,
  ): Promise<boolean> {
    const res = await this.options.http.post(`${API_BASE}${path}`, body, {
      timeoutMs: this.timeoutMs,
      form: true,
      headers: this.authHeaders(),
    });
    return res.ok;
  }

  private async unrestrict(link: string): Promise<string | null> {
    const result = await this.post<RdUnrestrict>("/unrestrict/link", { link });
    return result?.download ?? null;
  }

  async resolve(input: {
    magnet?: string;
    infoHash?: string;
    url?: string;
    fileIdx?: number;
  }): Promise<{ url: string; cached: boolean } | null> {
    // A restricted hoster link (not a torrent): unrestrict straight to a
    // direct, playable URL — always instantly available.
    if (input.url !== undefined) {
      const download = await this.unrestrict(input.url);
      return download === null ? null : { url: download, cached: true };
    }

    const magnet =
      input.magnet ??
      (input.infoHash !== undefined
        ? magnetFromHash(input.infoHash)
        : undefined);
    if (magnet === undefined) {
      return null;
    }

    const added = await this.post<RdAddMagnet>("/torrents/addMagnet", {
      magnet,
    });
    if (added === null) {
      return null;
    }
    const torrentId = added.id;

    let info = await this.get<RdTorrentInfo>(`/torrents/info/${torrentId}`);
    if (info === null) {
      return null;
    }
    const fileId = pickFileId(info.files ?? [], input.fileIdx);
    if (fileId === null) {
      return null;
    }
    await this.postVoid(`/torrents/selectFiles/${torrentId}`, {
      files: String(fileId),
    });

    // Bounded poll: a cached torrent flips to `downloaded` almost immediately;
    // an uncached one would download server-side, which v1 does not wait on.
    info = await this.get<RdTorrentInfo>(`/torrents/info/${torrentId}`);
    let polls = 0;
    while (
      info !== null &&
      info.status !== "downloaded" &&
      polls < this.maxPolls
    ) {
      await this.wait(this.pollIntervalMs);
      info = await this.get<RdTorrentInfo>(`/torrents/info/${torrentId}`);
      polls += 1;
    }
    if (info === null) {
      return null;
    }
    const link = info.links?.[0];
    if (link === undefined) {
      return null; // not cached yet — nothing to play in v1
    }
    const download = await this.unrestrict(link);
    if (download === null) {
      return null;
    }
    return { url: download, cached: info.status === "downloaded" };
  }

  /** Best-effort cached check (§13.3 note: RD degraded this endpoint in 2024 —
   *  missing/empty entries mean "not cached", and any failure yields all-false
   *  rather than throwing, so ranking degrades gracefully). */
  async checkCached(infoHashes: string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const hash of infoHashes) {
      result[hash.toLowerCase()] = false;
    }
    if (infoHashes.length === 0) {
      return result;
    }
    try {
      const path = `/torrents/instantAvailability/${infoHashes
        .map((h) => h.toLowerCase())
        .join("/")}`;
      const data = await this.get<Record<string, unknown>>(path);
      if (data !== null) {
        for (const [hash, entry] of Object.entries(data)) {
          result[hash.toLowerCase()] = hasCachedFiles(entry);
        }
      }
    } catch {
      // Best-effort: leave the all-false defaults in place.
    }
    return result;
  }
}
