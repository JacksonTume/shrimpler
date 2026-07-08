// SPDX-License-Identifier: AGPL-3.0-or-later
// Integration test for the addon manager screen: drives the add form, list
// toggle/remove, and the neutral error path against a fake Core, with the real
// focus + back engines initialized (useFocusable/useBackHandler require them).

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CoreProvider, labels } from "@shrimpler/shared-ui";
import { AddonInstallError } from "@shrimpler/core";
import type { AddonEngine, Core, InstalledAddon } from "@shrimpler/core";
import {
  destroyFocusEngine,
  initBackHandling,
  initFocusEngine,
} from "../focus";
import { AddonManagerScreen } from "./AddonManagerScreen";

const BAD_URL = "https://bad.example/manifest.json";

function makeAddon(manifestUrl: string, name: string): InstalledAddon {
  return {
    manifestUrl,
    enabled: true,
    addedAt: 0,
    manifest: {
      id: manifestUrl,
      name,
      version: "1.0.0",
      resources: ["stream"],
      types: ["movie"],
      catalogs: [],
    },
  };
}

function createFakeEngine(seed: InstalledAddon[] = []): AddonEngine {
  let installed = seed.map((a) => ({ ...a }));
  return {
    install: (manifestUrl: string) => {
      if (manifestUrl === BAD_URL) {
        return Promise.reject(new AddonInstallError("boom", manifestUrl));
      }
      const entry = makeAddon(manifestUrl, `Source ${installed.length + 1}`);
      installed = [...installed, entry];
      return Promise.resolve({ ...entry });
    },
    remove: (manifestUrl: string) => {
      installed = installed.filter((a) => a.manifestUrl !== manifestUrl);
      return Promise.resolve();
    },
    setEnabled: (manifestUrl: string, enabled: boolean) => {
      installed = installed.map((a) =>
        a.manifestUrl === manifestUrl ? { ...a, enabled } : a,
      );
      return Promise.resolve();
    },
    list: () => installed.map((a) => ({ ...a })),
    getCatalog: () => Promise.resolve([]),
    getMeta: () => Promise.resolve(null),
    getStreams: () => Promise.resolve([]),
    getSubtitles: () => Promise.resolve([]),
  };
}

function renderScreen(engine: AddonEngine) {
  const core = { addons: engine } as unknown as Core;
  return render(
    <CoreProvider core={core}>
      <AddonManagerScreen onNavigate={() => {}} />
    </CoreProvider>,
  );
}

describe("AddonManagerScreen", () => {
  let disposeBack: () => void;

  beforeEach(() => {
    initFocusEngine();
    disposeBack = initBackHandling();
  });

  afterEach(() => {
    cleanup();
    disposeBack();
    destroyFocusEngine();
  });

  it("shows the empty state when no sources are installed", () => {
    renderScreen(createFakeEngine());
    expect(screen.getByText(labels.emptySources)).toBeDefined();
  });

  it("adds a source by URL and lists it", async () => {
    renderScreen(createFakeEngine());

    fireEvent.change(screen.getByLabelText(labels.playlistUrl), {
      target: { value: "https://ok.example/manifest.json" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: labels.addSourceButton }),
    );

    await waitFor(() => expect(screen.getByText("Source 1")).toBeDefined());
    expect(screen.queryByText(labels.emptySources)).toBeNull();
  });

  it("shows the neutral error label on a failed add and keeps the list empty", async () => {
    renderScreen(createFakeEngine());

    fireEvent.change(screen.getByLabelText(labels.playlistUrl), {
      target: { value: BAD_URL },
    });
    fireEvent.click(
      screen.getByRole("button", { name: labels.addSourceButton }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(labels.addSourceError),
    );
    expect(screen.getByText(labels.emptySources)).toBeDefined();
  });

  it("toggles and removes an installed source", async () => {
    renderScreen(
      createFakeEngine([
        makeAddon("https://a.example/manifest.json", "My Source"),
      ]),
    );

    // Enabled → shows Disable; click it → flips to Enable.
    fireEvent.click(screen.getByRole("button", { name: labels.disableSource }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: labels.enableSource }),
      ).toBeDefined(),
    );

    fireEvent.click(screen.getByRole("button", { name: labels.removeSource }));
    await waitFor(() =>
      expect(screen.getByText(labels.emptySources)).toBeDefined(),
    );
  });
});
