// SPDX-License-Identifier: AGPL-3.0-or-later
// The wordmark: lowercase "shrimpler" in the display face with a coral tilde
// standing in for a wave — a quiet nod to the brand (tuna → shrimp → simpler)
// without a literal mascot. `labels.appName` is the accessible source of truth;
// the lowercase rendering is presentational.

import { labels } from "@shrimpler/shared-ui";

export function Wordmark({ size = "var(--fs-h1)" }: { size?: string }) {
  return (
    <span
      aria-label={labels.appName}
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "-0.02em",
        lineHeight: 1,
        color: "var(--sand)",
      }}
    >
      {labels.appName.toLowerCase()}
      <span style={{ color: "var(--coral)" }}>~</span>
    </span>
  );
}
