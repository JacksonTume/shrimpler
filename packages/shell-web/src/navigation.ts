// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared navigation types for the web shell's lightweight state-based routing
// (see App.tsx). Kept in its own module so screens and App can both import it
// without a circular dependency.

export type Screen = "home" | "addons";

export interface NavigationProps {
  onNavigate: (screen: Screen) => void;
}
