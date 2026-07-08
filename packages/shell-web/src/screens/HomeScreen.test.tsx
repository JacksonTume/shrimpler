// SPDX-License-Identifier: AGPL-3.0-or-later
// Integration test for the home screen's continue-watching row against a fake
// Library, with the real focus engine initialized. Verifies the row renders from
// stored progress and that selecting a card navigates to the detail screen.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreProvider, labels } from "@shrimpler/shared-ui";
import type { Core, Library, ProgressEntry } from "@shrimpler/core";
import { destroyFocusEngine, initFocusEngine } from "../focus";
import type { Route } from "../navigation";
import { HomeScreen } from "./HomeScreen";

function fakeLibrary(entries: ProgressEntry[]): Library {
  return {
    recordProgress: vi.fn(() => Promise.resolve()),
    getEntry: vi.fn(() => Promise.resolve(null)),
    listContinueWatching: vi.fn(() => Promise.resolve(entries)),
    remove: vi.fn(() => Promise.resolve()),
  };
}

function renderHome(entries: ProgressEntry[], onNavigate: (r: Route) => void) {
  const core = { library: fakeLibrary(entries) } as unknown as Core;
  return render(
    <CoreProvider core={core}>
      <HomeScreen onNavigate={onNavigate} />
    </CoreProvider>,
  );
}

const entry = (over: Partial<ProgressEntry>): ProgressEntry => ({
  id: over.id ?? "tt1",
  playableId: over.playableId ?? over.id ?? "tt1",
  type: over.type ?? "movie",
  positionSec: 300,
  durationSec: 6000,
  updatedAt: 1,
  ...over,
});

describe("HomeScreen continue-watching", () => {
  beforeEach(() => {
    initFocusEngine();
  });
  afterEach(() => {
    cleanup();
    destroyFocusEngine();
    vi.restoreAllMocks();
  });

  it("renders a continue-watching card and navigates to detail on select", async () => {
    const onNavigate = vi.fn();
    renderHome([entry({ id: "tt1", name: "A Film" })], onNavigate);

    const card = await screen.findByRole("button", { name: /A Film/ });
    fireEvent.click(card);
    expect(onNavigate).toHaveBeenCalledWith({
      screen: "detail",
      id: "tt1",
      type: "movie",
    });
  });

  it("omits the row when there is no progress", async () => {
    renderHome([], () => {});
    // The section heading never appears for an empty list.
    await waitFor(() =>
      expect(screen.queryByText(labels.continueWatching)).toBeNull(),
    );
  });
});
