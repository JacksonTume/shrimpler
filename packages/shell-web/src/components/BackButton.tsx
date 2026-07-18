// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared focusable Back button (a ghost pill with a chevron). Screens pair it
// with useBackHandler so both the remote Back key and an on-screen press route
// the same way. Lives outside ui/ to avoid a Screen ↔ Button ↔ BackButton import
// cycle; it wraps the focus seam directly.

import { labels } from "@shrimpler/shared-ui";
import { useFocusable } from "../focus";

export function BackButton({
  onBack,
  focusKey,
}: {
  onBack: () => void;
  /** Optional stable key so a screen can setFocus() to it on mount. */
  focusKey?: string;
}) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    focusKey,
    onEnterPress: onBack,
  });
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused}
      onClick={onBack}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.45rem 0.9rem",
        borderRadius: "var(--r-pill)",
        border: "1px solid var(--line-strong)",
        background: "transparent",
        color: "var(--sand)",
        fontSize: "var(--fs-small)",
        fontWeight: 500,
      }}
    >
      <span aria-hidden>‹</span>
      {labels.back}
    </button>
  );
}
