// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for the useSearch view-model against a fake MetadataResolver.
// Verifies a submit-driven query, the blank-query short-circuit, the neutral
// error label, and the out-of-order (stale-response) guard.

import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Core, MetaPreview, MetadataResolver } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { labels } from "../labels/index";
import { useSearch } from "./use-search";

function preview(id: string, name: string): MetaPreview {
  return { id, type: "movie", name };
}

function createResolver(
  search: MetadataResolver["search"],
): MetadataResolver {
  return {
    resolveDetail: vi.fn(() => Promise.resolve(null)),
    resolveEpisodes: vi.fn(() => Promise.resolve([])),
    buildHomeFeeds: vi.fn(() => Promise.resolve([])),
    search,
    resolveStreamId: vi.fn(() => Promise.resolve<string | null>(null)),
  };
}

function renderSearch(resolver: MetadataResolver) {
  const core = { metadata: resolver } as unknown as Core;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  return renderHook(() => useSearch(), { wrapper });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSearch", () => {
  it("runs the query and exposes results", async () => {
    const resolver = createResolver(() =>
      Promise.resolve([preview("tmdb:1", "Obsession")]),
    );
    const { result } = renderSearch(resolver);

    act(() => result.current.setQuery("obs"));
    await act(async () => {
      await result.current.search();
    });

    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0]?.name).toBe("Obsession");
    expect(result.current.error).toBeNull();
  });

  it("short-circuits a blank query without calling the resolver", async () => {
    const search = vi.fn(() => Promise.resolve([preview("tmdb:1", "X")]));
    const { result } = renderSearch(createResolver(search));

    act(() => result.current.setQuery("   "));
    await act(async () => {
      await result.current.search();
    });

    expect(search).not.toHaveBeenCalled();
    expect(result.current.results).toHaveLength(0);
  });

  it("surfaces a neutral label when search throws", async () => {
    const resolver = createResolver(() => Promise.reject(new Error("boom")));
    const { result } = renderSearch(resolver);

    act(() => result.current.setQuery("obs"));
    await act(async () => {
      await result.current.search();
    });

    expect(result.current.error).toBe(labels.searchError);
  });

  it("ignores a stale response when a newer query commits first", async () => {
    // First query is gated; second resolves immediately and must win.
    let releaseFirst: ((v: MetaPreview[]) => void) | undefined;
    const search = vi.fn((q: string) =>
      q === "old"
        ? new Promise<MetaPreview[]>((resolve) => {
            releaseFirst = resolve;
          })
        : Promise.resolve([preview("tmdb:2", "New")]),
    );
    const { result } = renderSearch(createResolver(search));

    // Kick off the slow "old" query without awaiting it.
    let oldPending: Promise<void>;
    act(() => {
      result.current.setQuery("old");
    });
    act(() => {
      oldPending = result.current.search();
    });

    // Now the "new" query resolves and commits.
    act(() => result.current.setQuery("new"));
    await act(async () => {
      await result.current.search();
    });
    expect(result.current.results[0]?.name).toBe("New");

    // Let the stale "old" response arrive — it must be ignored.
    await act(async () => {
      releaseFirst?.([preview("tmdb:1", "Old")]);
      await oldPending;
    });
    expect(result.current.results[0]?.name).toBe("New");
  });
});
