// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for the useTmdbSettings view-model against a fake StorageAdapter
// and an injected reloadCore. Verifies seeding from the persisted key, save
// (persist + rebuild), clear (delete + rebuild), the empty-key delete path, and
// the hasProvider flag — without touching real storage or rebuilding a core.

import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Core, MetadataProvider, StorageAdapter } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import {
  TMDB_API_KEY_STORAGE_KEY,
  useTmdbSettings,
} from "./use-tmdb-settings";

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

function tmdbProvider(): MetadataProvider {
  return { id: "tmdb" } as unknown as MetadataProvider;
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
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  const view = renderHook(() => useTmdbSettings(reloadCore), { wrapper });
  return { ...view, reloadCore };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTmdbSettings", () => {
  it("seeds the field from the persisted key", async () => {
    const { result } = renderSettings({
      storage: memoryStorage({ [TMDB_API_KEY_STORAGE_KEY]: "seeded-key" }),
    });
    await waitFor(() => expect(result.current.apiKey).toBe("seeded-key"));
  });

  it("reflects hasProvider from the core's providers", () => {
    const withProvider = renderSettings({
      storage: memoryStorage(),
      providers: [tmdbProvider()],
    });
    expect(withProvider.result.current.hasProvider).toBe(true);

    const without = renderSettings({ storage: memoryStorage() });
    expect(without.result.current.hasProvider).toBe(false);
  });

  it("persists the trimmed key and rebuilds the core on save", async () => {
    const storage = memoryStorage();
    const setSpy = vi.spyOn(storage, "set");
    const { result, reloadCore } = renderSettings({ storage });

    act(() => result.current.setApiKey("  my-key  "));
    await act(async () => {
      await result.current.save();
    });

    expect(setSpy).toHaveBeenCalledWith(TMDB_API_KEY_STORAGE_KEY, "my-key");
    expect(reloadCore).toHaveBeenCalledTimes(1);
    expect(result.current.justSaved).toBe(true);
    await expect(storage.get(TMDB_API_KEY_STORAGE_KEY)).resolves.toBe("my-key");
  });

  it("deletes the key when saving an empty value", async () => {
    const storage = memoryStorage({ [TMDB_API_KEY_STORAGE_KEY]: "old" });
    const deleteSpy = vi.spyOn(storage, "delete");
    const setSpy = vi.spyOn(storage, "set");
    const { result } = renderSettings({ storage });

    await waitFor(() => expect(result.current.apiKey).toBe("old"));
    act(() => result.current.setApiKey("   "));
    await act(async () => {
      await result.current.save();
    });

    expect(deleteSpy).toHaveBeenCalledWith(TMDB_API_KEY_STORAGE_KEY);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("clears the key and rebuilds the core", async () => {
    const storage = memoryStorage({ [TMDB_API_KEY_STORAGE_KEY]: "old" });
    const deleteSpy = vi.spyOn(storage, "delete");
    const { result, reloadCore } = renderSettings({ storage });

    await waitFor(() => expect(result.current.apiKey).toBe("old"));
    await act(async () => {
      await result.current.clear();
    });

    expect(deleteSpy).toHaveBeenCalledWith(TMDB_API_KEY_STORAGE_KEY);
    expect(result.current.apiKey).toBe("");
    expect(reloadCore).toHaveBeenCalledTimes(1);
  });
});
