// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for useIptvRefresh: kicks a background refresh on mount, rebuilds the
// core only when content changed, tolerates a refresh rejection, and runs once
// per core instance (no refresh loop on re-render).

import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Core } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { useIptvRefresh } from "./use-iptv-refresh";

function coreWithRefresh(refresh: () => Promise<{ changed: boolean }>): Core {
  return { iptv: { refresh } } as unknown as Core;
}

function render(core: Core, reloadCore: () => Promise<void>) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  return renderHook(() => useIptvRefresh(reloadCore), { wrapper });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useIptvRefresh", () => {
  it("refreshes on mount and rebuilds the core when content changed", async () => {
    const refresh = vi.fn(() => Promise.resolve({ changed: true }));
    const reloadCore = vi.fn(() => Promise.resolve());
    const { result } = render(coreWithRefresh(refresh), reloadCore);

    await waitFor(() => expect(reloadCore).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
  });

  it("surfaces progress reported during the refresh", async () => {
    const refresh = vi.fn(
      (options?: {
        onProgress?: (p: {
          total: number;
          completed: number;
          phase?: string;
        }) => void;
      }) => {
        options?.onProgress?.({ total: 2, completed: 0, phase: "streams" });
        return Promise.resolve({ changed: false });
      },
    );
    const reloadCore = vi.fn(() => Promise.resolve());
    const { result } = render(
      { iptv: { refresh } } as unknown as Core,
      reloadCore,
    );

    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    // Progress is cleared to null when the refresh settles.
    expect(result.current.progress).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild when nothing changed", async () => {
    const refresh = vi.fn(() => Promise.resolve({ changed: false }));
    const reloadCore = vi.fn(() => Promise.resolve());
    const { result } = render(coreWithRefresh(refresh), reloadCore);

    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reloadCore).not.toHaveBeenCalled();
  });

  it("runs once per core instance across re-renders", async () => {
    const refresh = vi.fn(() => Promise.resolve({ changed: false }));
    const reloadCore = vi.fn(() => Promise.resolve());
    const core = coreWithRefresh(refresh);
    const { rerender, result } = render(core, reloadCore);

    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    rerender();
    rerender();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when a refresh rejects", async () => {
    const refresh = vi.fn(() => Promise.reject(new Error("boom")));
    const reloadCore = vi.fn(() => Promise.resolve());
    const { result } = render(coreWithRefresh(refresh), reloadCore);

    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    expect(reloadCore).not.toHaveBeenCalled();
  });
});
