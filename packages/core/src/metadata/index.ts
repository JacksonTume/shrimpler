// SPDX-License-Identifier: AGPL-3.0-or-later
// TODO(Phase 1): MetadataResolver implementation (addon-meta-first, provider
// fallback, TTL-cached merge — §5.1 / ADR-0003).
export type {
  MetadataProvider,
  MetadataResolver,
  FeedKind,
  FeedOpts,
  CatalogRow,
} from "./resolver";
