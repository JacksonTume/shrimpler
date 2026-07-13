// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from "vitest";

// Same native-module mock as rn-storage.test: an empty store means no persisted
// TMDB key / debrid token, so createRnCore composes a Core with no providers.
const { fakeStore } = vi.hoisted(() => ({ fakeStore: new Map<string, string>() }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (key: string): Promise<string | null> =>
      Promise.resolve(fakeStore.has(key) ? fakeStore.get(key)! : null),
    setItem: (key: string, value: string): Promise<void> => {
      fakeStore.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string): Promise<void> => {
      fakeStore.delete(key);
      return Promise.resolve();
    },
    getAllKeys: (): Promise<string[]> => Promise.resolve([...fakeStore.keys()]),
  },
}));

import { createRnCore } from "./composition-root";

describe("createRnCore", () => {
  it("composes a Core exposing every namespace, with no providers when unset", async () => {
    const core = await createRnCore();

    expect(core.addons).toBeDefined();
    expect(core.metadata).toBeDefined();
    expect(core.streams).toBeDefined();
    expect(core.library).toBeDefined();
    expect(core.iptv).toBeDefined();
    expect(core.providers).toEqual([]);
    expect(core.debrid).toBeUndefined();
  });
});
