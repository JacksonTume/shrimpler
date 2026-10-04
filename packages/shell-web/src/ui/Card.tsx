// SPDX-License-Identifier: AGPL-3.0-or-later
// A bordered surface panel with an optional heading — the standard grouping
// container (source-manager sections, home-screen groups). Sits on --surface
// against the darker --bg to read as a distinct block.

import type { ReactNode } from "react";

export function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-lg)",
        padding: "1.25rem",
        marginBottom: "1.25rem",
      }}
    >
      {title !== undefined && (
        <h2
          style={{
            fontSize: "var(--fs-h2)",
            fontWeight: 700,
            marginBottom: "0.85rem",
          }}
        >
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
