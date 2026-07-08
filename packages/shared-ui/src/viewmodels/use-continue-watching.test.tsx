// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for the useContinueWatching view-model against a fake Library.
// Verifies the initial load and that remove drops an entry then refreshes.

import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Core, Library, ProgressEntry } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { useContinueWatching } from "./use-continue-watching";

function entry(over: Partial<ProgressEntry>): ProgressEntry {
  return {
    id: over.id ?? "tt1",
    playableId: over.playableId ?? over.id ?? "tt1",
    type: "movie",
    positionSec: 100,
    durationSec: 6000,
    updatedAt: 1,
    ...over,
  };
}

function createFakeLibrary(overrides: Partial<Library> = {}): Library {
  return {
    recordProgress: vi.fn(() => Promise.resolve()),
    getEntry: vi.fn(() => Promise.resolve<ProgressEntry | null>(null)),
    listContinueWatching: vi.fn(() => Promise.resolve<ProgressEntry[]>([])),
    remove: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function renderCw(library: Library) {
  const core = { library } as unknown as Core;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  return renderHook(() => useContinueWatching(), { wrapper });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useContinueWatching", () => {
  it("loads the continue-watching list on mount", async () => {
    const library = createFakeLibrary({
      listContinueWatching: vi.fn(() =>
        Promise.resolve([entry({ id: "tt1" }), entry({ id: "tt2" })]),
      ),
    });
    const { result } = renderCw(library);

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries.map((e) => e.id)).toEqual(["tt1", "tt2"]);
  });

  it("removes an entry and refreshes the list", async () => {
    const remaining = [entry({ id: "tt2" })];
    const listContinueWatching = vi
      .fn()
      .mockResolvedValueOnce([entry({ id: "tt1" }), entry({ id: "tt2" })])
      .mockResolvedValueOnce(remaining);
    const library = createFakeLibrary({ listContinueWatching });
    const { result } = renderCw(library);

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    await act(async () => {
      await result.current.remove("tt1");
    });

    expect(library.remove).toHaveBeenCalledWith("tt1");
    expect(result.current.entries.map((e) => e.id)).toEqual(["tt2"]);
  });
});
