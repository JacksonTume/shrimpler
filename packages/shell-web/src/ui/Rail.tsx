// SPDX-License-Identifier: AGPL-3.0-or-later
// A titled horizontal scroller (the continue-watching row) and a responsive
// poster grid (catalog). Both are thin layout wrappers; cards live in PosterCard.

import type { CSSProperties, ReactNode } from "react";

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "var(--fs-h2)",
        fontWeight: 700,
        margin: "0 0 0.75rem",
      }}
    >
      {children}
    </h2>
  );
}

export function Rail({
  title,
  children,
  style,
}: {
  title?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section style={{ marginBottom: "2rem", ...style }}>
      {title !== undefined && <SectionHeading>{title}</SectionHeading>}
      <div
        style={{
          display: "flex",
          gap: "0.85rem",
          overflowX: "auto",
          paddingBottom: "0.5rem",
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function PosterGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.85rem",
        marginTop: "1rem",
      }}
    >
      {children}
    </div>
  );
}

export { SectionHeading };
