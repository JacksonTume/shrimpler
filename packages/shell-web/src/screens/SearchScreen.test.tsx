// SPDX-License-Identifier: AGPL-3.0-or-later
// Integration test for the search screen against a fake MetadataResolver, with
// the real focus + back engines initialized. Covers a query→results render, the
// empty state, and navigating to detail on selecting a result.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreProvider, labels } from "@shrimpler/shared-ui";
import type { Core, MetaPreview, MetadataResolver } from "@shrimpler/core";
import type { Route } from "../navigation";
import {
  destroyFocusEngine,
  initBackHandling,
  initFocusEngine,
} from "../focus";
import { SearchScreen } from "./SearchScreen";

function createResolver(search: MetadataResolver["search"]): MetadataResolver {
  return {
    resolveDetail: vi.fn(() => Promise.resolve(null)),
    resolveEpisodes: vi.fn(() => Promise.resolve([])),
    buildHomeFeeds: vi.fn(() => Promise.resolve([])),
    search,
    resolveStreamId: vi.fn(() => Promise.resolve<string | null>(null)),
  };
}

function renderSearch(
  resolver: MetadataResolver,
  onNavigate: (route: Route) => void = () => {},
) {
  const core = { metadata: resolver } as unknown as Core;
  return render(
    <CoreProvider core={core}>
      <SearchScreen onNavigate={onNavigate} />
    </CoreProvider>,
  );
}

const OBSESSION: MetaPreview = {
  id: "tmdb:1339713",
  type: "movie",
  name: "Obsession",
  releaseInfo: "2026",
};

describe("SearchScreen", () => {
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

  it("runs a query and lists results", async () => {
    renderSearch(createResolver(() => Promise.resolve([OBSESSION])));

    fireEvent.change(screen.getByLabelText(labels.searchPlaceholder), {
      target: { value: "obs" },
    });
    fireEvent.click(screen.getByRole("button", { name: labels.searchButton }));

    await waitFor(() =>
      expect(screen.getByText("Obsession (2026)")).toBeDefined(),
    );
  });

  it("shows the empty state when a search returns nothing", async () => {
    renderSearch(createResolver(() => Promise.resolve([])));

    fireEvent.change(screen.getByLabelText(labels.searchPlaceholder), {
      target: { value: "zzz" },
    });
    fireEvent.click(screen.getByRole("button", { name: labels.searchButton }));

    await waitFor(() =>
      expect(screen.getByText(labels.searchEmpty)).toBeDefined(),
    );
  });

  it("navigates to detail when a result is selected", async () => {
    const onNavigate = vi.fn();
    renderSearch(
      createResolver(() => Promise.resolve([OBSESSION])),
      onNavigate,
    );

    fireEvent.change(screen.getByLabelText(labels.searchPlaceholder), {
      target: { value: "obs" },
    });
    fireEvent.click(screen.getByRole("button", { name: labels.searchButton }));

    const row = await screen.findByText("Obsession (2026)");
    fireEvent.click(row);

    expect(onNavigate).toHaveBeenCalledWith({
      screen: "detail",
      id: "tmdb:1339713",
      type: "movie",
    });
  });
});
