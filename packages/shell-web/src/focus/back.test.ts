// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleBack, initBackHandling, pushBackHandler } from "./back";

describe("back-handler stack", () => {
  it("returns false when no handler is registered", () => {
    expect(handleBack()).toBe(false);
  });

  it("invokes only the most recently registered handler", () => {
    const first = vi.fn();
    const second = vi.fn();
    const disposeFirst = pushBackHandler(first);
    const disposeSecond = pushBackHandler(second);

    expect(handleBack()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    disposeSecond();
    expect(handleBack()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);

    disposeFirst();
    expect(handleBack()).toBe(false);
  });

  it("disposing is idempotent and leaves other handlers intact", () => {
    const first = vi.fn();
    const second = vi.fn();
    const disposeFirst = pushBackHandler(first);
    const disposeSecond = pushBackHandler(second);

    disposeFirst();
    disposeFirst();
    expect(handleBack()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    disposeSecond();
  });
});

describe("initBackHandling", () => {
  let disposeListener: (() => void) | undefined;
  let disposeHandler: (() => void) | undefined;

  afterEach(() => {
    disposeHandler?.();
    disposeListener?.();
  });

  it("maps Escape and TV back keyCodes to the top handler", () => {
    const handler = vi.fn();
    disposeListener = initBackHandling();
    disposeHandler = pushBackHandler(handler);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handler).toHaveBeenCalledTimes(1);

    // webOS Back reports keyCode 461 with a non-standard key value.
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Unidentified",
        keyCode: 461,
      } as KeyboardEventInit),
    );
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("ignores Backspace while typing in a text field", () => {
    const handler = vi.fn();
    disposeListener = initBackHandling();
    disposeHandler = pushBackHandler(handler);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
    );
    expect(handler).not.toHaveBeenCalled();
    input.remove();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("stops listening after its disposer runs", () => {
    const handler = vi.fn();
    disposeListener = initBackHandling();
    disposeHandler = pushBackHandler(handler);

    disposeListener();
    disposeListener = undefined;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handler).not.toHaveBeenCalled();
  });
});
