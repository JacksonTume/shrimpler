// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.3 — the web shell's composition root: wires concrete browser
// adapters into the pure core. This is the only place the shell and core meet.

import { createCore, TmdbProvider } from "@shrimpler/core";
import type {
  Core,
  HttpAdapter,
  HttpOpts,
  HttpResponse,
  MetadataProvider,
  StorageAdapter,
} from "@shrimpler/core";
import { Html5VideoPlayerAdapter } from "./players/html5-video";

const STORAGE_PREFIX = "shrimpler:";

// localStorage-backed for now; large datasets (EPG, cache) move to IndexedDB
// per §7.2. TODO(Phase 2): IndexedDB-backed adapter for the iptv/cache modules.
class WebStorageAdapter implements StorageAdapter {
  get<T>(key: string): Promise<T | null> {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    return Promise.resolve(raw === null ? null : (JSON.parse(raw) as T));
  }

  set<T>(key: string, value: T): Promise<void> {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    window.localStorage.removeItem(STORAGE_PREFIX + key);
    return Promise.resolve();
  }

  keys(prefix = ""): Promise<string[]> {
    const result: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key !== null && key.startsWith(STORAGE_PREFIX + prefix)) {
        result.push(key.slice(STORAGE_PREFIX.length));
      }
    }
    return Promise.resolve(result);
  }
}

// fetch-backed; §7.2 notes TV web runtimes have CORS/cert quirks — this class
// is the single place to handle them when Tizen/webOS packaging lands (Phase 3).
class FetchHttpAdapter implements HttpAdapter {
  get(url: string, opts?: HttpOpts): Promise<HttpResponse> {
    return this.request(url, { method: "GET" }, opts);
  }

  post(url: string, body: unknown, opts?: HttpOpts): Promise<HttpResponse> {
    return this.request(
      url,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      },
      opts,
    );
  }

  private async request(
    url: string,
    init: RequestInit & { headers?: Record<string, string> },
    opts?: HttpOpts,
  ): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer =
      opts?.timeoutMs !== undefined
        ? setTimeout(() => controller.abort(), opts.timeoutMs)
        : undefined;
    try {
      const response = await fetch(url, {
        ...init,
        headers: { ...init.headers, ...opts?.headers },
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
  }
}

// TMDB metadata fallback (§5). The key is user-supplied and never committed
// (neutrality, §14.3): in dev it comes from a git-ignored .env
// (VITE_TMDB_API_KEY, see .env.example); the settings-screen UI to enter/persist
// a key lands with the detail screen (its first consumer). Absent key → no
// provider → the app still runs on addon meta alone.
function metadataProviders(http: HttpAdapter): MetadataProvider[] {
  const apiKey = import.meta.env.VITE_TMDB_API_KEY;
  return apiKey === undefined || apiKey === ""
    ? []
    : [new TmdbProvider({ http, apiKey })];
}

// Async because the addon engine loads persisted state at startup (see
// createCore / createAddonEngine). The shell awaits this before first render.
export function createWebCore(): Promise<Core> {
  const http = new FetchHttpAdapter();
  return createCore({
    storage: new WebStorageAdapter(),
    http,
    playerFactory: () => new Html5VideoPlayerAdapter(),
    providers: metadataProviders(http),
    // Seed of the §13.6 debug channel: surface skipped/failed addons in dev
    // without committing to a UI. Raw engine messages stay out of the product
    // UI (ADR-0007); this is the developer console only.
    onError: import.meta.env.DEV
      ? (error) => console.warn("[addon-engine]", error)
      : undefined,
  });
}
