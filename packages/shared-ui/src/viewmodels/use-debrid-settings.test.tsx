// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for the useDebridSettings view-model against a fake StorageAdapter
// and an injected reloadCore. Mirrors useTmdbSettings: seeding, save, clear, the
// empty-token delete path, and the hasDebrid flag — no real storage or core.

import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Core, DebridProvider, StorageAdapter } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import {
  REAL_DEBRID_TOKEN_STORAGE_KEY,
  useDebridSettings,
} from "./use-debrid-settings";

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

function fakeDebrid(): DebridProvider {
  return { id: "real-debrid" } as unknown as DebridProvider;
}

function renderSettings(options: {
  storage: StorageAdapter;
  debrid?: DebridProvider;
  reloadCore?: () => Promise<void>;
}) {
  const reloadCore = options.reloadCore ?? vi.fn(() => Promise.resolve());
  const core = {
    adapters: { storage: options.storage },
    debrid: options.debrid,
  } as unknown as Core;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  const view = renderHook(() => useDebridSettings(reloadCore), { wrapper });
  return { ...view, reloadCore };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDebridSettings", () => {
  it("seeds the field from the persisted token", async () => {
    const { result } = renderSettings({
      storage: memoryStorage({ [REAL_DEBRID_TOKEN_STORAGE_KEY]: "seeded" }),
    });
    await waitFor(() => expect(result.current.token).toBe("seeded"));
  });

  it("reflects hasDebrid from the core", () => {
    const withDebrid = renderSettings({
      storage: memoryStorage(),
      debrid: fakeDebrid(),
    });
    expect(withDebrid.result.current.hasDebrid).toBe(true);

    const without = renderSettings({ storage: memoryStorage() });
    expect(without.result.current.hasDebrid).toBe(false);
  });

  it("persists the trimmed token and rebuilds the core on save", async () => {
    const storage = memoryStorage();
    const setSpy = vi.spyOn(storage, "set");
    const { result, reloadCore } = renderSettings({ storage });

    act(() => result.current.setToken("  tok  "));
    await act(async () => {
      await result.current.save();
    });

    expect(setSpy).toHaveBeenCalledWith(REAL_DEBRID_TOKEN_STORAGE_KEY, "tok");
    expect(reloadCore).toHaveBeenCalledTimes(1);
    expect(result.current.justSaved).toBe(true);
    await expect(storage.get(REAL_DEBRID_TOKEN_STORAGE_KEY)).resolves.toBe("tok");
  });

  it("deletes the token when saving an empty value", async () => {
    const storage = memoryStorage({ [REAL_DEBRID_TOKEN_STORAGE_KEY]: "old" });
    const deleteSpy = vi.spyOn(storage, "delete");
    const setSpy = vi.spyOn(storage, "set");
    const { result } = renderSettings({ storage });

    await waitFor(() => expect(result.current.token).toBe("old"));
    act(() => result.current.setToken("   "));
    await act(async () => {
      await result.current.save();
    });

    expect(deleteSpy).toHaveBeenCalledWith(REAL_DEBRID_TOKEN_STORAGE_KEY);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("clears the token and rebuilds the core", async () => {
    const storage = memoryStorage({ [REAL_DEBRID_TOKEN_STORAGE_KEY]: "old" });
    const { result, reloadCore } = renderSettings({ storage });

    await waitFor(() => expect(result.current.token).toBe("old"));
    await act(async () => {
      await result.current.clear();
    });

    expect(result.current.token).toBe("");
    expect(reloadCore).toHaveBeenCalledTimes(1);
  });
});
