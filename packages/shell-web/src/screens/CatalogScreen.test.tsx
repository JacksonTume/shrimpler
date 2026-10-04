// SPDX-License-Identifier: AGPL-3.0-or-later
// Integration test for the generic IPTV catalog screen against a fake addon
// engine, with the real focus + back engines initialized. Covers a catalog
// render, the empty state, navigating to detail, genre-filtered paging (skip +
// "Load more"), and Back returning to the category list.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreProvider, labels } from "@shrimpler/shared-ui";
import { CATALOG_PAGE_SIZE } from "@shrimpler/core";
import type {
  AddonEngine,
  CatalogExtra,
  Core,
  MetaPreview,
} from "@shrimpler/core";
import type { Route } from "../navigation";
import {
  destroyFocusEngine,
  initBackHandling,
  initFocusEngine,
} from "../focus";
import { CatalogScreen } from "./CatalogScreen";

/** A fake engine whose getCatalog slices `items` by extra.skip (page paging). */
function createEngine(
  catalogId: string,
  items: MetaPreview[],
  getCatalog = vi.fn(),
): AddonEngine {
  getCatalog.mockImplementation(
    (_type: string, id: string, extra?: CatalogExtra) => {
      if (id !== catalogId) return Promise.resolve([]);
      const skip = extra?.skip ?? 0;
      return Promise.resolve(items.slice(skip, skip + CATALOG_PAGE_SIZE));
    },
  );
  return {
    install: vi.fn(),
    remove: vi.fn(),
    setEnabled: vi.fn(),
    list: () => [],
    getCatalog,
    getCatalogGenres: () => Promise.resolve([]),
    getMeta: () => Promise.resolve(null),
    getStreams: () => Promise.resolve([]),
    getSubtitles: () => Promise.resolve([]),
  } as unknown as AddonEngine;
}

function renderCatalog(
  engine: AddonEngine,
  route: {
    catalogType: string;
    catalogId: string;
    title: string;
    genre?: string;
    total?: number;
  },
  onNavigate: (route: Route) => void = () => {},
) {
  // Minimal epg stub: the live-channel cards call useNowNext, which reads core.epg.
  const core = {
    addons: engine,
    epg: {
      getNowNext: () => Promise.resolve({}),
      refresh: () => Promise.resolve({ changed: false }),
    },
  } as unknown as Core;
  return render(
    <CoreProvider core={core}>
      <CatalogScreen
        onNavigate={onNavigate}
        catalogType={route.catalogType}
        catalogId={route.catalogId}
        title={route.title}
        genre={route.genre}
        total={route.total}
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

function channel(i: number): MetaPreview {
  return {
    id: `iptv:live:c${i}`,
    type: "tv",
    name: `C${i}`,
    posterShape: "square",
  };
}

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

  it("requests the catalog filtered by genre with a skip cursor", async () => {
    const getCatalog = vi.fn();
    renderCatalog(createEngine("iptv:live", [channel(0)], getCatalog), {
      catalogType: "tv",
      catalogId: "iptv:live",
      title: "Live TV · News",
      genre: "News",
      total: 1,
    });
    await waitFor(() => expect(screen.getByText("C0")).toBeDefined());
    expect(getCatalog).toHaveBeenCalledWith("tv", "iptv:live", {
      skip: 0,
      genre: "News",
    });
  });

  it("appends the next page when Load more is pressed", async () => {
    const total = CATALOG_PAGE_SIZE + 5;
    const items = Array.from({ length: total }, (_, i) => channel(i));
    renderCatalog(createEngine("iptv:live", items), {
      catalogType: "tv",
      catalogId: "iptv:live",
      title: "Live TV · Big",
      genre: "Big",
      total,
    });

    // Page 1 shows PAGE_SIZE items and the last item is not there yet.
    await waitFor(() => expect(screen.getByText("C0")).toBeDefined());
    expect(screen.queryByText(`C${total - 1}`)).toBeNull();

    fireEvent.click(screen.getByText(labels.loadMore));
    await waitFor(() =>
      expect(screen.getByText(`C${total - 1}`)).toBeDefined(),
    );
  });

  it("returns to the category list on Back", async () => {
    const onNavigate = vi.fn();
    renderCatalog(
      createEngine("iptv:live", [channel(0)]),
      {
        catalogType: "tv",
        catalogId: "iptv:live",
        title: "Live TV · News",
        genre: "News",
        total: 1,
      },
      onNavigate,
    );
    await screen.findByText("C0");
    fireEvent.click(screen.getByText(labels.back));
    expect(onNavigate).toHaveBeenCalledWith({
      screen: "categories",
      catalogType: "tv",
      catalogId: "iptv:live",
      title: "Live TV · News",
    });
  });
});
