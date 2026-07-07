// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §2.2 litmus test: the entire core must run in plain Node with no UI.
// The adapters built here are test fixtures — real implementations live in shells.

import { describe, expect, it } from "vitest";
import { createCore } from "./create-core";
import type { HttpAdapter, HttpResponse } from "./adapters/http";
import type { StorageAdapter } from "./adapters/storage";

function createMemoryStorage(): StorageAdapter {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string) =>
      Promise.resolve((store.get(key) as T | undefined) ?? null),
    set: <T>(key: string, value: T) => {
      store.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    keys: (prefix = "") =>
      Promise.resolve([...store.keys()].filter((k) => k.startsWith(prefix))),
  };
}

function createStubHttp(): HttpAdapter {
  const response: HttpResponse = {
    status: 200,
    ok: true,
    text: () => Promise.resolve(""),
    json: <T>() => Promise.resolve(null as T),
  };
  return {
    get: () => Promise.resolve(response),
    post: () => Promise.resolve(response),
  };
}

describe("createCore (§2.2 core-purity smoke test)", () => {
  it("runs in plain Node — no DOM globals present", () => {
    expect(typeof globalThis.window).toBe("undefined");
    expect(typeof globalThis.document).toBe("undefined");
  });

  it("wires injected adapters and exposes the composition surface", async () => {
    const storage = createMemoryStorage();
    const core = createCore({ storage, http: createStubHttp() });

    expect(core.adapters.storage).toBe(storage);
    expect(core.adapters.http).toBeDefined();
    expect(core.providers).toEqual([]);
    expect(core.createPlayer).toBeUndefined();

    await core.adapters.storage.set("library:watchlist", ["tt1234567"]);
    await expect(
      core.adapters.storage.get<string[]>("library:watchlist"),
    ).resolves.toEqual(["tt1234567"]);
    await expect(core.adapters.storage.keys("library:")).resolves.toEqual([
      "library:watchlist",
    ]);
  });
});

declare global {
  // Allow the DOM-absence assertions above without pulling "DOM" into core's lib.
  var window: unknown;
  var document: unknown;
}
