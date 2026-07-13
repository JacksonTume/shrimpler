// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { PlayableSource, PlayerError } from "@shrimpler/core";
import { RnVideoPlayerAdapter } from "./rn-video-player";
import type {
  RnVideoCallbacks,
  RnVideoHandle,
  RnVideoHandleFactory,
} from "./rn-video-player";

interface Rig {
  factory: RnVideoHandleFactory;
  calls: string[];
  callbacks: () => RnVideoCallbacks;
}

/** A fake handle that records imperative calls and exposes the callbacks the
 *  adapter handed it, so a test can drive load/progress/error by hand. */
function makeRig(): Rig {
  const calls: string[] = [];
  let captured: RnVideoCallbacks | null = null;
  const handle: RnVideoHandle = {
    setSource: (url) => calls.push(`setSource:${url}`),
    play: () => calls.push("play"),
    pause: () => calls.push("pause"),
    seek: (positionSec) => calls.push(`seek:${positionSec}`),
    setRate: (rate) => calls.push(`setRate:${rate}`),
    destroy: () => calls.push("destroy"),
  };
  return {
    factory: (cb) => {
      captured = cb;
      return handle;
    },
    calls,
    callbacks: () => {
      if (captured === null) {
        throw new Error("handle factory not invoked yet");
      }
      return captured;
    },
  };
}

function source(over?: Partial<PlayableSource>): PlayableSource {
  return { id: "s1", kind: "vod", url: "http://x/v.mp4", ...over };
}

describe("RnVideoPlayerAdapter", () => {
  it("load resolves on onLoad and wires source + tracks + duration", async () => {
    const rig = makeRig();
    const adapter = new RnVideoPlayerAdapter(rig.factory);

    const loading = adapter.load(source());
    expect(rig.calls).toContain("setSource:http://x/v.mp4");

    rig.callbacks().onLoad({
      durationSec: 120,
      audioTracks: [],
      subtitleTracks: [{ id: "en", label: "English" }],
    });

    await expect(loading).resolves.toBeUndefined();
    expect(adapter.getState().durationSec).toBe(120);
    expect(adapter.getState().subtitleTracks).toEqual([
      { id: "en", label: "English" },
    ]);
  });

  it("rejects load when the source has no url", async () => {
    const adapter = new RnVideoPlayerAdapter(makeRig().factory);
    await expect(adapter.load(source({ url: undefined }))).rejects.toThrow(
      /no resolved url/,
    );
  });

  it("play/pause/seek drive the handle and update state", async () => {
    const rig = makeRig();
    const adapter = new RnVideoPlayerAdapter(rig.factory);
    const loading = adapter.load(source());
    rig.callbacks().onLoad({ durationSec: 10, audioTracks: [], subtitleTracks: [] });
    await loading;

    adapter.play();
    expect(adapter.getState().status).toBe("playing");
    adapter.pause();
    expect(adapter.getState().status).toBe("paused");
    adapter.seek(42);
    expect(rig.calls).toContain("seek:42");
    expect(adapter.getState().positionSec).toBe(42);
  });

  it("onProgress emits timeupdate to subscribers", async () => {
    const rig = makeRig();
    const adapter = new RnVideoPlayerAdapter(rig.factory);
    const ticks: number[] = [];
    adapter.on("timeupdate", (payload) => {
      if (payload.positionSec !== undefined) {
        ticks.push(payload.positionSec);
      }
    });
    const loading = adapter.load(source());
    rig.callbacks().onLoad({ durationSec: 10, audioTracks: [], subtitleTracks: [] });
    await loading;

    rig.callbacks().onProgress({ positionSec: 3, bufferedSec: 5 });
    expect(ticks).toContain(3);
  });

  it("a fatal handle error rejects the pending load and emits error", async () => {
    const rig = makeRig();
    const adapter = new RnVideoPlayerAdapter(rig.factory);
    let emitted: PlayerError | undefined;
    adapter.on("error", (payload) => {
      emitted = payload.error;
    });
    const loading = adapter.load(source());
    rig.callbacks().onError({ code: "X", message: "boom", fatal: true });

    await expect(loading).rejects.toThrow(/boom/);
    expect(emitted?.code).toBe("X");
  });

  it("destroy tears down the handle", async () => {
    const rig = makeRig();
    const adapter = new RnVideoPlayerAdapter(rig.factory);
    const loading = adapter.load(source());
    rig.callbacks().onLoad({ durationSec: 1, audioTracks: [], subtitleTracks: [] });
    await loading;
    adapter.destroy();
    expect(rig.calls).toContain("destroy");
  });

  it("the default (unbound) adapter fails load with a clear error", async () => {
    const adapter = new RnVideoPlayerAdapter();
    await expect(adapter.load(source())).rejects.toThrow(/not wired up/);
  });
});
