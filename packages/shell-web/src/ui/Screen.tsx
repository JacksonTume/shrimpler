// SPDX-License-Identifier: AGPL-3.0-or-later
// Page scaffold. Owns the screen-level spatial-nav focus container (ADR-0010) +
// FocusContext, a padded max-width body, and a header row. With `onBack` it shows
// a focusable BackButton + title; otherwise a Wordmark. A `hero` overrides the
// header entirely (the home screen). Screens keep their own useBackHandler +
// setFocus(childKey) seed — the back key and focus seeding stay screen-owned.

import type { ReactNode } from "react";
import { FocusContext, useFocusable } from "../focus";
import { BackButton } from "../components/BackButton";
import { Wordmark } from "./Wordmark";

interface ScreenProps {
  focusKey: string;
  title?: string;
  onBack?: () => void;
  backFocusKey?: string;
  headerRight?: ReactNode;
  /** Replaces the default header (used by the home hero). */
  hero?: ReactNode;
  children: ReactNode;
}

export function Screen({
  focusKey,
  title,
  onBack,
  backFocusKey,
  headerRight,
  hero,
  children,
}: ScreenProps) {
  const { ref, focusKey: fk } = useFocusable<object, HTMLElement>({
    focusKey,
    saveLastFocusedChild: true,
  });
  return (
    <FocusContext.Provider value={fk}>
      <main
        ref={ref}
        style={{
          minHeight: "100%",
          maxWidth: 1200,
          margin: "0 auto",
          padding: "1.25rem",
        }}
      >
        {hero !== undefined ? (
          hero
        ) : (
          <header
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              marginBottom: "1.5rem",
            }}
          >
            {onBack !== undefined ? (
              <BackButton onBack={onBack} focusKey={backFocusKey} />
            ) : (
              <Wordmark />
            )}
            {title !== undefined && (
              <h1 style={{ fontSize: "var(--fs-h1)", fontWeight: 700 }}>
                {title}
              </h1>
            )}
            {headerRight !== undefined && (
              <span style={{ marginLeft: "auto" }}>{headerRight}</span>
            )}
          </header>
        )}
        {children}
      </main>
    </FocusContext.Provider>
  );
}
