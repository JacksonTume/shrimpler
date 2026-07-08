// SPDX-License-Identifier: AGPL-3.0-or-later
// Html5VideoPlayerAdapter tests in jsdom: drive the wrapped <video> by defining
// media properties and dispatching native events, then assert the mapping to the
// PlayerAdapter contract (events, getState, unsubscribe). No real playback — the
// element's currentTime/duration/error are stubbed per-case.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayableSource } from "@shrimpler/core";
import { Html5VideoPlayerAdapter } from "./html5-video";

function source(over: Partial<PlayableSource> = {}): PlayableSource {
  return { id: "s", kind: "vod", url: "https://dl/x.mp4", ...over };
}

/** Override a media element getter (currentTime, duration, error, …) for a case. */
function define(el: HTMLVideoElement, prop: string, value: unknown): void {
  Object.defineProperty(el, prop, { value, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Html5VideoPlayerAdapter", () => {
  it("reports idle state before any source is loaded", () => {
    const adapter = new Html5VideoPlayerAdapter();
    expect(adapter.getState().status).toBe("idle");
  });

  it("rejects load() when the source has no resolved url", async () => {
    const adapter = new Html5VideoPlayerAdapter();
    await expect(adapter.load(source({ url: undefined }))).rejects.toThrow();
  });

  it("resolves load() on loadedmetadata and sets the element src", async () => {
    const adapter = new Html5VideoPlayerAdapter();
    const pending = adapter.load(source({ url: "https://dl/movie.mp4" }));
    expect(adapter.element.getAttribute("src")).toBe("https://dl/movie.mp4");
    adapter.element.dispatchEvent(new Event("loadedmetadata"));
    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects load() on a media error event", async () => {
    const adapter = new Html5VideoPlayerAdapter();
    const pending = adapter.load(source());
    adapter.element.dispatchEvent(new Event("error"));
    await expect(pending).rejects.toThrow();
  });

  it("maps timeupdate to a positionSec payload", () => {
    const adapter = new Html5VideoPlayerAdapter();
    const cb = vi.fn();
    adapter.on("timeupdate", cb);

    define(adapter.element, "currentTime", 42);
    adapter.element.dispatchEvent(new Event("timeupdate"));

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0]).toMatchObject({ positionSec: 42 });
  });

  it("maps an ended event and reflects it in getState", async () => {
    const adapter = new Html5VideoPlayerAdapter();
    const cb = vi.fn();
    adapter.on("ended", cb);
    // Give it a source so status derivation is active.
    const pending = adapter.load(source());
    adapter.element.dispatchEvent(new Event("loadedmetadata"));
    await pending;

    define(adapter.element, "ended", true);
    adapter.element.dispatchEvent(new Event("ended"));

    expect(cb).toHaveBeenCalledTimes(1);
    expect(adapter.getState().status).toBe("ended");
  });

  it("maps a media error to a fatal PlayerError payload", () => {
    const adapter = new Html5VideoPlayerAdapter();
    const cb = vi.fn();
    adapter.on("error", cb);

    define(adapter.element, "error", { code: 3, message: "decode failed" });
    adapter.element.dispatchEvent(new Event("error"));

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0]!.error).toMatchObject({
      code: "MEDIA_ERR_3",
      message: "decode failed",
      fatal: true,
    });
  });

  it("emits a non-fatal warning for a notWebReady source", async () => {
    const adapter = new Html5VideoPlayerAdapter();
    const cb = vi.fn();
    adapter.on("error", cb);

    const pending = adapter.load(
      source({ behaviorHints: { notWebReady: true } }),
    );
    adapter.element.dispatchEvent(new Event("loadedmetadata"));
    await pending;

    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0]![0]!.error).toMatchObject({
      code: "NOT_WEB_READY",
      fatal: false,
    });
  });

  it("stops delivering events after the subscriber unsubscribes", () => {
    const adapter = new Html5VideoPlayerAdapter();
    const cb = vi.fn();
    const unsub = adapter.on("timeupdate", cb);

    adapter.element.dispatchEvent(new Event("timeupdate"));
    unsub();
    adapter.element.dispatchEvent(new Event("timeupdate"));

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("detaches DOM handlers on destroy", () => {
    const adapter = new Html5VideoPlayerAdapter();
    const cb = vi.fn();
    adapter.on("timeupdate", cb);

    adapter.destroy();
    adapter.element.dispatchEvent(new Event("timeupdate"));

    expect(cb).not.toHaveBeenCalled();
  });
});
