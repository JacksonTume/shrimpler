// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for useCatalog: fetches a catalog page, and (regression) does not
// refetch when re-rendered with a freshly-built `extra` object that has equal
// fields — the effect depends on extra's primitives, not its identity.

import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Core, MetaPreview } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { useCatalog } from "./use-catalog";

const ITEM: MetaPreview = {
  id: "iptv:live:x",
  type: "tv",
  name: "X",
  posterShape: "square",
};

function coreWith(getCatalog = vi.fn(() => Promise.resolve([ITEM]))) {
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

describe("useCatalog", () => {
  it("loads items for the catalog", async () => {
    const { core } = coreWith();
    const { result } = renderHook(() => useCatalog("tv", "iptv:live"), {
      wrapper: wrapper(core),
    });
    await waitFor(() => expect(result.current.items).toEqual([ITEM]));
  });

  it("does not refetch when a fresh extra object has equal fields", async () => {
    const { core, getCatalog } = coreWith();
    // A new { genre } object each render — identity changes, fields don't.
    const { result, rerender } = renderHook(
      () => useCatalog("tv", "iptv:live", { genre: "News" }),
      { wrapper: wrapper(core) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getCatalog).toHaveBeenCalledTimes(1);

    rerender();
    rerender();
    expect(getCatalog).toHaveBeenCalledTimes(1);
  });
});
