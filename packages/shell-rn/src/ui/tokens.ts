// SPDX-License-Identifier: AGPL-3.0-or-later
// Reef tokens for the RN shell — the mobile counterpart of the web shell's
// ui/tokens.ts + theme.css. React Native has no CSS custom properties, so the
// values live here as plain JS and every primitive imports them; keep the
// palette in sync with shell-web/src/ui/theme.css (:root).
//
// Two deliberate mobile deviations from the web foundation:
//   * No gradients — the coral "primary" fill is flat (`coral`) rather than the
//     web's coral→coral-deep gradient, so no extra native dependency is needed.
//   * No bundled display/body fonts — web loads Space Grotesk + Inter via
//     @fontsource; RN would need expo-font plus the font assets, so the shell
//     rides the platform UI font for now and only mirrors the type *scale*.
// The type scale is one step down from web at the headline sizes: a phone
// viewport is ~a third the width the web values were picked for.

export const color = {
  bg: "#0e1a1e",
  surface: "#14262b",
  surface2: "#1b333a",
  coral: "#ff6e5a",
  coralDeep: "#e8503b",
  seafoam: "#6fd9c0",
  sand: "#f3ebe0",
  sandDim: "rgba(243, 235, 224, 0.66)",
  sandFaint: "rgba(243, 235, 224, 0.4)",
  line: "rgba(243, 235, 224, 0.1)",
  lineStrong: "rgba(243, 235, 224, 0.18)",
  danger: "#ff9b86",
  /** Full-bleed video letterbox + the modal scrim. */
  black: "#000000",
  scrim: "rgba(4, 10, 12, 0.72)",
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

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
