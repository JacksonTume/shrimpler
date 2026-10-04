// SPDX-License-Identifier: AGPL-3.0-or-later
// Integration test for the category drill-down screen against a fake addon
// engine, with the real focus + back engines. Covers rendering category rows
// with counts (All first, uncategorized labeled), selecting a category to open
// the filtered catalog, and the empty state.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreProvider, labels } from "@shrimpler/shared-ui";
import type { AddonEngine, CatalogGenre, Core } from "@shrimpler/core";
import type { Route } from "../navigation";
import {
  destroyFocusEngine,
  initBackHandling,
  initFocusEngine,
} from "../focus";
import { CategoriesScreen } from "./CategoriesScreen";

function createEngine(genres: CatalogGenre[]): AddonEngine {
  return {
    install: vi.fn(),
    remove: vi.fn(),
    setEnabled: vi.fn(),
    list: () => [],
    getCatalog: () => Promise.resolve([]),
    getCatalogGenres: () => Promise.resolve(genres),
    getMeta: () => Promise.resolve(null),
    getStreams: () => Promise.resolve([]),
    getSubtitles: () => Promise.resolve([]),
  } as unknown as AddonEngine;
}

function renderCategories(
  engine: AddonEngine,
  onNavigate: (route: Route) => void = () => {},
) {
  const core = { addons: engine } as unknown as Core;
  return render(
    <CoreProvider core={core}>
      <CategoriesScreen
        onNavigate={onNavigate}
        catalogType="tv"
        catalogId="iptv:live"
        title="Live TV"
      />
    </CoreProvider>,
  );
}

describe("CategoriesScreen", () => {
  let disposeBack: () => void;

  beforeEach(() => {
    initFocusEngine();
    disposeBack = initBackHandling();
  });

  afterEach(() => {
    cleanup();
    disposeBack();
    destroyFocusEngine();
    vi.restoreAllMocks();
  });

  it("renders All first with the summed count and labels the uncategorized bucket", async () => {
    renderCategories(
      createEngine([
        { name: "News", count: 2 },
        { name: "", count: 3 },
      ]),
    );
    await waitFor(() =>
      expect(screen.getByText(labels.categoryAll)).toBeDefined(),
    );
    expect(screen.getByText("News")).toBeDefined();
    expect(screen.getByText(labels.categoryUncategorized)).toBeDefined();
    // "All" count is the sum (2 + 3 = 5).
    expect(screen.getByText(`5 ${labels.categoryCount}`)).toBeDefined();
  });

  it("opens the filtered catalog on selecting a category", async () => {
    const onNavigate = vi.fn();
    renderCategories(createEngine([{ name: "News", count: 2 }]), onNavigate);

    const row = await screen.findByText("News");
    fireEvent.click(row);
    expect(onNavigate).toHaveBeenCalledWith({
      screen: "catalog",
      catalogType: "tv",
      catalogId: "iptv:live",
      title: "Live TV · News",
      genre: "News",
      total: 2,
    });
  });

  it("opens the unfiltered catalog when All is selected (no genre)", async () => {
    const onNavigate = vi.fn();
    renderCategories(createEngine([{ name: "News", count: 2 }]), onNavigate);

    const all = await screen.findByText(labels.categoryAll);
    fireEvent.click(all);
    expect(onNavigate).toHaveBeenCalledWith({
      screen: "catalog",
      catalogType: "tv",
      catalogId: "iptv:live",
      title: `Live TV · ${labels.categoryAll}`,
      total: 2,
    });
  });

  it("shows the empty state when there are no categories", async () => {
    renderCategories(createEngine([]));
    await waitFor(() =>
      expect(screen.getByText(labels.channelsEmpty)).toBeDefined(),
    );
  });
});
