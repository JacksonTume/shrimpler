// SPDX-License-Identifier: AGPL-3.0-or-later
// Internal addon (ADR-0006): an in-process source that emits the same
// catalog/meta/stream shapes as an HTTP addon, so discovery/search/playback
// reuse it for free. It carries a real AddonManifest, so every capability gate
// the engine already has (servesResource, the catalogs filter) works unchanged;
// only *dispatch* differs — an internal addon answers from memory instead of an
// HTTP resource-client. Provided to createAddonEngine at construction (like the
// metadata resolver's providers): not persisted, not returned by list().

import type { ContentId, MediaType } from "../types/ids";
import type { MetaDetail, MetaPreview } from "../types/meta";
import type { PlayableSource, SubtitleTrack } from "../types/sources";
import type { AddonManifest } from "../types/addon";
import type { CatalogExtra, CatalogGenre } from "../types/addon";

export interface InternalAddon {
  /** A manifest-shaped capability descriptor (id, types, catalogs, idPrefixes). */
  readonly manifest: AddonManifest;
  getCatalog(
    type: MediaType,
    catalogId: string,
    extra?: CatalogExtra,
  ): Promise<MetaPreview[]>;
  /** The catalog's categories (with counts) for drill-down browsing. */
  getCatalogGenres(type: MediaType, catalogId: string): Promise<CatalogGenre[]>;
  getMeta(id: ContentId, type: MediaType): Promise<MetaDetail | null>;
  getStreams(id: ContentId, type: MediaType): Promise<PlayableSource[]>;
  getSubtitles(id: ContentId, type: MediaType): Promise<SubtitleTrack[]>;
}
