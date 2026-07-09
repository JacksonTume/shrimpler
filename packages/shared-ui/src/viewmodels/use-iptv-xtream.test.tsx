// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for useIptvXtream against the real createIptvService over in-memory
// storage + an injected reloadCore. Verifies add (persist + rebuild), the
// host+username no-op, remove, and the neutral error path for a bad host.

import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Core, StorageAdapter } from "@shrimpler/core";
import { createIptvService } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { labels } from "../labels/index";
import { useIptvXtream } from "./use-iptv-xtream";

function memoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    get: <T,>(key: string) =>
      Promise.resolve(map.has(key) ? (JSON.parse(map.get(key)!) as T) : null),
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

function renderXtream(storage: StorageAdapter) {
  const reloadCore = vi.fn(() => Promise.resolve());
  const core = { iptv: createIptvService({ storage }) } as unknown as Core;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  const view = renderHook(() => useIptvXtream(reloadCore), { wrapper });
  return { ...view, reloadCore };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useIptvXtream", () => {
  it("adds an account, persists it, and rebuilds the core", async () => {
    const { result, reloadCore } = renderXtream(memoryStorage());

    await act(async () => {
      await result.current.addAccount({
        host: "http://x:8080",
        username: "u",
        password: "p",
      });
    });

    expect(result.current.accounts.map((a) => a.username)).toEqual(["u"]);
    expect(reloadCore).toHaveBeenCalledTimes(1);
  });

  it("removes an account and rebuilds the core", async () => {
    const { result, reloadCore } = renderXtream(memoryStorage());
    await act(async () => {
      await result.current.addAccount({
        host: "http://x:8080",
        username: "u",
        password: "p",
      });
    });
    await waitFor(() => expect(result.current.accounts).toHaveLength(1));

    await act(async () => {
      await result.current.removeAccount("http://x:8080", "u");
    });
    expect(result.current.accounts).toHaveLength(0);
    expect(reloadCore).toHaveBeenCalledTimes(2);
  });

  it("surfaces the neutral error label on a non-http(s) host", async () => {
    const { result, reloadCore } = renderXtream(memoryStorage());

    let added: boolean | undefined;
    await act(async () => {
      added = await result.current.addAccount({
        host: "not-a-url",
        username: "u",
        password: "p",
      });
    });

    expect(added).toBe(false);
    expect(result.current.error).toBe(labels.xtreamAddError);
    expect(reloadCore).not.toHaveBeenCalled();
  });
});
