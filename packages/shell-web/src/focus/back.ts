// SPDX-License-Identifier: AGPL-3.0-or-later
// Back-key handling (browser Escape/Backspace, webOS Back keyCode 461, Tizen
// Return keyCode 10009) as a stack of handlers: the most recently registered
// handler consumes the press. Screens/overlays push a handler on mount and
// dispose it on unmount, giving modal-style back behaviour without a router.

import { useEffect } from "react";

export type BackHandler = () => void;

const stack: BackHandler[] = [];

/** Register a back handler; returns a disposer. Last registered wins. */
export function pushBackHandler(handler: BackHandler): () => void {
  stack.push(handler);
  return () => {
    const index = stack.lastIndexOf(handler);
    if (index !== -1) {
      stack.splice(index, 1);
    }
  };
}

/** Invoke the top handler. Returns false when no handler is registered. */
export function handleBack(): boolean {
  const top = stack[stack.length - 1];
  if (top === undefined) {
    return false;
  }
  top();
  return true;
}

const BACK_KEYS = new Set(["Escape", "Backspace"]);
// TV remotes report Back as legacy keyCodes on old runtimes.
const BACK_KEY_CODES = new Set([461 /* webOS */, 10009 /* Tizen */]);

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** Wire the window keydown listener; call once from main.tsx. Returns a disposer. */
export function initBackHandling(target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!BACK_KEYS.has(event.key) && !BACK_KEY_CODES.has(event.keyCode)) {
      return;
    }
    // Backspace must keep working inside text fields.
    if (event.key === "Backspace" && isTextEntry(event.target)) {
      return;
    }
    if (handleBack()) {
      event.preventDefault();
    }
  };
  target.addEventListener("keydown", onKeyDown);
  return () => {
    target.removeEventListener("keydown", onKeyDown);
  };
}

/**
 * React binding: register a back handler for the lifetime of the component.
 * Pass a stable (useCallback-wrapped) handler — a new identity re-registers,
 * which moves it to the top of the stack.
 */
export function useBackHandler(handler: BackHandler, enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    return pushBackHandler(handler);
  }, [handler, enabled]);
}
