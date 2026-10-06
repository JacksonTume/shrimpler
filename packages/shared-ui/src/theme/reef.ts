// SPDX-License-Identifier: AGPL-3.0-or-later
// Reef design tokens shared by both shells — the single source of truth for the
// palette and corner radii (ADR-0016). Plain values only, no React: the web
// shell writes them onto :root as CSS custom properties at startup
// (shell-web/src/ui/tokens.ts), and the RN shell imports them directly into
// StyleSheets (shell-rn/src/ui/tokens.ts).
//
// Type scale, font families, shadows and the focus ring stay per shell: RN
// deliberately runs a smaller type scale and the platform font, and has no
// box-shadow or spatial-nav focus to style.

/** Reef palette, dark-first. Names are semantic so a later theme can remap them. */
export const reefColor = {
  bg: "#0e1a1e",
  surface: "#14262b",
  surface2: "#1b333a",
  coral: "#ff6e5a",
  coralDeep: "#e8503b",
  seafoam: "#6fd9c0",
  /** Seafoam wash behind the "cached" badge. */
  seafoamTint: "rgba(111, 217, 192, 0.16)",
  sand: "#f3ebe0",
  sandDim: "rgba(243, 235, 224, 0.66)",
  sandFaint: "rgba(243, 235, 224, 0.4)",
  line: "rgba(243, 235, 224, 0.1)",
  lineStrong: "rgba(243, 235, 224, 0.18)",
  danger: "#ff9b86",
  /** Full-bleed video letterbox. */
  black: "#000000",
  /** Modal backdrop. */
  scrim: "rgba(4, 10, 12, 0.72)",
} as const;

/** Corner radii in px (RN takes the numbers; the web appends "px"). */
export const reefRadius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export type ReefColor = keyof typeof reefColor;
export type ReefRadius = keyof typeof reefRadius;
