// SPDX-License-Identifier: AGPL-3.0-or-later
// Empty-by-default invitation (§9.1). A calm panel with a title, a hint, and an
// optional action slot — an invitation to add a source, not an apology.

import type { ReactNode } from "react";

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--r-lg)",
        background: "var(--surface)",
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        alignItems: "flex-start",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-h2)",
          fontWeight: 700,
        }}
      >
        {title}
      </span>
      {hint !== undefined && (
        <span style={{ color: "var(--sand-dim)" }}>{hint}</span>
      )}
      {action !== undefined && (
        <div style={{ marginTop: "0.5rem" }}>{action}</div>
      )}
    </div>
  );
}
