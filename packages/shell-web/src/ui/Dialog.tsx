// SPDX-License-Identifier: AGPL-3.0-or-later
// Modal overlay scaffold (the stream picker). Owns its own FocusContext and
// pushes a back handler so the remote Back key closes the dialog, not the screen
// beneath (focus/back stack, ADR-0010). Renders a scrim + centered sheet with a
// header (focusable Close + title). Keeps role="dialog" + aria-label for tests.

import { useEffect } from "react";
import type { ReactNode } from "react";
import { labels } from "@shrimpler/shared-ui";
import { FocusContext, setFocus, useBackHandler, useFocusable } from "../focus";
import { Button } from "./Button";

interface DialogProps {
  title: string;
  onClose: () => void;
  dialogFocusKey: string;
  closeFocusKey: string;
  children: ReactNode;
}

export function Dialog({
  title,
  onClose,
  dialogFocusKey,
  closeFocusKey,
  children,
}: DialogProps) {
  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({
    focusKey: dialogFocusKey,
    saveLastFocusedChild: true,
  });

  useBackHandler(onClose);
  useEffect(() => {
    void setFocus(closeFocusKey);
  }, [closeFocusKey]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 30,
          background: "rgba(4, 10, 12, 0.72)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div
          role="dialog"
          aria-label={title}
          ref={ref}
          style={{
            width: "min(560px, 100%)",
            maxHeight: "82vh",
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-lg)",
            padding: "1.25rem",
          }}
        >
          <header
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <Button variant="ghost" size="sm" focusKey={closeFocusKey} onPress={onClose}>
              {`‹ ${labels.back}`}
            </Button>
            <h2 style={{ fontSize: "var(--fs-h2)", fontWeight: 700 }}>{title}</h2>
          </header>
          {children}
        </div>
      </div>
    </FocusContext.Provider>
  );
}
