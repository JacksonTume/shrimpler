// SPDX-License-Identifier: AGPL-3.0-or-later
// The Reef signature: a coral "tide" progress fill reused across the app —
// continue-watching cards, the EPG now-bar, the player seek readout. A
// coral→coral-deep gradient with a brighter crest at the leading edge; the crest
// shimmers slowly (calmed under prefers-reduced-motion via .reef-tide-crest).

import type { CSSProperties } from "react";

interface TideBarProps {
  /** Progress in [0, 1]. */
  value: number;
  /** Track thickness in px. */
  height?: number;
  /** Whether the leading-edge crest shimmers (off for tiny inline bars). */
  crest?: boolean;
  style?: CSSProperties;
}

export function TideBar({
  value,
  height = 4,
  crest = true,
  style,
}: TideBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        display: "block",
        height,
        borderRadius: "var(--r-pill)",
        background: "var(--surface-2)",
        overflow: "hidden",
        ...style,
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          width: `${pct}%`,
          borderRadius: "var(--r-pill)",
          background: "linear-gradient(90deg, var(--coral-deep), var(--coral))",
        }}
      />
      {crest && pct > 0 && pct < 100 && (
        <span
          className="reef-tide-crest"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `calc(${pct}% - 2px)`,
            width: 2,
            background: "var(--sand)",
          }}
        />
      )}
    </span>
  );
}
