// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for useCatalogCategories: prepends a synthetic "All" bucket with the
// summed count, maps the "" genre to the Uncategorized label, preserves core's
// order, and surfaces a generic label on failure.

import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogGenre, Core } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { labels } from "../labels/index";
import { useCatalogCategories } from "./use-catalog-categories";

function coreWithGenres(getCatalogGenres: () => Promise<CatalogGenre[]>): Core {
  return { addons: { getCatalogGenres } } as unknown as Core;
}

function render(core: Core) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  return renderHook(() => useCatalogCategories("tv", "iptv:live"), { wrapper });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCatalogCategories", () => {
  it("prepends 'All' with the summed count and maps the uncategorized bucket", async () => {
    const { result } = render(
      coreWithGenres(() =>
        Promise.resolve([
          { name: "News", count: 2 },
          { name: "Sports", count: 1 },
          { name: "", count: 3 },
        ]),
      ),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.categories).toEqual([
      { key: undefined, label: labels.categoryAll, count: 6 },
      { key: "News", label: "News", count: 2 },
      { key: "Sports", label: "Sports", count: 1 },
      { key: "", label: labels.categoryUncategorized, count: 3 },
    ]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a generic label on failure", async () => {
    const { result } = render(
      coreWithGenres(() => Promise.reject(new Error("boom"))),
    );
    await waitFor(() =>
      expect(result.current.error).toBe(labels.channelsError),
    );
    expect(result.current.categories).toEqual([]);
  });
});
