// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §8.2 / ADR-0015 — EPG pipeline: streaming XMLTV parse, tvg-id matching
// (with fuzzy fallback), a snapshot cache, and the core.epg now/next surface.

export {
  createEpgService,
  listEpgSources,
  DEFAULT_EPG_STALE_TTL_MS,
} from "./create-epg";
export type {
  EpgService,
  EpgSource,
  CreateEpgServiceDeps,
  ListEpgSourcesDeps,
} from "./create-epg";
export { createEpgCache, EPG_SNAPSHOT_VERSION } from "./epg-cache";
export type { EpgCache, EpgCacheDeps, EpgSnapshotMeta } from "./epg-cache";
export { parseXmltvStream, parseXmltvTime } from "./parse-xmltv";
export type {
  XmltvChannel,
  XmltvProgramme,
  XmltvHandlers,
} from "./parse-xmltv";
export { matchChannels, normalizeName } from "./match-channels";
export type { MatchChannelsInput } from "./match-channels";
export type { EpgProgramme, NowNext, EpgSnapshotBody } from "./types";
