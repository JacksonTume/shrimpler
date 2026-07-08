// SPDX-License-Identifier: AGPL-3.0-or-later
// Integration test for the detail screen against a fake MetadataResolver, with
// the real focus + back engines initialized. Covers a movie render, a series
// episode list with season switching, and the empty + no-provider-hint state.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreProvider, labels } from "@shrimpler/shared-ui";
import type {
  Core,
  EpisodeRef,
  MediaType,
  MetaDetail,
  MetadataProvider,
  MetadataResolver,
} from "@shrimpler/core";
import {
  destroyFocusEngine,
  initBackHandling,
  initFocusEngine,
} from "../focus";
import { DetailScreen } from "./DetailScreen";

function createResolver(
  overrides: Partial<MetadataResolver> = {},
): MetadataResolver {
  return {
    resolveDetail: vi.fn(() => Promise.resolve<MetaDetail | null>(null)),
    resolveEpisodes: vi.fn(() => Promise.resolve<EpisodeRef[]>([])),
    buildHomeFeeds: vi.fn(() => Promise.resolve([])),
    search: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
}

function renderDetail(options: {
  resolver: MetadataResolver;
  id?: string;
  type?: MediaType;
  providers?: readonly MetadataProvider[];
}) {
  const core = {
    metadata: options.resolver,
    providers: options.providers ?? [],
  } as unknown as Core;
  return render(
    <CoreProvider core={core}>
      <DetailScreen
        onNavigate={() => {}}
        id={options.id ?? "tt1"}
        type={options.type ?? "movie"}
      />
    </CoreProvider>,
  );
}

describe("DetailScreen", () => {
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

  it("renders a movie's metadata", async () => {
    const resolver = createResolver({
      resolveDetail: vi.fn(() =>
        Promise.resolve<MetaDetail>({
          id: "tt1",
          type: "movie",
          name: "A Film",
          description: "A quiet film.",
          cast: ["Alice", "Bob"],
          genres: ["Drama"],
        }),
      ),
    });
    renderDetail({ resolver });

    await waitFor(() => expect(screen.getByText("A Film")).toBeDefined());
    expect(screen.getByText("A quiet film.")).toBeDefined();
    expect(
      screen.getByText(`${labels.castTitle}: Alice, Bob`),
    ).toBeDefined();
    expect(resolver.resolveEpisodes).not.toHaveBeenCalled();
  });

  it("lists series episodes and switches season", async () => {
    const episodes: EpisodeRef[] = [
      { id: "tt9:1:1", season: 1, episode: 1, name: "Pilot" },
      { id: "tt9:2:1", season: 2, episode: 1, name: "Return" },
    ];
    const resolver = createResolver({
      resolveDetail: vi.fn(() =>
        Promise.resolve<MetaDetail>({ id: "tt9", type: "series", name: "A Show" }),
      ),
      resolveEpisodes: vi.fn(() => Promise.resolve(episodes)),
    });
    renderDetail({ resolver, id: "tt9", type: "series" });

    // Season 1 shown by default.
    await waitFor(() => expect(screen.getByText(/Pilot/)).toBeDefined());
    expect(screen.queryByText(/Return/)).toBeNull();

    // Switch to season 2.
    fireEvent.click(
      screen.getByRole("button", { name: `${labels.seasonLabel} 2` }),
    );
    await waitFor(() => expect(screen.getByText(/Return/)).toBeDefined());
    expect(screen.queryByText(/Pilot/)).toBeNull();
  });

  it("shows the empty state and the no-provider hint", async () => {
    const resolver = createResolver({
      resolveDetail: vi.fn(() => Promise.resolve(null)),
    });
    renderDetail({ resolver });

    await waitFor(() => expect(screen.getByText(labels.detailEmpty)).toBeDefined());
    expect(screen.getByText(labels.detailNoProviderHint)).toBeDefined();
  });
});
