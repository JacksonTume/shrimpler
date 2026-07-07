// SPDX-License-Identifier: AGPL-3.0-or-later
// Manifest URL normalization and lenient manifest validation (§6.1).
// Lenient by decision: only the fields the engine actually needs are
// required (id, name, version, resources, types); catalogs defaults to [];
// unknown fields pass through untouched.

import type {
  AddonManifest,
  CatalogDef,
  ResourceName,
  ResourceObject,
} from "../types/addon";
import type { ContentId, MediaType } from "../types/ids";

export class AddonInstallError extends Error {
  readonly manifestUrl: string;

  constructor(
    message: string,
    manifestUrl: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AddonInstallError";
    this.manifestUrl = manifestUrl;
  }
}

const RESOURCE_NAMES: readonly string[] = [
  "catalog",
  "meta",
  "stream",
  "subtitles",
];

/**
 * Trim and convert the ecosystem's stremio:// deep-link scheme to https://;
 * otherwise the URL is fetched exactly as given. Throws on non-http(s) URLs.
 */
export function normalizeManifestUrl(input: string): string {
  const trimmed = input.trim();
  const normalized = /^stremio:\/\//i.test(trimmed)
    ? trimmed.replace(/^stremio:\/\//i, "https://")
    : trimmed;
  if (!/^https?:\/\/.+/i.test(normalized)) {
    throw new AddonInstallError(
      `Not an http(s) or stremio:// URL: ${input}`,
      trimmed,
    );
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseResources(value: unknown): (ResourceName | ResourceObject)[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const resources: (ResourceName | ResourceObject)[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && RESOURCE_NAMES.includes(entry)) {
      resources.push(entry as ResourceName);
    } else if (
      isRecord(entry) &&
      typeof entry["name"] === "string" &&
      RESOURCE_NAMES.includes(entry["name"])
    ) {
      resources.push({
        name: entry["name"] as ResourceName,
        types: Array.isArray(entry["types"])
          ? entry["types"].filter(isNonEmptyString)
          : undefined,
        idPrefixes: Array.isArray(entry["idPrefixes"])
          ? entry["idPrefixes"].filter(isNonEmptyString)
          : undefined,
      });
    }
    // Anything else is silently dropped (lenient).
  }
  return resources;
}

function parseCatalogs(value: unknown): CatalogDef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const catalogs: CatalogDef[] = [];
  for (const entry of value) {
    if (
      isRecord(entry) &&
      isNonEmptyString(entry["type"]) &&
      isNonEmptyString(entry["id"])
    ) {
      catalogs.push(entry as unknown as CatalogDef);
    }
  }
  return catalogs;
}

/** Validate a fetched manifest body. Throws AddonInstallError when unusable. */
export function parseManifest(
  value: unknown,
  manifestUrl: string,
): AddonManifest {
  if (!isRecord(value)) {
    throw new AddonInstallError("Manifest is not a JSON object", manifestUrl);
  }
  for (const field of ["id", "name", "version"] as const) {
    if (!isNonEmptyString(value[field])) {
      throw new AddonInstallError(
        `Manifest is missing required field "${field}"`,
        manifestUrl,
      );
    }
  }
  const resources = parseResources(value["resources"]);
  if (resources.length === 0) {
    throw new AddonInstallError(
      "Manifest declares no usable resources",
      manifestUrl,
    );
  }
  const types = Array.isArray(value["types"])
    ? value["types"].filter(isNonEmptyString)
    : [];
  if (types.length === 0) {
    throw new AddonInstallError("Manifest declares no types", manifestUrl);
  }
  return {
    // Preserve unknown fields verbatim (lenient) …
    ...(value as object),
    // … but expose the validated shapes for the fields the engine reads.
    id: value["id"] as string,
    name: value["name"] as string,
    version: value["version"] as string,
    resources,
    types,
    idPrefixes: Array.isArray(value["idPrefixes"])
      ? value["idPrefixes"].filter(isNonEmptyString)
      : undefined,
    catalogs: parseCatalogs(value["catalogs"]),
  };
}

/**
 * The effective capability of a manifest for one resource: an object entry's
 * own types/idPrefixes narrow the manifest-level ones; a string entry
 * inherits them.
 */
function resourceCapability(
  manifest: AddonManifest,
  resource: ResourceName,
): { types: MediaType[]; idPrefixes?: string[] } | null {
  for (const entry of manifest.resources) {
    if (typeof entry === "string") {
      if (entry === resource) {
        return { types: manifest.types, idPrefixes: manifest.idPrefixes };
      }
    } else if (entry.name === resource) {
      return {
        types: entry.types ?? manifest.types,
        idPrefixes: entry.idPrefixes ?? manifest.idPrefixes,
      };
    }
  }
  return null;
}

/**
 * Can this addon serve resource+type (and, when an id is given, does an
 * idPrefix match)? No declared idPrefixes means "all ids" (§6.2).
 */
export function servesResource(
  manifest: AddonManifest,
  resource: ResourceName,
  type: MediaType,
  id?: ContentId,
): boolean {
  const capability = resourceCapability(manifest, resource);
  if (capability === null) {
    return false;
  }
  if (!capability.types.includes(type)) {
    return false;
  }
  if (
    id !== undefined &&
    capability.idPrefixes !== undefined &&
    capability.idPrefixes.length > 0 &&
    !capability.idPrefixes.some((prefix) => id.startsWith(prefix))
  ) {
    return false;
  }
  return true;
}
