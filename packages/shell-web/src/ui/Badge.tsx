// SPDX-License-Identifier: AGPL-3.0-or-later
// Small status pill: LIVE (coral, uppercase), cached ⚡ (seafoam), or a neutral
// count chip. Tone picks the palette; the content is passed as children.

import type { CSSProperties, ReactNode } from "react";

type BadgeTone = "live" | "cached" | "neutral";

const toneStyle: Record<BadgeTone, CSSProperties> = {
  live: {
    background: "var(--coral)",
    color: "var(--bg)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 600,
  },
  cached: {
    background: "rgba(111, 217, 192, 0.16)",
    color: "var(--seafoam)",
    fontWeight: 500,
  },
  neutral: {
    background: "var(--surface-2)",
    color: "var(--sand-dim)",
    fontWeight: 500,
  },
};

export function Badge({
  tone = "neutral",
  children,
  style,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.1rem 0.5rem",
        borderRadius: "var(--r-pill)",
        fontSize: "var(--fs-caption)",
        fontFamily: "var(--font-body)",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...toneStyle[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
