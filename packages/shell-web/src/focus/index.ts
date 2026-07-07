// SPDX-License-Identifier: AGPL-3.0-or-later
// Public focus API for the web shell. Screens import from here only.

export {
  FocusContext,
  useFocusable,
  initFocusEngine,
  destroyFocusEngine,
  setFocus,
  getCurrentFocusKey,
  updateAllLayouts,
  pauseFocus,
  resumeFocus,
} from "./engine";
export type {
  FocusEngineOptions,
  UseFocusableConfig,
  UseFocusableResult,
  FocusableComponentLayout,
  FocusDetails,
  KeyPressDetails,
  Direction,
} from "./engine";

export {
  pushBackHandler,
  handleBack,
  initBackHandling,
  useBackHandler,
} from "./back";
export type { BackHandler } from "./back";
