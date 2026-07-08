// SPDX-License-Identifier: AGPL-3.0-or-later
// Dev smoke tool (§11 Phase 1): drive the REAL addon engine in plain Node
// against a Stremio addon manifest URL passed as a CLI argument. Installs the
// addon, then lists its catalogs and, for the first few items, resolves meta and
// fetches streams — exercising the same core code the shells use, with no UI.
//
// NEUTRALITY (§14.3): ships EMPTY. No manifest URL is bundled here or anywhere
// in the repo; the URL is supplied by the operator at runtime. This tool is a
// developer aid, not a source directory.
//
// Run:  pnpm smoke <manifest-url> [type] [catalogId]
//   e.g. pnpm smoke https://example.org/manifest.json movie
//
// Uses Node's global fetch (Node >= 22) and an in-memory StorageAdapter, so it
// persists nothing to disk.

import { createCore } from "@shrimpler/core";
import type {
  HttpAdapter,
  HttpOpts,
  HttpResponse,
  StorageAdapter,
} from "@shrimpler/core";

/** In-memory StorageAdapter — the smoke run keeps no state between invocations. */
function memoryStorage(): StorageAdapter {
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

/** fetch-backed HttpAdapter (Node >= 22 global fetch), honoring HttpOpts. */
function nodeHttp(): HttpAdapter {
  const request = async (
    url: string,
    init: RequestInit,
    opts?: HttpOpts,
  ): Promise<HttpResponse> => {
    const controller = new AbortController();
    const timer =
      opts?.timeoutMs !== undefined
        ? setTimeout(() => controller.abort(), opts.timeoutMs)
        : undefined;
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          ...opts?.headers,
        },
        signal: controller.signal,
      });
      return {
        status: response.status,
        ok: response.ok,
        text: () => response.text(),
        json: <T>() => response.json() as Promise<T>,
      };
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  };
  return {
    get: (url, opts) => request(url, { method: "GET" }, opts),
    post: (url, body, opts) =>
      request(
        url,
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        },
        opts,
      ),
  };
}

function fail(message: string): never {
  console.error(`addon-smoke: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const [manifestUrl, typeArg, catalogArg] = process.argv.slice(2);
  if (manifestUrl === undefined || manifestUrl === "") {
    fail("usage: pnpm smoke <manifest-url> [type] [catalogId]");
  }

  const core = await createCore({ storage: memoryStorage(), http: nodeHttp() });

  console.log(`Installing addon: ${manifestUrl}`);
  const installed = await core.addons.install(manifestUrl);
  console.log(`  ✓ ${installed.manifest.name} (id: ${installed.manifest.id})`);
  const catalogs = installed.manifest.catalogs ?? [];
  console.log(`  catalogs: ${catalogs.length}`);

  // Pick a catalog: the CLI type/catalogId override, else the first advertised.
  const target =
    catalogs.find(
      (c) =>
        (typeArg === undefined || c.type === typeArg) &&
        (catalogArg === undefined || c.id === catalogArg),
    ) ?? catalogs[0];
  if (target === undefined) {
    console.log("No catalogs to browse. Done.");
    return;
  }

  console.log(`\nFetching catalog: ${target.type}/${target.id}`);
  const rows = await core.addons.getCatalog(target.type, target.id);
  console.log(`  ✓ ${rows.length} items`);

  // Exercise meta + streams for the first few items (the full core pipeline).
  for (const item of rows.slice(0, 3)) {
    console.log(`\n• ${item.name} (${item.id})`);
    const meta = await core.metadata.resolveDetail(item.id, item.type);
    console.log(`    meta: ${meta === null ? "none" : meta.name}`);
    const streams = await core.streams.getRankedStreams(item.id, item.type);
    console.log(`    ranked streams: ${streams.length}`);
    const top = streams[0];
    if (top !== undefined) {
      console.log(
        `    top: ${top.title ?? top.quality ?? "source"}${top.cached === true ? " [cached]" : ""}`,
      );
    }
  }

  console.log("\nDone.");
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
