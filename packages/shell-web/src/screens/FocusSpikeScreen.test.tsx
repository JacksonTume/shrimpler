// SPDX-License-Identifier: AGPL-3.0-or-later
// Integration test for the focus spike: drives the real spatial-nav engine
// with window key events. jsdom performs no layout (all element metrics are
// 0), so each focusable gets synthetic offset geometry matching the screen's
// visual arrangement before navigation starts.

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  destroyFocusEngine,
  initBackHandling,
  initFocusEngine,
  updateAllLayouts,
} from "../focus";
import { FocusSpikeScreen } from "./FocusSpikeScreen";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function setMetrics(element: Element, rect: Rect): void {
  Object.defineProperties(element, {
    offsetLeft: { value: rect.left, configurable: true },
    offsetTop: { value: rect.top, configurable: true },
    offsetWidth: { value: rect.width, configurable: true },
    offsetHeight: { value: rect.height, configurable: true },
    offsetParent: { value: null, configurable: true },
  });
}

/**
 * Menu column at x=0; tile grid starts at x=240; ~160x120 cells.
 * The engine caches layouts measured at mount (before these patches) and
 * treats them as fresh for 16ms, so re-measure everything afterwards.
 */
async function layoutScreen(container: HTMLElement): Promise<void> {
  const menu = container.querySelector("[data-menu]");
  if (menu) {
    setMetrics(menu, { left: 0, top: 0, width: 200, height: 600 });
  }
  for (const el of container.querySelectorAll("[data-row]")) {
    const row = Number((el as HTMLElement).dataset["row"]);
    setMetrics(el, { left: 240, top: 120 * row, width: 160 * 8, height: 120 });
  }
  for (const el of container.querySelectorAll("[data-menu-item]")) {
    const i = Number((el as HTMLElement).dataset["menuItem"]);
    setMetrics(el, { left: 0, top: 40 * i, width: 160, height: 32 });
  }
  for (const el of container.querySelectorAll("[data-tile]")) {
    const [row = 0, col = 0] = ((el as HTMLElement).dataset["tile"] ?? "")
      .split("-")
      .map(Number);
    setMetrics(el, {
      left: 240 + 160 * col,
      top: 120 * row,
      width: 144,
      height: 80,
    });
  }
  await act(async () => {
    await updateAllLayouts();
  });
}

async function pressKey(key: string, keyCode?: number): Promise<void> {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, keyCode } as KeyboardEventInit),
    );
    window.dispatchEvent(
      new KeyboardEvent("keyup", { key, keyCode } as KeyboardEventInit),
    );
  });
}

function focusedIn(container: HTMLElement): string {
  const focused = container.querySelector('[data-focused="true"]');
  return (
    (focused as HTMLElement | null)?.dataset["tile"] ??
    (focused as HTMLElement | null)?.dataset["menuItem"] ??
    "none"
  );
}

describe("FocusSpikeScreen (spatial navigation spike)", () => {
  let disposeBack: () => void;

  beforeEach(() => {
    initFocusEngine();
    disposeBack = initBackHandling();
  });

  afterEach(() => {
    cleanup();
    disposeBack();
    destroyFocusEngine();
  });

  it("navigates tiles, selects with Enter, and backs out to the menu", async () => {
    const { container } = render(<FocusSpikeScreen />);
    await layoutScreen(container);

    // Initial focus lands on the first tile of the first row.
    await waitFor(() => expect(focusedIn(container)).toBe("0-0"));

    await pressKey("ArrowRight", 39);
    await waitFor(() => expect(focusedIn(container)).toBe("0-1"));

    // Entering a row with no focus history lands on its origin-closest tile.
    await pressKey("ArrowDown", 40);
    await waitFor(() => expect(focusedIn(container)).toBe("1-0"));

    await pressKey("Enter", 13);
    await waitFor(() =>
      expect(
        container.querySelector("[data-last-selected]")?.textContent,
      ).toContain("Tile 2-1"),
    );

    // Back from content returns focus to the menu…
    await pressKey("Escape");
    await waitFor(() => expect(focusedIn(container)).toBe("0"));
    expect(
      container.querySelector("[data-back-status]")?.textContent,
    ).toContain("focus returned to menu");

    // …and Back from the menu requests exit.
    await pressKey("Escape");
    await waitFor(() =>
      expect(
        container.querySelector("[data-back-status]")?.textContent,
      ).toContain("exit requested"),
    );
  });

  it("remembers the focused tile per row when leaving and re-entering", async () => {
    const { container } = render(<FocusSpikeScreen />);
    await layoutScreen(container);

    await waitFor(() => expect(focusedIn(container)).toBe("0-0"));

    // Walk right twice in row 0, drop to row 1 (lands on its origin-closest
    // tile), then return to row 0: it must restore its last focused tile 0-2.
    await pressKey("ArrowRight", 39);
    await pressKey("ArrowRight", 39);
    await waitFor(() => expect(focusedIn(container)).toBe("0-2"));

    await pressKey("ArrowDown", 40);
    await waitFor(() => expect(focusedIn(container)).toBe("1-0"));

    await pressKey("ArrowUp", 38);
    await waitFor(() => expect(focusedIn(container)).toBe("0-2"));
  });

  it("moves between menu and content with left/right", async () => {
    const { container } = render(<FocusSpikeScreen />);
    await layoutScreen(container);

    await waitFor(() => expect(focusedIn(container)).toBe("0-0"));

    await pressKey("ArrowLeft", 37);
    await waitFor(() => expect(focusedIn(container)).toBe("0"));

    await pressKey("ArrowRight", 39);
    await waitFor(() => expect(focusedIn(container)).toBe("0-0"));
  });
});
