// SPDX-License-Identifier: AGPL-3.0-or-later
// Library tests: an in-memory StorageAdapter + an injected clock. Covers the
// record/evict/threshold rules, series episode→show folding, and the
// most-recent-first listing. Plain Node, no network (§2.2).

import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "../adapters/storage";
import { createLibrary } from "./create-library";
import type { ProgressInput } from "./create-library";

function memoryStorage(): StorageAdapter {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string) =>
      Promise.resolve((store.get(key) as T | undefined) ?? null),
    set: <T>(key: string, value: T) => {
      store.set(key, JSON.parse(JSON.stringify(value)));
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

/** A library whose clock returns successive integers, so updatedAt is testable. */
function libraryWithClock() {
  let tick = 0;
  const storage = memoryStorage();
  const library = createLibrary({ storage, now: () => ++tick });
  return { library, storage };
}

const movie = (over: Partial<ProgressInput> = {}): ProgressInput => ({
  id: "tt1",
  type: "movie",
  positionSec: 600,
  durationSec: 6000,
  ...over,
});

describe("Library.recordProgress", () => {
  it("records progress and reads it back for a movie", async () => {
    const { library } = libraryWithClock();
    await library.recordProgress(movie({ name: "A Film", poster: "p.jpg" }));

    const entry = await library.getEntry("tt1");
    expect(entry).toMatchObject({
      id: "tt1",
      playableId: "tt1",
      type: "movie",
      positionSec: 600,
      durationSec: 6000,
      name: "A Film",
      poster: "p.jpg",
    });
  });

  it("ignores progress below the resume threshold (< 15s)", async () => {
    const { library } = libraryWithClock();
    await library.recordProgress(movie({ positionSec: 5 }));
    expect(await library.getEntry("tt1")).toBeNull();
  });

  it("evicts a near-complete item (≥ 95%) instead of storing it", async () => {
    const { library } = libraryWithClock();
    await library.recordProgress(movie({ positionSec: 600 }));
    expect(await library.getEntry("tt1")).not.toBeNull();

    await library.recordProgress(movie({ positionSec: 5800 })); // 96.7%
    expect(await library.getEntry("tt1")).toBeNull();
  });

  it("folds a series episode to one show entry pointing at the episode", async () => {
    const { library } = libraryWithClock();
    await library.recordProgress({
      id: "tt9:1:5",
      type: "series",
      positionSec: 300,
      durationSec: 3000,
      name: "A Show",
    });

    // The show entry is keyed by the show id, but carries the episode details.
    const entry = await library.getEntry("tt9:1:5");
    expect(entry).toMatchObject({
      id: "tt9",
      playableId: "tt9:1:5",
      season: 1,
      episode: 5,
    });
    // Looking up by the show id finds the same entry.
    expect(await library.getEntry("tt9")).toMatchObject({
      playableId: "tt9:1:5",
    });
  });

  it("updates the show entry to the latest-watched episode", async () => {
    const { library } = libraryWithClock();
    await library.recordProgress({
      id: "tt9:1:5",
      type: "series",
      positionSec: 300,
      durationSec: 3000,
    });
    await library.recordProgress({
      id: "tt9:1:6",
      type: "series",
      positionSec: 120,
      durationSec: 3000,
    });

    const list = await library.listContinueWatching();
    expect(list).toHaveLength(1); // one entry per show, not per episode
    expect(list[0]).toMatchObject({ playableId: "tt9:1:6", episode: 6 });
  });
});

describe("Library.listContinueWatching", () => {
  it("returns entries most-recently-updated first", async () => {
    const { library } = libraryWithClock();
    await library.recordProgress(movie({ id: "tt1" }));
    await library.recordProgress(movie({ id: "tt2" }));
    await library.recordProgress(movie({ id: "tt3" }));
    // Touch tt1 again so it becomes the most recent.
    await library.recordProgress(movie({ id: "tt1", positionSec: 700 }));

    const ids = (await library.listContinueWatching()).map((e) => e.id);
    expect(ids).toEqual(["tt1", "tt3", "tt2"]);
  });

  it("is empty on a fresh store", async () => {
    const { library } = libraryWithClock();
    expect(await library.listContinueWatching()).toEqual([]);
  });
});

describe("Library.remove", () => {
  it("drops an entry by playable or detail id", async () => {
    const { library } = libraryWithClock();
    await library.recordProgress({
      id: "tt9:2:3",
      type: "series",
      positionSec: 300,
      durationSec: 3000,
    });
    await library.remove("tt9:2:3"); // playable id → folds to show id
    expect(await library.getEntry("tt9")).toBeNull();
  });
});
