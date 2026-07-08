// SPDX-License-Identifier: AGPL-3.0-or-later
// MetadataResolver (addon-meta-first, provider fallback, TTL-cached merge —
// §5.1 / ADR-0003) and the ContentId parser it pivots on.
export type {
  MetadataProvider,
  MetadataResolver,
  FeedKind,
  FeedOpts,
  CatalogRow,
} from "./resolver";
export { parseId } from "./parse-id";
export {
  createMetadataResolver,
  DEFAULT_METADATA_TTLS,
} from "./create-resolver";
export type {
  MetadataResolverDeps,
  MetadataResolverTtls,
} from "./create-resolver";
