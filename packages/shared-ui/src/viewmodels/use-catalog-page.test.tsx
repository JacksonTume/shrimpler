// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for useCatalogPage: appends pages via extra.skip, stops at `total`,
// forwards the genre, resets on a genre change, and does not refetch on a
// re-render with unchanged query (no loop).

import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOG_PAGE_SIZE } from "@shrimpler/core";
import type {
  CatalogExtra,
  Core,
  MediaType,
  MetaPreview,
} from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { useCatalogPage } from "./use-catalog-page";

function preview(i: number): MetaPreview {
  return {
    id: `iptv:live:c${i}`,
    type: "tv",
    name: `C${i}`,
    posterShape: "square",
  };
}

/** A fake engine whose getCatalog slices a source array by extra.skip. */
function coreWithSource(count: number, getCatalog = vi.fn()) {
  const source = Array.from({ length: count }, (_, i) => preview(i));
  const impl = (_type: MediaType, _id: string, extra?: CatalogExtra) => {
    const skip = extra?.skip ?? 0;
    return Promise.resolve(source.slice(skip, skip + CATALOG_PAGE_SIZE));
  };
  getCatalog.mockImplementation(impl);
  const core = { addons: { getCatalog } } as unknown as Core;
  return { core, getCatalog };
}

function wrapper(core: Core) {
  return ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCatalogPage", () => {
  it("loads page 0 and appends the next page via loadMore, stopping at total", async () => {
    const total = CATALOG_PAGE_SIZE + 30;
    const { core, getCatalog } = coreWithSource(total);
    const { result } = renderHook(
      () => useCatalogPage("tv", "iptv:live", "Big", total),
      { wrapper: wrapper(core) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toHaveLength(CATALOG_PAGE_SIZE);
    expect(result.current.hasMore).toBe(true);
    expect(getCatalog).toHaveBeenCalledWith("tv", "iptv:live", {
      skip: 0,
      genre: "Big",
    });

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(total));
    expect(result.current.hasMore).toBe(false);
    expect(getCatalog).toHaveBeenLastCalledWith("tv", "iptv:live", {
      skip: CATALOG_PAGE_SIZE,
      genre: "Big",
    });
  });

  it("resets accumulation when the genre changes", async () => {
    const { core } = coreWithSource(CATALOG_PAGE_SIZE + 10);
    const { result, rerender } = renderHook(
      ({ genre }: { genre: string }) =>
        useCatalogPage("tv", "iptv:live", genre, CATALOG_PAGE_SIZE + 10),
      { wrapper: wrapper(core), initialProps: { genre: "News" } },
    );

    await waitFor(() =>
      expect(result.current.items).toHaveLength(CATALOG_PAGE_SIZE),
    );
    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(result.current.items).toHaveLength(CATALOG_PAGE_SIZE + 10),
    );

    rerender({ genre: "Sports" });
    // Back to a single page for the new genre — accumulation was reset.
    await waitFor(() =>
      expect(result.current.items).toHaveLength(CATALOG_PAGE_SIZE),
    );
  });

  it("does not refetch on a re-render with an unchanged query", async () => {
    const { core, getCatalog } = coreWithSource(5);
    const { result, rerender } = renderHook(
      () => useCatalogPage("tv", "iptv:live", undefined, 5),
      { wrapper: wrapper(core) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getCatalog).toHaveBeenCalledTimes(1);
    expect(result.current.hasMore).toBe(false); // 5 < PAGE_SIZE and 5 == total

    rerender();
    rerender();
    expect(getCatalog).toHaveBeenCalledTimes(1);
  });
});
