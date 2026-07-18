// SPDX-License-Identifier: AGPL-3.0-or-later
// Reef token values for the rare JS-side need (most styling references the CSS
// custom properties in theme.css via `var(--…)`). Keep in sync with :root there.

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
  danger: "#ff9b86",
} as const;

export const radius = {
  sm: "8px",
  md: "12px",
  lg: "18px",
  pill: "999px",
} as const;
