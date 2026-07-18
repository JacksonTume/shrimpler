// SPDX-License-Identifier: AGPL-3.0-or-later
// Styled, focusable text input. Bakes in the TV wrinkle the screens repeat by
// hand: the spatial-nav engine only tracks logical focus, so on focus we also
// move real DOM focus onto the field (onFocus → ref.focus()) so keystrokes land.
// Renders an optional visible label wrapper; forwards value/type/placeholder/
// disabled/aria-label.

import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { useFocusable } from "../focus";

interface TextFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  label?: ReactNode;
  type?: "text" | "search" | "url" | "password";
  placeholder?: string;
  disabled?: boolean;
  focusKey?: string;
  "aria-label"?: string;
  style?: CSSProperties;
}

export function TextField({
  value,
  onChangeText,
  label,
  type = "text",
  placeholder,
  disabled,
  focusKey,
  style,
  ...rest
}: TextFieldProps) {
  const { ref, focused } = useFocusable<object, HTMLInputElement>({
    focusKey,
    onFocus: () => ref.current?.focus(),
  });

  const input = (
    <input
      ref={ref}
      type={type}
      value={value}
      data-focused={focused}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e: ChangeEvent<HTMLInputElement>) =>
        onChangeText(e.target.value)
      }
      aria-label={rest["aria-label"]}
      style={{
        display: "block",
        width: "100%",
        marginTop: label !== undefined ? "0.4rem" : 0,
        padding: "0.65rem 0.85rem",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--line-strong)",
        background: "var(--surface)",
        color: "var(--sand)",
        fontSize: "var(--fs-body)",
        opacity: disabled === true ? 0.55 : 1,
        ...style,
      }}
    />
  );

  if (label === undefined) {
    return input;
  }
  return (
    <label
      style={{
        display: "block",
        fontSize: "var(--fs-small)",
        color: "var(--sand-dim)",
      }}
    >
      {label}
      {input}
    </label>
  );
}
