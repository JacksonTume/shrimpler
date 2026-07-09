// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for the useIptvPlaylists view-model against the real createIptvService
// over in-memory storage + an injected reloadCore. Verifies seeding, add (persist
// + rebuild), remove, and the neutral error path for a bad URL — without touching
// real storage or rebuilding a core.

import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Core, StorageAdapter } from "@shrimpler/core";
import { createIptvService } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { labels } from "../labels/index";
import { useIptvPlaylists } from "./use-iptv-playlists";

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

function renderPlaylists(storage: StorageAdapter) {
  const reloadCore = vi.fn(() => Promise.resolve());
  const core = { iptv: createIptvService({ storage }) } as unknown as Core;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  const view = renderHook(() => useIptvPlaylists(reloadCore), { wrapper });
  return { ...view, reloadCore };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useIptvPlaylists", () => {
  it("seeds the list from persisted playlists", async () => {
    const { result } = renderPlaylists(
      memoryStorage({
        "settings:iptvPlaylists": [{ url: "http://p/a.m3u", addedAt: 1 }],
      }),
    );
    await waitFor(() =>
      expect(result.current.playlists.map((p) => p.url)).toEqual([
        "http://p/a.m3u",
      ]),
    );
  });

  it("adds a playlist, persists it, and rebuilds the core", async () => {
    const { result, reloadCore } = renderPlaylists(memoryStorage());

    await act(async () => {
      await result.current.addPlaylist("http://p/a.m3u");
    });

    expect(result.current.playlists.map((p) => p.url)).toEqual([
      "http://p/a.m3u",
    ]);
    expect(reloadCore).toHaveBeenCalledTimes(1);
  });

  it("removes a playlist and rebuilds the core", async () => {
    const { result, reloadCore } = renderPlaylists(
      memoryStorage({
        "settings:iptvPlaylists": [{ url: "http://p/a.m3u", addedAt: 1 }],
      }),
    );
    await waitFor(() => expect(result.current.playlists).toHaveLength(1));

    await act(async () => {
      await result.current.removePlaylist("http://p/a.m3u");
    });

    expect(result.current.playlists).toHaveLength(0);
    expect(reloadCore).toHaveBeenCalledTimes(1);
  });

  it("surfaces the neutral error label on a non-http(s) URL", async () => {
    const { result, reloadCore } = renderPlaylists(memoryStorage());

    let added: boolean | undefined;
    await act(async () => {
      added = await result.current.addPlaylist("ftp://nope");
    });

    expect(added).toBe(false);
    expect(result.current.error).toBe(labels.iptvAddError);
    expect(reloadCore).not.toHaveBeenCalled();
  });
});
