// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for the useDetail view-model against a fake MetadataResolver.
// Verifies movie vs. series fetching, the loading→loaded transition, the
// neutral error label, and the stale-response guard on an id change — without
// touching the real resolver or network (§2.2).

import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Core,
  EpisodeRef,
  MetaDetail,
  MetadataResolver,
} from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { labels } from "../labels/index";
import { useDetail } from "./use-detail";

function movieDetail(id: string): MetaDetail {
  return { id, type: "movie", name: `Movie ${id}`, description: "A film." };
}

function episode(id: string, season: number, ep: number): EpisodeRef {
  return { id: `${id}:${season}:${ep}`, season, episode: ep };
}

function createFakeResolver(
  overrides: Partial<MetadataResolver> = {},
): MetadataResolver {
  return {
    resolveDetail: vi.fn((id: string) => Promise.resolve(movieDetail(id))),
    resolveEpisodes: vi.fn(() => Promise.resolve<EpisodeRef[]>([])),
    buildHomeFeeds: vi.fn(() => Promise.resolve([])),
    search: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
}

function renderDetail(
  resolver: MetadataResolver,
  initial: { id: string; type: string } = { id: "tt1", type: "movie" },
  providers: readonly unknown[] = [],
) {
  const core = { metadata: resolver, providers } as unknown as Core;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  return renderHook(({ id, type }) => useDetail(id, type), {
    wrapper,
    initialProps: initial,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDetail", () => {
  it("loads a movie detail and does not fetch episodes", async () => {
    const resolver = createFakeResolver();
    const { result } = renderDetail(resolver);

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.detail?.name).toBe("Movie tt1");
    expect(result.current.episodes).toHaveLength(0);
    expect(result.current.error).toBeNull();
    expect(result.current.hasProvider).toBe(false);
    expect(resolver.resolveEpisodes).not.toHaveBeenCalled();
  });

  it("reports hasProvider when the core has a metadata provider", async () => {
    const resolver = createFakeResolver();
    const { result } = renderDetail(resolver, { id: "tt1", type: "movie" }, [
      { id: "tmdb" },
    ]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasProvider).toBe(true);
  });

  it("loads a series detail and its episodes", async () => {
    const resolver = createFakeResolver({
      resolveDetail: vi.fn((id: string) =>
        Promise.resolve<MetaDetail>({ id, type: "series", name: `Show ${id}` }),
      ),
      resolveEpisodes: vi.fn((id: string) =>
        Promise.resolve([episode(id, 1, 1), episode(id, 1, 2)]),
      ),
    });
    const { result } = renderDetail(resolver, { id: "tt9", type: "series" });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.detail?.name).toBe("Show tt9");
    expect(result.current.episodes).toHaveLength(2);
    expect(resolver.resolveEpisodes).toHaveBeenCalledWith("tt9");
  });

  it("surfaces a neutral label when resolution throws", async () => {
    const resolver = createFakeResolver({
      resolveDetail: vi.fn(() => Promise.reject(new Error("boom"))),
    });
    const { result } = renderDetail(resolver);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(labels.detailError);
    expect(result.current.detail).toBeNull();
  });

  it("drops a stale response when the id changes mid-flight", async () => {
    // Gate the first (tt1) resolve so a later id can overtake it.
    let releaseFirst: (() => void) | undefined;
    const resolveDetail = vi.fn((id: string) => {
      if (id === "tt1") {
        return new Promise<MetaDetail>((resolve) => {
          releaseFirst = () => resolve(movieDetail("tt1"));
        });
      }
      return Promise.resolve(movieDetail(id));
    });
    const resolver = createFakeResolver({ resolveDetail });
    const { result, rerender } = renderDetail(resolver, {
      id: "tt1",
      type: "movie",
    });

    // Switch to tt2 before tt1 has resolved; tt2 resolves immediately.
    rerender({ id: "tt2", type: "movie" });
    await waitFor(() => expect(result.current.detail?.name).toBe("Movie tt2"));

    // Now let the stale tt1 response arrive — it must be ignored.
    await act(async () => {
      releaseFirst?.();
      await Promise.resolve();
    });
    expect(result.current.detail?.name).toBe("Movie tt2");
  });
});
