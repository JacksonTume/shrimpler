// SPDX-License-Identifier: AGPL-3.0-or-later
// Public API surface of @shrimpler/shared-ui: React logic shared by both
// shells. May depend on core and React — never on a shell (§3).
export { labels } from "./labels/index";
export type { LabelKey } from "./labels/index";

export { CoreProvider, useCore } from "./context/core-context";

export { useAddonManager } from "./viewmodels/index";
export type { UseAddonManagerResult } from "./viewmodels/index";

export { useDetail } from "./viewmodels/index";
export type { UseDetailResult } from "./viewmodels/index";

export { useSearch } from "./viewmodels/index";
export type { UseSearchResult } from "./viewmodels/index";

export { useStreamPicker } from "./viewmodels/index";
export type { UseStreamPickerResult } from "./viewmodels/index";

export {
  useTmdbSettings,
  TMDB_API_KEY_STORAGE_KEY,
} from "./viewmodels/index";
export type { UseTmdbSettingsResult } from "./viewmodels/index";

export {
  useDebridSettings,
  REAL_DEBRID_TOKEN_STORAGE_KEY,
} from "./viewmodels/index";
export type { UseDebridSettingsResult } from "./viewmodels/index";
