// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for the useWatchProgress view-model against a fake Library. Verifies
// resume seeding (only for the matching item), the record throttle, and that
// flush always writes.

import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Core, Library, ProgressEntry } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { useWatchProgress } from "./use-watch-progress";
import type { WatchProgressTarget } from "./use-watch-progress";

function createFakeLibrary(overrides: Partial<Library> = {}): Library {
  return {
    recordProgress: vi.fn(() => Promise.resolve()),
    getEntry: vi.fn(() => Promise.resolve<ProgressEntry | null>(null)),
    listContinueWatching: vi.fn(() => Promise.resolve<ProgressEntry[]>([])),
    remove: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function renderProgress(library: Library, target: WatchProgressTarget) {
  const core = { library } as unknown as Core;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  return renderHook(() => useWatchProgress(target), { wrapper });
}

const MOVIE: WatchProgressTarget = { id: "tt1", type: "movie" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWatchProgress", () => {
  it("seeds resumePositionSec from a saved entry for the same item", async () => {
    const library = createFakeLibrary({
      getEntry: vi.fn(() =>
        Promise.resolve<ProgressEntry>({
          id: "tt1",
          playableId: "tt1",
          type: "movie",
          positionSec: 420,
          durationSec: 6000,
          updatedAt: 1,
        }),
      ),
    });
    const { result } = renderProgress(library, MOVIE);
    await waitFor(() => expect(result.current.resumePositionSec).toBe(420));
  });

  it("does not resume when the saved entry is a different episode", async () => {
    const library = createFakeLibrary({
      getEntry: vi.fn(() =>
        Promise.resolve<ProgressEntry>({
          id: "tt9",
          playableId: "tt9:1:6", // a different episode than the one we're playing
          type: "series",
          positionSec: 300,
          durationSec: 3000,
          updatedAt: 1,
        }),
      ),
    });
    const { result } = renderProgress(library, {
      id: "tt9:1:5",
      type: "series",
    });
    // Give the async getEntry a tick; resume stays 0.
    await waitFor(() => expect(library.getEntry).toHaveBeenCalled());
    expect(result.current.resumePositionSec).toBe(0);
  });

  it("throttles record: writes, then skips until movement exceeds the window", async () => {
    const library = createFakeLibrary();
    const { result } = renderProgress(library, MOVIE);

    act(() => result.current.record(30, 6000)); // first write (from -Infinity)
    act(() => result.current.record(35, 6000)); // +5s → skipped
    act(() => result.current.record(45, 6000)); // +15s from last write → writes

    expect(library.recordProgress).toHaveBeenCalledTimes(2);
    expect(library.recordProgress).toHaveBeenNthCalledWith(1, {
      id: "tt1",
      type: "movie",
      positionSec: 30,
      durationSec: 6000,
      name: undefined,
      poster: undefined,
    });
    expect(library.recordProgress).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ positionSec: 45 }),
    );
  });

  it("flush always writes regardless of the throttle", () => {
    const library = createFakeLibrary();
    const { result } = renderProgress(library, MOVIE);

    act(() => result.current.record(30, 6000)); // sets last-written to 30
    act(() => result.current.flush(31, 6000)); // within window, but flush forces it

    expect(library.recordProgress).toHaveBeenCalledTimes(2);
    expect(library.recordProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ positionSec: 31 }),
    );
  });
});
