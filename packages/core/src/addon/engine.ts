// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.2 — Addon engine responsibilities: store installed addons, fan out to
// every enabled addon that can serve resource+type (respecting idPrefixes),
// enforce per-addon timeouts and partial-failure isolation.

import type { ContentId, MediaType } from "../types/ids";
import type { MetaPreview, MetaDetail } from "../types/meta";
import type { PlayableSource, SubtitleTrack } from "../types/sources";
import type {
  InstalledAddon,
  CatalogExtra,
  CatalogGenre,
} from "../types/addon";

export interface AddonEngine {
  install(manifestUrl: string): Promise<InstalledAddon>;
  remove(manifestUrl: string): Promise<void>;
  setEnabled(manifestUrl: string, enabled: boolean): Promise<void>;
  list(): InstalledAddon[];

  getCatalog(
    type: MediaType,
    catalogId: string,
    extra?: CatalogExtra,
  ): Promise<MetaPreview[]>;
  getCatalogGenres(type: MediaType, catalogId: string): Promise<CatalogGenre[]>;
  getMeta(id: ContentId, type: MediaType): Promise<MetaDetail | null>;
  getStreams(id: ContentId, type: MediaType): Promise<PlayableSource[]>;
  getSubtitles(id: ContentId, type: MediaType): Promise<SubtitleTrack[]>;
}
