// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for the useAddonManager view-model against a fake, array-backed
// AddonEngine. Verifies list seeding, refresh-after-mutation, the neutral
// error path (AddonInstallError → label, list unchanged), and the double-submit
// guard — without touching the real engine or storage.

import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddonInstallError } from "@shrimpler/core";
import type { AddonEngine, Core, InstalledAddon } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { labels } from "../labels/index";
import { useAddonManager } from "./use-addon-manager";

const BAD_URL = "https://bad.example/manifest.json";

function makeAddon(manifestUrl: string, enabled = true): InstalledAddon {
  return {
    manifestUrl,
    enabled,
    addedAt: 0,
    manifest: {
      id: manifestUrl,
      name: `Addon ${manifestUrl}`,
      version: "1.0.0",
      resources: ["stream"],
      types: ["movie"],
      catalogs: [],
    },
  };
}

/** Array-backed AddonEngine; throws AddonInstallError for the sentinel URL. */
function createFakeEngine(seed: InstalledAddon[] = []): AddonEngine {
  let installed = seed.map((a) => ({ ...a }));
  return {
    install: (manifestUrl: string) => {
      if (manifestUrl === BAD_URL) {
        return Promise.reject(new AddonInstallError("boom", manifestUrl));
      }
      const entry = makeAddon(manifestUrl);
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

function renderManager(engine: AddonEngine) {
  const core = { addons: engine } as unknown as Core;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  return renderHook(() => useAddonManager(), { wrapper });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAddonManager", () => {
  it("seeds the list synchronously from engine.list()", () => {
    const { result } = renderManager(
      createFakeEngine([makeAddon("https://a.example/manifest.json")]),
    );
    expect(result.current.addons).toHaveLength(1);
    expect(result.current.installError).toBeNull();
    expect(result.current.isInstalling).toBe(false);
  });

  it("installs by URL and refreshes the list", async () => {
    const { result } = renderManager(createFakeEngine());

    await act(async () => {
      const ok = await result.current.addByUrl(
        "https://ok.example/manifest.json",
      );
      expect(ok).toBe(true);
    });

    expect(result.current.addons).toHaveLength(1);
    expect(result.current.addons[0]?.manifestUrl).toBe(
      "https://ok.example/manifest.json",
    );
    expect(result.current.installError).toBeNull();
    expect(result.current.isInstalling).toBe(false);
  });

  it("surfaces a neutral label on AddonInstallError and leaves the list unchanged", async () => {
    const { result } = renderManager(createFakeEngine());

    await act(async () => {
      const ok = await result.current.addByUrl(BAD_URL);
      expect(ok).toBe(false);
    });

    expect(result.current.installError).toBe(labels.addSourceError);
    expect(result.current.addons).toHaveLength(0);

    act(() => result.current.clearError());
    expect(result.current.installError).toBeNull();
  });

  it("removes and toggles enabled, refreshing the list each time", async () => {
    const url = "https://a.example/manifest.json";
    const { result } = renderManager(createFakeEngine([makeAddon(url)]));

    await act(async () => {
      await result.current.setEnabled(url, false);
    });
    expect(result.current.addons[0]?.enabled).toBe(false);

    await act(async () => {
      await result.current.remove(url);
    });
    expect(result.current.addons).toHaveLength(0);
  });

  it("ignores a concurrent second install (double-submit guard)", async () => {
    const engine = createFakeEngine();
    const installSpy = vi.spyOn(engine, "install");
    const { result } = renderManager(engine);

    await act(async () => {
      const first = result.current.addByUrl("https://ok.example/manifest.json");
      const second = result.current.addByUrl(
        "https://ok2.example/manifest.json",
      );
      const [a, b] = await Promise.all([first, second]);
      // Exactly one wins; the other is rejected by the guard.
      expect([a, b].filter(Boolean)).toHaveLength(1);
    });

    expect(installSpy).toHaveBeenCalledTimes(1);
    expect(result.current.addons).toHaveLength(1);
  });

  it("toggles isInstalling around an install", async () => {
    // A deferred install lets us observe the pending state mid-flight.
    let resolveInstall: (() => void) | undefined;
    let installed: InstalledAddon[] = [];
    const gated: AddonEngine = {
      install: (url: string) =>
        new Promise((resolve) => {
          resolveInstall = () => {
            const entry = makeAddon(url);
            installed = [...installed, entry];
            resolve({ ...entry });
          };
        }),
      remove: () => Promise.resolve(),
      setEnabled: () => Promise.resolve(),
      list: () => installed.map((a) => ({ ...a })),
      getCatalog: () => Promise.resolve([]),
      getMeta: () => Promise.resolve(null),
      getStreams: () => Promise.resolve([]),
      getSubtitles: () => Promise.resolve([]),
    };
    const { result } = renderManager(gated);

    let pending: Promise<boolean>;
    act(() => {
      pending = result.current.addByUrl("https://ok.example/manifest.json");
    });
    await waitFor(() => expect(result.current.isInstalling).toBe(true));

    await act(async () => {
      resolveInstall?.();
      await pending;
    });
    expect(result.current.isInstalling).toBe(false);
    expect(result.current.addons).toHaveLength(1);
  });
});
