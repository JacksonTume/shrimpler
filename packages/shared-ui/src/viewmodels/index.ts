// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §3 — view-models: React hooks that call @shrimpler/core and return
// state + handlers, shared by both shells. Must stay shell-agnostic. The
// state-management contract (§13.4) is settled: plain React state (useState/
// useCallback), the Core reached via useCore(), no external store.
// TODO(Phase 1): useCatalog, useDetail, useStreamPicker.
export { useAddonManager } from "./use-addon-manager";
export type { UseAddonManagerResult } from "./use-addon-manager";
