// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §11 Phase 0 — spatial-navigation focus model for the web shell.
// This module is the seam around the engine: screens import from ../focus
// only, never from @noriginmedia/* directly, so the engine can be swapped
// without touching screens.
//
// The engine's default key map already covers browser keyboards and TV
// remotes (ArrowLeft/Up/Right/Down + Enter and their keyCodes); Back keys are
// NOT part of the engine — see ./back.ts.

import {
  destroy,
  getCurrentFocusKey,
  init,
  pause,
  resume,
  setFocus,
  updateAllLayouts,
} from "@noriginmedia/norigin-spatial-navigation";

export {
  FocusContext,
  useFocusable,
} from "@noriginmedia/norigin-spatial-navigation";
export type {
  UseFocusableConfig,
  UseFocusableResult,
  FocusableComponentLayout,
  FocusDetails,
  KeyPressDetails,
  Direction,
} from "@noriginmedia/norigin-spatial-navigation";

export { getCurrentFocusKey, setFocus, updateAllLayouts };
export { pause as pauseFocus, resume as resumeFocus };

export interface FocusEngineOptions {
  /** Console logging of focus decisions. */
  debug?: boolean;
  /** On-screen layout overlays. */
  visualDebug?: boolean;
}

let initialized = false;

/** Idempotent engine start-up; call once from the composition root (main.tsx). */
export function initFocusEngine(options: FocusEngineOptions = {}): void {
  if (initialized) {
    return;
  }
  init({
    debug: options.debug ?? false,
    visualDebug: options.visualDebug ?? false,
  });
  initialized = true;
}

/** Tear the engine down (tests only — the app never destroys it). */
export function destroyFocusEngine(): void {
  destroy();
  initialized = false;
}
