// SPDX-License-Identifier: AGPL-3.0-or-later
// A focusable, full-width list row with a leading slot, a title (+ optional
// subtitle), and a trailing slot. One press target (renders a <button>), so it
// fits single-action rows: search results, category rows, episodes, stream
// candidates. Rows with several actions (installed sources) use their own
// container + Buttons instead. Pass-through props (data-*, aria-*) land on the
// button.

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { useFocusable } from "../focus";

interface ListRowProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick" | "style" | "title"
  > {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress: () => void;
  focusKey?: string;
  style?: CSSProperties;
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  focusKey,
  style,
  ...rest
}: ListRowProps) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    focusKey,
    onEnterPress: onPress,
  });
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused}
      onClick={onPress}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.85rem",
        width: "100%",
        padding: "0.7rem 0.85rem",
        borderRadius: "var(--r-md)",
        background: "var(--surface)",
        color: "var(--sand)",
        textAlign: "left",
        ...style,
      }}
      {...rest}
    >
      {leading}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block" }}>{title}</span>
        {subtitle !== undefined && (
          <span
            style={{
              display: "block",
              marginTop: "0.15rem",
              fontSize: "var(--fs-small)",
              color: "var(--sand-dim)",
            }}
          >
            {subtitle}
          </span>
        )}
      </span>
      {trailing !== undefined && (
        <span style={{ color: "var(--sand-dim)", flexShrink: 0 }}>
          {trailing}
        </span>
      )}
    </button>
  );
}
