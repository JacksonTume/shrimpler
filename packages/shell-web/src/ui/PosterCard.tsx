// SPDX-License-Identifier: AGPL-3.0-or-later
// Focusable poster tile — the vertical card used by the continue-watching rail
// and the catalog grid. Renders as a <button> (its accessible name is the title,
// which the screen tests select on). Optional tide progress, a corner badge, and
// a footer slot (the EPG now/next strip). Pass-through props (data-item/
// data-result, aria-*) land on the button so the global focus ring applies.

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { useFocusable } from "../focus";
import { TideBar } from "./TideBar";

interface PosterCardProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick" | "style" | "title"
  > {
  title: ReactNode;
  poster?: string;
  posterShape?: "poster" | "square";
  /** 0..1 → a tide progress bar under the poster (continue-watching). */
  progress?: number;
  /** Corner overlay, e.g. a LIVE badge. */
  badge?: ReactNode;
  /** Below the title, e.g. the EPG now/next strip. */
  footer?: ReactNode;
  onPress: () => void;
  focusKey?: string;
  width?: number;
  style?: CSSProperties;
}

export function PosterCard({
  title,
  poster,
  posterShape = "poster",
  progress,
  badge,
  footer,
  onPress,
  focusKey,
  width = 150,
  style,
  ...rest
}: PosterCardProps) {
  const { ref, focused } = useFocusable<object, HTMLButtonElement>({
    focusKey,
    onEnterPress: onPress,
  });
  const square = posterShape === "square";
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused}
      onClick={onPress}
      style={{
        width,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        padding: "0.5rem",
        borderRadius: "var(--r-md)",
        background: "var(--surface)",
        color: "var(--sand)",
        textAlign: "left",
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          aspectRatio: square ? "1 / 1" : "2 / 3",
          borderRadius: "var(--r-sm)",
          overflow: "hidden",
          background:
            "linear-gradient(160deg, var(--surface-2), var(--surface))",
        }}
      >
        {poster !== undefined && (
          <img
            src={poster}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: square ? "contain" : "cover",
            }}
          />
        )}
        {badge !== undefined && (
          <span style={{ position: "absolute", top: 6, left: 6 }}>{badge}</span>
        )}
      </span>
      <span
        style={{
          display: "block",
          fontSize: "var(--fs-small)",
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>
      {progress !== undefined && <TideBar value={progress} crest={false} />}
      {footer}
    </button>
  );
}
