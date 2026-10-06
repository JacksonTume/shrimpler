// SPDX-License-Identifier: AGPL-3.0-or-later
// Reef tokens for the web shell. The palette and radii come from shared-ui
// (ADR-0016) and are written onto :root as CSS custom properties at startup, so
// theme.css and every inline `var(--…)` style read the shared values. Web-only
// tokens (type scale, fonts, shadows, the focus ring) stay in theme.css.

import { reefColor, reefRadius } from "@shrimpler/shared-ui";

export { reefColor as color, reefRadius as radius };

/** `surface2` → `surface-2`, `coralDeep` → `coral-deep`. */
function kebab(name: string): string {
  return name.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();
}

/** `#ff6e5a` → `255, 110, 90`, for `rgba(var(--coral-rgb), α)` tints. */
function hexToRgbTriplet(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`;
}

/** Every shared token as a CSS custom property name → value. */
export function reefCssVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(reefColor)) {
    vars[`--${kebab(name)}`] = value;
  }
  for (const [name, px] of Object.entries(reefRadius)) {
    vars[`--r-${kebab(name)}`] = `${px}px`;
  }
  vars["--coral-rgb"] = hexToRgbTriplet(reefColor.coral);
  return vars;
}

/**
 * Write the shared tokens onto the root element. Called once from main.tsx
 * before first render; index.html carries a hard-coded bg for the pre-JS paint.
 */
export function applyReefTokens(
  root: HTMLElement = document.documentElement,
): void {
  for (const [name, value] of Object.entries(reefCssVars())) {
    root.style.setProperty(name, value);
  }
}
