// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §6.1–§6.2 — Addon manifest & resource types.

import type { MediaType } from "./ids";

export interface AddonManifest {
  id: string;
  version: string;
  name: string;
  resources: (ResourceName | ResourceObject)[];
  types: MediaType[];
  idPrefixes?: string[]; // e.g. ["tt", "kitsu"]
  catalogs: CatalogDef[];
}

export type ResourceName = "catalog" | "meta" | "stream" | "subtitles";

// NOTE: not defined in spec v0.2 — minimal shape per the Stremio protocol's
// object form of a resource declaration.
export interface ResourceObject {
  name: ResourceName;
  types?: MediaType[];
  idPrefixes?: string[];
}

export interface CatalogDef {
  type: MediaType;
  id: string;
  name?: string;
  extra?: { name: string; isRequired?: boolean; options?: string[] }[];
}

export interface InstalledAddon {
  manifestUrl: string;
  manifest: AddonManifest;
  enabled: boolean;
  addedAt: number;
}

export interface CatalogExtra {
  search?: string;
  skip?: number;
  genre?: string;
}

// A selectable category within a catalog, with how many items it holds. `name`
// doubles as the filter key passed back as CatalogExtra.genre (an empty string
// is the "uncategorized" bucket); display copy is a UI concern (neutrality).
export interface CatalogGenre {
  name: string;
  count: number;
}
