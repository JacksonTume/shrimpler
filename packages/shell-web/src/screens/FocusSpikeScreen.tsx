// SPDX-License-Identifier: AGPL-3.0-or-later
// DEV-ONLY spike screen (§11 Phase 0): validates the spatial-nav focus model
// before real screens are built. Proves: menu↔content movement, tile rows
// with per-row focus memory, Enter selection, Back stack (content → menu →
// "exit"). Strings here are developer placeholders, not user-facing product
// copy, so they intentionally bypass the labels module.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FocusContext, setFocus, useBackHandler, useFocusable } from "../focus";

const MENU_FOCUS_KEY = "MENU";
const MENU_ITEMS = 5;
const ROWS = 5;
const TILES_PER_ROW = 8;

interface SelectProps {
  onSelect: (label: string) => void;
}

function MenuItem({ index, onSelect }: SelectProps & { index: number }) {
  const label = `Menu ${index + 1}`;
  const { ref, focused } = useFocusable<object, HTMLDivElement>({
    onEnterPress: () => onSelect(label),
  });
  return (
    <div
      ref={ref}
      data-menu-item={index}
      data-focused={focused}
      style={{
        padding: "0.6rem 1rem",
        borderRadius: 6,
        background: focused ? "#e8e8e8" : "transparent",
        color: focused ? "#111" : "#bbb",
        outline: focused ? "2px solid #fff" : "2px solid transparent",
      }}
    >
      {label}
    </div>
  );
}

function Menu({
  onSelect,
  onHasFocusedChildChange,
}: SelectProps & { onHasFocusedChildChange: (hasFocus: boolean) => void }) {
  const { ref, focusKey, hasFocusedChild } = useFocusable<object, HTMLElement>({
    focusKey: MENU_FOCUS_KEY,
    saveLastFocusedChild: true,
    trackChildren: true,
    // Focus may only leave the menu rightwards (into the content).
    isFocusBoundary: true,
    focusBoundaryDirections: ["left", "up", "down"],
  });

  useEffect(() => {
    onHasFocusedChildChange(hasFocusedChild);
  }, [hasFocusedChild, onHasFocusedChildChange]);

  return (
    <FocusContext.Provider value={focusKey}>
      <nav
        ref={ref}
        data-menu
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem",
          padding: "1rem",
          minWidth: "10rem",
          borderRight: "1px solid #333",
        }}
      >
        {Array.from({ length: MENU_ITEMS }, (_, i) => (
          <MenuItem key={i} index={i} onSelect={onSelect} />
        ))}
      </nav>
    </FocusContext.Provider>
  );
}

function Tile({
  row,
  col,
  onSelect,
}: SelectProps & { row: number; col: number }) {
  const label = `Tile ${row + 1}-${col + 1}`;
  const { ref, focused } = useFocusable<object, HTMLDivElement>({
    onEnterPress: () => onSelect(label),
    onFocus: () => {
      const node = ref.current;
      // jsdom has no scrollIntoView; TV runtimes do.
      if (node && typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    },
  });
  return (
    <div
      ref={ref}
      data-tile={`${row}-${col}`}
      data-focused={focused}
      style={{
        flex: "0 0 auto",
        width: "9rem",
        height: "5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        background: focused ? "#2f6fed" : "#222",
        color: focused ? "#fff" : "#888",
        outline: focused ? "3px solid #fff" : "3px solid transparent",
        transform: focused ? "scale(1.05)" : "scale(1)",
      }}
    >
      {label}
    </div>
  );
}

function Row({ row, onSelect }: SelectProps & { row: number }) {
  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({
    focusKey: `ROW-${row}`,
    saveLastFocusedChild: true,
  });
  return (
    <FocusContext.Provider value={focusKey}>
      <section>
        <h3 style={{ color: "#666", margin: "0.5rem 0" }}>Row {row + 1}</h3>
        <div
          ref={ref}
          data-row={row}
          style={{
            display: "flex",
            gap: "0.75rem",
            overflowX: "auto",
            padding: "0.25rem",
          }}
        >
          {Array.from({ length: TILES_PER_ROW }, (_, col) => (
            <Tile key={col} row={row} col={col} onSelect={onSelect} />
          ))}
        </div>
      </section>
    </FocusContext.Provider>
  );
}

const screenStyle: CSSProperties = {
  display: "flex",
  minHeight: "100vh",
  background: "#151515",
  fontFamily: "system-ui, sans-serif",
};

export function FocusSpikeScreen() {
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  const [backStatus, setBackStatus] = useState<string | null>(null);
  const menuHasFocusRef = useRef(false);

  const onHasFocusedChildChange = useCallback((hasFocus: boolean) => {
    menuHasFocusRef.current = hasFocus;
  }, []);

  // Back pattern: content → menu; menu → "exit" (logged, since a browser/PWA
  // can't close itself — real shells map this to app exit / history back).
  const onBack = useCallback(() => {
    if (menuHasFocusRef.current) {
      setBackStatus("Back pressed in menu — exit requested");
    } else {
      setBackStatus("Back pressed in content — focus returned to menu");
      void setFocus(MENU_FOCUS_KEY);
    }
  }, []);
  useBackHandler(onBack);

  useEffect(() => {
    void setFocus("ROW-0");
  }, []);

  return (
    <div style={screenStyle}>
      <Menu
        onSelect={setLastSelected}
        onHasFocusedChildChange={onHasFocusedChildChange}
      />
      <main style={{ flex: 1, padding: "1rem", overflowY: "auto" }}>
        <p data-status style={{ color: "#aaa" }}>
          Arrows move · Enter selects · Esc/Backspace goes back —{" "}
          <span data-last-selected>
            {lastSelected === null
              ? "nothing selected"
              : `selected: ${lastSelected}`}
          </span>
          {backStatus === null ? null : (
            <span data-back-status> · {backStatus}</span>
          )}
        </p>
        {Array.from({ length: ROWS }, (_, row) => (
          <Row key={row} row={row} onSelect={setLastSelected} />
        ))}
      </main>
    </div>
  );
}
