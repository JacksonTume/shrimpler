// SPDX-License-Identifier: AGPL-3.0-or-later
// Reef tokens for the RN shell — the mobile counterpart of the web shell's
// ui/tokens.ts + theme.css. The palette and radii are shared-ui's Reef tokens
// (ADR-0016), re-exported under the names every primitive already imports; the
// type scale, spacing and press/disabled opacities below are RN-only.
//
// Two interim mobile deviations from the web foundation (ADR-0016):
//   * No gradients — the coral "primary" fill is flat (`coral`) rather than the
//     web's coral→coral-deep gradient, so no extra native dependency is needed.
//   * No bundled display/body fonts — web loads Space Grotesk + Inter via
//     @fontsource; RN would need expo-font plus the font assets, so the shell
//     rides the platform UI font for now and only mirrors the type *scale*.
// The type scale is one step down from web at the headline sizes: a phone
// viewport is ~a third the width the web values were picked for.

export { reefColor as color, reefRadius as radius } from "@shrimpler/shared-ui";

export const fontSize = {
  display: 34,
  h1: 26,
  h2: 19,
  body: 16,
  small: 14,
  caption: 12,
} as const;

/** Spacing steps — the 4px rhythm the web shell's rem values land on. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Opacity applied to a pressed Pressable — RN's stand-in for :hover/:active. */
export const PRESSED_OPACITY = 0.72;
/** Opacity applied to a disabled control (matches the web's 0.45). */
export const DISABLED_OPACITY = 0.45;
