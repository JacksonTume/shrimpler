// SPDX-License-Identifier: AGPL-3.0-or-later
// Public API surface of @shrimpler/shared-ui: React logic shared by both
// shells. May depend on core and React — never on a shell (§3).
export { labels } from "./labels/index";
export type { LabelKey } from "./labels/index";

export { CoreProvider, useCore } from "./context/core-context";

export { useAddonManager } from "./viewmodels/index";
export type { UseAddonManagerResult } from "./viewmodels/index";
