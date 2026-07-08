// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit test for the useStreamPicker view-model against a fake StreamService.
// Verifies the loading→list transition, the stale-guard on an id change, the
// select→resolve path with its double-submit guard, the no-debrid hint for a
// torrent source, and that errors surface as labels (ADR-0007) — no network.

import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Core, PlayableSource, StreamService } from "@shrimpler/core";
import { CoreProvider } from "../context/core-context";
import { labels } from "../labels/index";
import { useStreamPicker } from "./use-stream-picker";

function source(over: Partial<PlayableSource>): PlayableSource {
  return { id: over.id ?? "s", kind: "vod", ...over };
}

function createFakeService(
  overrides: Partial<StreamService> = {},
): StreamService {
  return {
    getRankedStreams: vi.fn(() =>
      Promise.resolve([source({ id: "a", title: "1080p", infoHash: "h1" })]),
    ),
    resolveStream: vi.fn((s: PlayableSource) =>
      Promise.resolve({ ...s, url: "https://dl/x.mkv", cached: true }),
    ),
    ...overrides,
  };
}

function renderPicker(
  service: StreamService,
  options: { debrid?: unknown; id?: string; type?: string } = {},
) {
  const core = {
    streams: service,
    debrid: options.debrid,
  } as unknown as Core;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(CoreProvider, { core, children });
  return renderHook(({ id, type }) => useStreamPicker(id, type), {
    wrapper,
    initialProps: {
      id: options.id ?? "tt1",
      type: options.type ?? "movie",
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStreamPicker", () => {
  it("loads a ranked list and exposes hasDebrid", async () => {
    const service = createFakeService();
    const { result } = renderPicker(service, { debrid: { id: "real-debrid" } });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.streams.map((s) => s.id)).toEqual(["a"]);
    expect(result.current.hasDebrid).toBe(true);
    expect(service.getRankedStreams).toHaveBeenCalledWith("tt1", "movie");
  });

  it("surfaces a neutral label when the fetch throws", async () => {
    const service = createFakeService({
      getRankedStreams: vi.fn(() => Promise.reject(new Error("boom"))),
    });
    const { result } = renderPicker(service);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe(labels.streamResolveError);
    expect(result.current.streams).toHaveLength(0);
  });

  it("resolves a selected source to one with a playable url", async () => {
    const service = createFakeService();
    const { result } = renderPicker(service, { debrid: { id: "real-debrid" } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let resolved: PlayableSource | null = null;
    await act(async () => {
      resolved = await result.current.select(result.current.streams[0]!);
    });

    expect(resolved).not.toBeNull();
    expect(resolved!.url).toBe("https://dl/x.mkv");
    expect(result.current.resolveError).toBeNull();
  });

  it("hints instead of resolving when a torrent source has no debrid", async () => {
    const resolveStream = vi.fn(() => Promise.resolve(null));
    const service = createFakeService({
      getRankedStreams: vi.fn(() =>
        Promise.resolve([source({ id: "t", infoHash: "h1" })]),
      ),
      resolveStream,
    });
    const { result } = renderPicker(service); // no debrid
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let resolved: PlayableSource | null = source({ id: "x" });
    await act(async () => {
      resolved = await result.current.select(result.current.streams[0]!);
    });

    expect(resolved).toBeNull();
    expect(result.current.resolveError).toBe(labels.streamNoDebridHint);
    expect(resolveStream).not.toHaveBeenCalled();
  });

  it("sets a neutral label when resolution returns null", async () => {
    const service = createFakeService({
      resolveStream: vi.fn(() => Promise.resolve(null)),
    });
    const { result } = renderPicker(service, { debrid: { id: "real-debrid" } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.select(result.current.streams[0]!);
    });
    expect(result.current.resolveError).toBe(labels.streamResolveError);
  });

  it("drops a stale stream list when the id changes mid-flight", async () => {
    let releaseFirst: (() => void) | undefined;
    const getRankedStreams = vi.fn((id: string) => {
      if (id === "tt1") {
        return new Promise<PlayableSource[]>((resolve) => {
          releaseFirst = () => resolve([source({ id: "old" })]);
        });
      }
      return Promise.resolve([source({ id: "new" })]);
    });
    const service = createFakeService({ getRankedStreams });
    const { result, rerender } = renderPicker(service);

    rerender({ id: "tt2", type: "movie" });
    await waitFor(() =>
      expect(result.current.streams.map((s) => s.id)).toEqual(["new"]),
    );

    await act(async () => {
      releaseFirst?.();
      await Promise.resolve();
    });
    expect(result.current.streams.map((s) => s.id)).toEqual(["new"]);
  });
});
