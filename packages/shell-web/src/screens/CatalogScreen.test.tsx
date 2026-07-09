// SPDX-License-Identifier: AGPL-3.0-or-later
// Integration test for the generic IPTV catalog screen against a fake addon
// engine, with the real focus + back engines initialized. Covers a catalog
// render, the empty state, and navigating to detail on selecting an item.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreProvider, labels } from "@shrimpler/shared-ui";
import type { AddonEngine, Core, MetaPreview } from "@shrimpler/core";
import type { Route } from "../navigation";
import {
  destroyFocusEngine,
  initBackHandling,
  initFocusEngine,
} from "../focus";
import { CatalogScreen } from "./CatalogScreen";

function createEngine(catalogId: string, items: MetaPreview[]): AddonEngine {
  return {
    install: vi.fn(),
    remove: vi.fn(),
    setEnabled: vi.fn(),
    list: () => [],
    getCatalog: (_type: string, id: string) =>
      Promise.resolve(id === catalogId ? items : []),
    getMeta: () => Promise.resolve(null),
    getStreams: () => Promise.resolve([]),
    getSubtitles: () => Promise.resolve([]),
  } as unknown as AddonEngine;
}

function renderCatalog(
  engine: AddonEngine,
  route: { catalogType: string; catalogId: string; title: string },
  onNavigate: (route: Route) => void = () => {},
) {
  const core = { addons: engine } as unknown as Core;
  return render(
    <CoreProvider core={core}>
      <CatalogScreen
        onNavigate={onNavigate}
        catalogType={route.catalogType}
        catalogId={route.catalogId}
        title={route.title}
      />
    </CoreProvider>,
  );
}

const MOVIE: MetaPreview = {
  id: "iptv:movie:m1",
  type: "movie",
  name: "A Movie",
  posterShape: "poster",
};

describe("CatalogScreen", () => {
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

  it("lists items from the requested catalog", async () => {
    renderCatalog(createEngine("iptv:movies", [MOVIE]), {
      catalogType: "movie",
      catalogId: "iptv:movies",
      title: "Movies",
    });
    await waitFor(() => expect(screen.getByText("A Movie")).toBeDefined());
  });

  it("shows the empty state when the catalog is empty", async () => {
    renderCatalog(createEngine("iptv:movies", []), {
      catalogType: "movie",
      catalogId: "iptv:movies",
      title: "Movies",
    });
    await waitFor(() =>
      expect(screen.getByText(labels.channelsEmpty)).toBeDefined(),
    );
  });

  it("navigates to detail with the item's id and type on select", async () => {
    const onNavigate = vi.fn();
    renderCatalog(
      createEngine("iptv:movies", [MOVIE]),
      { catalogType: "movie", catalogId: "iptv:movies", title: "Movies" },
      onNavigate,
    );

    const card = await screen.findByText("A Movie");
    fireEvent.click(card);
    expect(onNavigate).toHaveBeenCalledWith({
      screen: "detail",
      id: "iptv:movie:m1",
      type: "movie",
    });
  });
});
