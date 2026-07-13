// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §3 — view-models: React hooks that call @shrimpler/core and return
// state + handlers, shared by both shells. Must stay shell-agnostic. The
// state-management contract (§13.4) is settled: plain React state (useState/
// useCallback), the Core reached via useCore(), no external store.
export { useAddonManager } from "./use-addon-manager";
export type { UseAddonManagerResult } from "./use-addon-manager";

export { useCatalog } from "./use-catalog";
export type { UseCatalogResult } from "./use-catalog";

export { useCatalogCategories } from "./use-catalog-categories";
export type {
  UseCatalogCategoriesResult,
  CatalogCategory,
} from "./use-catalog-categories";

export { useCatalogPage } from "./use-catalog-page";
export type { UseCatalogPageResult } from "./use-catalog-page";

export { useIptvPlaylists } from "./use-iptv-playlists";
export type { UseIptvPlaylistsResult } from "./use-iptv-playlists";

export { useIptvXtream } from "./use-iptv-xtream";
export type { UseIptvXtreamResult } from "./use-iptv-xtream";

export { useIptvRefresh } from "./use-iptv-refresh";
export type { UseIptvRefreshResult } from "./use-iptv-refresh";

export { useDetail } from "./use-detail";
export type { UseDetailResult } from "./use-detail";

export { useSearch } from "./use-search";
export type { UseSearchResult } from "./use-search";

export { useStreamPicker } from "./use-stream-picker";
export type { UseStreamPickerResult } from "./use-stream-picker";

export { useWatchProgress } from "./use-watch-progress";
export type {
  UseWatchProgressResult,
  WatchProgressTarget,
} from "./use-watch-progress";

export { useContinueWatching } from "./use-continue-watching";
export type { UseContinueWatchingResult } from "./use-continue-watching";

export { useTmdbSettings, TMDB_API_KEY_STORAGE_KEY } from "./use-tmdb-settings";
export type { UseTmdbSettingsResult } from "./use-tmdb-settings";

export {
  useDebridSettings,
  REAL_DEBRID_TOKEN_STORAGE_KEY,
} from "./use-debrid-settings";
export type { UseDebridSettingsResult } from "./use-debrid-settings";
