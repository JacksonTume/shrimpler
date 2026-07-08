// SPDX-License-Identifier: AGPL-3.0-or-later
// Integration test for the settings screen against a fake StorageAdapter and an
// injected reloadCore, with the real focus + back engines initialized. Covers
// the provider status line, saving a key (persist + rebuild), and clearing it.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreProvider, labels } from "@shrimpler/shared-ui";
import { TMDB_API_KEY_STORAGE_KEY } from "@shrimpler/shared-ui";
import type { Core, MetadataProvider, StorageAdapter } from "@shrimpler/core";
import {
  destroyFocusEngine,
  initBackHandling,
  initFocusEngine,
} from "../focus";
import { SettingsScreen } from "./SettingsScreen";

function memoryStorage(seed: Record<string, unknown> = {}): StorageAdapter {
  const map = new Map<string, string>(
    Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]),
  );
  return {
    get: <T,>(key: string) =>
      Promise.resolve(
        map.has(key) ? (JSON.parse(map.get(key) as string) as T) : null,
      ),
    set: (key: string, value: unknown) => {
      map.set(key, JSON.stringify(value));
      return Promise.resolve();
    },
    delete: (key: string) => {
      map.delete(key);
      return Promise.resolve();
    },
    keys: (prefix = "") =>
      Promise.resolve([...map.keys()].filter((k) => k.startsWith(prefix))),
  };
}

function renderSettings(options: {
  storage: StorageAdapter;
  providers?: readonly MetadataProvider[];
  reloadCore?: () => Promise<void>;
}) {
  const reloadCore = options.reloadCore ?? vi.fn(() => Promise.resolve());
  const core = {
    adapters: { storage: options.storage },
    providers: options.providers ?? [],
  } as unknown as Core;
  const view = render(
    <CoreProvider core={core}>
      <SettingsScreen onNavigate={() => {}} reloadCore={reloadCore} />
    </CoreProvider>,
  );
  return { ...view, reloadCore };
}

describe("SettingsScreen", () => {
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

  it("shows the provider status", () => {
    renderSettings({
      storage: memoryStorage(),
      providers: [{ id: "tmdb" } as unknown as MetadataProvider],
    });
    // The TMDB status line is the first of the two settings sections.
    expect(screen.getAllByRole("status")[0]!.textContent).toContain(
      labels.tmdbKeyActive,
    );
  });

  it("saves a key, persists it, and rebuilds the core", async () => {
    const storage = memoryStorage();
    const setSpy = vi.spyOn(storage, "set");
    const { reloadCore } = renderSettings({ storage });

    fireEvent.change(screen.getByLabelText(labels.tmdbKeyLabel), {
      target: { value: "my-key" },
    });
    // Two sections now share Save/Clear/status; the TMDB one is first.
    fireEvent.click(screen.getAllByRole("button", { name: labels.save })[0]!);

    await waitFor(() =>
      expect(screen.getAllByRole("status")[0]!.textContent).toContain(
        labels.saved,
      ),
    );
    expect(setSpy).toHaveBeenCalledWith(TMDB_API_KEY_STORAGE_KEY, "my-key");
    expect(reloadCore).toHaveBeenCalledTimes(1);
  });

  it("clears a stored key and rebuilds the core", async () => {
    const storage = memoryStorage({ [TMDB_API_KEY_STORAGE_KEY]: "old" });
    const deleteSpy = vi.spyOn(storage, "delete");
    const { reloadCore } = renderSettings({ storage });

    // Field seeds from the stored key.
    await waitFor(() =>
      expect(
        (screen.getByLabelText(labels.tmdbKeyLabel) as HTMLInputElement).value,
      ).toBe("old"),
    );

    fireEvent.click(screen.getAllByRole("button", { name: labels.clear })[0]!);

    await waitFor(() => expect(reloadCore).toHaveBeenCalledTimes(1));
    expect(deleteSpy).toHaveBeenCalledWith(TMDB_API_KEY_STORAGE_KEY);
    expect(
      (screen.getByLabelText(labels.tmdbKeyLabel) as HTMLInputElement).value,
    ).toBe("");
  });
});
