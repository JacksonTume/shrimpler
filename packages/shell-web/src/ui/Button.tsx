// SPDX-License-Identifier: AGPL-3.0-or-later
// The focusable button primitive. Wraps the spatial-nav seam (useFocusable +
// data-focused, ADR-0010) so screens stop re-implementing focus + focus rings by
// hand. `onPress` fires for both a click and the remote Enter key. Extra DOM
// props (type, disabled, aria-*, data-*) pass through to the <button>, so the
// global [data-focused] rule draws the coral ring.

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { useFocusable } from "../focus";

type Variant = "primary" | "ghost" | "subtle";
type Size = "md" | "sm";

const base: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.4rem",
  borderRadius: "var(--r-pill)",
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  textAlign: "center",
  transition: "background 120ms ease, border-color 120ms ease",
};

const variantStyle: Record<Variant, CSSProperties> = {
  primary: {
    background: "linear-gradient(180deg, var(--coral), var(--coral-deep))",
    color: "var(--bg)",
  },
  ghost: {
    background: "transparent",
    border: "1px solid var(--line-strong)",
    color: "var(--sand)",
  },
  subtle: {
    background: "var(--surface)",
    color: "var(--sand)",
  },
};

const sizeStyle: Record<Size, CSSProperties> = {
  md: { padding: "0.6rem 1.15rem", fontSize: "var(--fs-body)" },
  sm: { padding: "0.35rem 0.8rem", fontSize: "var(--fs-small)" },
};

interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "style"
> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  onPress?: () => void;
  focusKey?: string;
  saveLastFocusedChild?: boolean;
  fullWidth?: boolean;
  style?: CSSProperties;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  onPress,
  focusKey,
  saveLastFocusedChild,
  fullWidth,
  disabled,
  type = "button",
  style,
  ...rest
}: ButtonProps) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    focusKey,
    saveLastFocusedChild,
    onEnterPress: () => {
      if (disabled !== true && onPress !== undefined) {
        onPress();
      }
    },
  });
  return (
    <button
      ref={ref}
      type={type}
      data-focused={focused}
      disabled={disabled}
      onClick={onPress}
      style={{
        ...base,
        ...variantStyle[variant],
        ...sizeStyle[size],
        ...(fullWidth === true ? { width: "100%" } : {}),
        ...(disabled === true ? { opacity: 0.45, cursor: "default" } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
