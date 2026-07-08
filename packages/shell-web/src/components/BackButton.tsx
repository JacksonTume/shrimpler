// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared focusable Back button. Screens pair it with useBackHandler so both the
// remote Back key and an on-screen press route the same way.

import type { CSSProperties } from "react";
import { labels } from "@shrimpler/shared-ui";
import { useFocusable } from "../focus";

const focusOutline = (focused: boolean): CSSProperties => ({
  outline: focused ? "2px solid #fff" : "2px solid transparent",
});

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
      style={focusOutline(focused)}
    >
      {labels.back}
    </button>
  );
}
