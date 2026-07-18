// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8.2 / ADR-0015 — join XMLTV programmes to IPTV channels. Provider tvg-ids
// are the intended key but are frequently missing or inconsistent, so we fall back
// to a normalized display-name match. Resolved at refresh time so a now/next lookup
// is a direct keyed read (see create-epg).

import type { Channel } from "../iptv/index";
import type { EpgProgramme } from "./types";

export interface MatchChannelsInput {
  /** The source's IPTV channels (the join's left side). */
  iptvChannels: Pick<Channel, "id" | "name" | "tvgId">[];
  /** `<channel>` elements from the XMLTV (id + display-name for fuzzy matching). */
  xmltvChannels: { id: string; displayName?: string }[];
  /** Programmes bucketed by their XMLTV `channel` id, already window-trimmed. */
  programmesByXmltvId: Map<string, EpgProgramme[]>;
}

/**
 * Lowercase, drop quality tags (HD/FHD/UHD/4K/…), strip everything non-alphanumeric
 * — so "BBC One HD" and "BBC One" collapse to the same key. Exported for tests.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fhd|uhd|hd|sd|4k|8k|hevc|h265|h264|raw|vip)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Produce `iptvChannelId → programmes` for the channels that matched a programme
 * stream. Unmatched channels are simply absent (the UI shows no programme info).
 */
export function matchChannels(
  input: MatchChannelsInput,
): Record<string, EpgProgramme[]> {
  const { iptvChannels, xmltvChannels, programmesByXmltvId } = input;

  // Exact index: lowercased xmltv channel id → canonical id. Include ids that only
  // appear on programmes (some feeds omit the <channel> element).
  const byId = new Map<string, string>();
  for (const channel of xmltvChannels) {
    byId.set(channel.id.toLowerCase(), channel.id);
  }
  for (const id of programmesByXmltvId.keys()) {
    const key = id.toLowerCase();
    if (!byId.has(key)) byId.set(key, id);
  }

  // Fuzzy index: normalized display-name → xmltv id (first occurrence wins).
  const byName = new Map<string, string>();
  for (const channel of xmltvChannels) {
    if (channel.displayName === undefined) continue;
    const key = normalizeName(channel.displayName);
    if (key !== "" && !byName.has(key)) byName.set(key, channel.id);
  }

  const result: Record<string, EpgProgramme[]> = {};
  for (const channel of iptvChannels) {
    let xmltvId: string | undefined;
    if (channel.tvgId !== undefined && channel.tvgId !== "") {
      xmltvId = byId.get(channel.tvgId.toLowerCase());
    }
    if (xmltvId === undefined) {
      const key = normalizeName(channel.name);
      if (key !== "") xmltvId = byName.get(key);
    }
    if (xmltvId === undefined) continue;
    const programmes = programmesByXmltvId.get(xmltvId);
    if (programmes === undefined || programmes.length === 0) continue;
    result[channel.id] = [...programmes].sort((a, b) => a.start - b.start);
  }
  return result;
}
