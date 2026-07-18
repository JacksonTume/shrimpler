// SPDX-License-Identifier: AGPL-3.0-or-later
// One-line status / error / muted message. Wraps a <p> so callers keep their
// ARIA role (alert for errors, status for progress) — the roles screen tests
// assert on. Tone only picks the color.

import type { CSSProperties, ReactNode } from "react";

type CalloutTone = "error" | "status" | "muted";

const toneColor: Record<CalloutTone, string> = {
  error: "var(--danger)",
  status: "var(--sand-dim)",
  muted: "var(--sand-dim)",
};

export function Callout({
  tone = "status",
  role,
  children,
  style,
}: {
  tone?: CalloutTone;
  role?: "alert" | "status";
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <p
      role={role}
      style={{
        margin: "0.75rem 0",
        color: toneColor[tone],
        fontSize: "var(--fs-small)",
        ...style,
      }}
    >
      {children}
    </p>
  );
}
