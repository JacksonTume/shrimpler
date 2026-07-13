// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the native module so the real (native-bridge) code never loads under
// Node — an in-memory Map stands in for AsyncStorage.
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

import { RnStorageAdapter } from "./rn-storage";

describe("RnStorageAdapter", () => {
  beforeEach(() => fakeStore.clear());

  it("round-trips JSON under the shrimpler: prefix", async () => {
    const storage = new RnStorageAdapter();
    await storage.set("k", { a: 1 });
    expect(fakeStore.get("shrimpler:k")).toBe(JSON.stringify({ a: 1 }));
    expect(await storage.get<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("returns null for a missing key", async () => {
    expect(await new RnStorageAdapter().get("nope")).toBeNull();
  });

  it("delete removes the value", async () => {
    const storage = new RnStorageAdapter();
    await storage.set("k", 1);
    await storage.delete("k");
    expect(await storage.get("k")).toBeNull();
  });

  it("keys(prefix) filters by prefix and strips the storage prefix", async () => {
    const storage = new RnStorageAdapter();
    await storage.set("settings:a", 1);
    await storage.set("settings:b", 2);
    await storage.set("other", 3);
    const keys = await storage.keys("settings:");
    expect(keys.sort()).toEqual(["settings:a", "settings:b"]);
  });
});
