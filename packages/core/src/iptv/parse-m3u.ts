// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8 / ADR-0006 — M3U/M3U8 playlist parser. Pure function, no I/O: the shell
// fetches the playlist text via the HttpAdapter and hands it here. Lenient in the
// style of parseManifest (addon/manifest.ts): entries we can't use are dropped
// rather than throwing, so one malformed line never sinks a whole playlist.

import { hashString } from "../util/hash";

/** One parsed channel from a playlist. `id` is a stable, colon-free token. */
export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  /** Request headers (User-Agent/Referer/…) some IPTV CDNs require. */
  headers?: Record<string, string>;
}

/** Matches key="value" attribute pairs on an #EXTINF line. */
const ATTR_RE = /([\w-]+)="([^"]*)"/g;

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of line.matchAll(ATTR_RE)) {
    attrs[match[1]!.toLowerCase()] = match[2]!;
  }
  return attrs;
}

/** Display name: everything after the LAST comma on the #EXTINF line. */
function displayName(line: string): string {
  const comma = line.lastIndexOf(",");
  return comma === -1 ? "" : line.slice(comma + 1).trim();
}

/** Absorb a header directive line into the accumulating headers map. */
function applyHeaderDirective(
  line: string,
  headers: Record<string, string>,
): void {
  if (line.startsWith("#EXTVLCOPT:")) {
    const opt = line.slice("#EXTVLCOPT:".length);
    const eq = opt.indexOf("=");
    if (eq === -1) {
      return;
    }
    const key = opt.slice(0, eq).trim().toLowerCase();
    const value = opt.slice(eq + 1).trim();
    if (key === "http-user-agent") {
      headers["User-Agent"] = value;
    } else if (key === "http-referrer" || key === "http-referer") {
      headers["Referer"] = value;
    }
    return;
  }
  if (line.startsWith("#EXTHTTP:")) {
    try {
      const parsed: unknown = JSON.parse(line.slice("#EXTHTTP:".length).trim());
      if (parsed !== null && typeof parsed === "object") {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === "string") {
            headers[key] = value;
          }
        }
      }
    } catch {
      // Malformed EXTHTTP JSON is ignored (lenient).
    }
  }
}

/** Strip colons/whitespace so `iptv:<id>` never collides with parseId's :S:E. */
function sanitizeId(raw: string): string {
  return raw.replace(/[\s:]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Parse M3U/M3U8 text into channels. Recognizes `#EXTINF` attribute pairs
 * (tvg-id, tvg-name, tvg-logo, group-title), `#EXTGRP` group lines, and the
 * `#EXTVLCOPT`/`#EXTHTTP` header directives that sit between an `#EXTINF` and its
 * URL. Ids are stable (sanitized tvg-id, else a URL hash) and de-duplicated.
 */
export function parseM3U(text: string): Channel[] {
  const lines = text.split(/\r?\n/);
  const channels: Channel[] = [];
  const usedIds = new Set<string>();

  let pending:
    | {
        name: string;
        logo?: string;
        group?: string;
        tvgId?: string;
        headers: Record<string, string>;
      }
    | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line === "#EXTM3U" || line.startsWith("#EXTM3U ")) {
      continue;
    }

    if (line.startsWith("#EXTINF")) {
      const attrs = parseAttributes(line);
      pending = {
        name: displayName(line) || attrs["tvg-name"] || "",
        logo: attrs["tvg-logo"],
        group: attrs["group-title"],
        tvgId: attrs["tvg-id"],
        headers: {},
      };
      continue;
    }

    if (pending !== undefined && line.startsWith("#EXTGRP:")) {
      pending.group = pending.group ?? line.slice("#EXTGRP:".length).trim();
      continue;
    }

    if (pending !== undefined && line.startsWith("#")) {
      applyHeaderDirective(line, pending.headers);
      continue;
    }

    if (line.startsWith("#")) {
      continue; // a directive with no preceding #EXTINF — ignore
    }

    // A non-# line is a stream URL. Emit only if we have an #EXTINF for it.
    if (pending === undefined) {
      continue;
    }

    const base =
      pending.tvgId !== undefined && sanitizeId(pending.tvgId) !== ""
        ? sanitizeId(pending.tvgId)
        : hashString(line);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);

    const channel: Channel = {
      id,
      name: pending.name !== "" ? pending.name : id,
      url: line,
    };
    if (pending.logo !== undefined) channel.logo = pending.logo;
    if (pending.group !== undefined) channel.group = pending.group;
    if (pending.tvgId !== undefined) channel.tvgId = pending.tvgId;
    if (Object.keys(pending.headers).length > 0) {
      channel.headers = pending.headers;
    }
    channels.push(channel);
    pending = undefined;
  }

  return channels;
}
