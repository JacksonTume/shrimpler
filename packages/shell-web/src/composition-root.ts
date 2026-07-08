// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.3 — the web shell's composition root: wires concrete browser
// adapters into the pure core. This is the only place the shell and core meet.

import { createCore, RealDebridProvider, TmdbProvider } from "@shrimpler/core";
import type {
  Core,
  DebridProvider,
  HttpAdapter,
  HttpOpts,
  HttpResponse,
  MetadataProvider,
  StorageAdapter,
} from "@shrimpler/core";
import {
  REAL_DEBRID_TOKEN_STORAGE_KEY,
  TMDB_API_KEY_STORAGE_KEY,
} from "@shrimpler/shared-ui";
import { Html5VideoPlayerAdapter } from "./players/html5-video";

const STORAGE_PREFIX = "shrimpler:";

/** url-encode a flat string map as an application/x-www-form-urlencoded body. */
function encodeForm(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

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
    // Form-encoded when the caller asks (debrid REST APIs need it); otherwise
    // JSON as before. A Record<string,string> body is url-encoded; a string
    // body is sent as-is (already encoded).
    const init = opts?.form
      ? {
          method: "POST",
          body:
            typeof body === "string"
              ? body
              : encodeForm(body as Record<string, string>),
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
        }
      : {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        };
    return this.request(url, init, opts);
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
// (neutrality, §14.3). A key entered at runtime via the Settings screen is
// persisted through the StorageAdapter and takes precedence; in dev a
// git-ignored .env (VITE_TMDB_API_KEY, see .env.example) is the fallback.
// Because createCore takes providers at construction, applying a new key means
// rebuilding the core (see main.tsx reloadCore). Absent key → no provider →
// the app still runs on addon meta alone.
async function metadataProviders(
  http: HttpAdapter,
  storage: StorageAdapter,
): Promise<MetadataProvider[]> {
  const stored = await storage.get<string>(TMDB_API_KEY_STORAGE_KEY);
  const apiKey = stored ?? import.meta.env.VITE_TMDB_API_KEY;
  return apiKey === undefined || apiKey === ""
    ? []
    : [new TmdbProvider({ http, apiKey })];
}

// Real-Debrid resolver (§6.4, ADR-0013). Like the TMDB key, the token is
// user-supplied and never committed (§14.3): a token entered at runtime via the
// Settings screen is persisted through the StorageAdapter and takes precedence;
// in dev a git-ignored .env (VITE_REALDEBRID_TOKEN) is the fallback. Applying a
// new token rebuilds the core (reloadCore). Absent token → no debrid → the
// stream picker still lists/ranks but torrent resolve is disabled.
async function debridProvider(
  http: HttpAdapter,
  storage: StorageAdapter,
): Promise<DebridProvider | undefined> {
  const stored = await storage.get<string>(REAL_DEBRID_TOKEN_STORAGE_KEY);
  const token = stored ?? import.meta.env.VITE_REALDEBRID_TOKEN;
  return token === undefined || token === ""
    ? undefined
    : new RealDebridProvider({ http, token });
}

// Async because the addon engine loads persisted state at startup (see
// createCore / createAddonEngine) and the TMDB key is read from storage. The
// shell awaits this before first render, and again on each reloadCore.
export async function createWebCore(): Promise<Core> {
  const http = new FetchHttpAdapter();
  const storage = new WebStorageAdapter();
  return createCore({
    storage,
    http,
    playerFactory: () => new Html5VideoPlayerAdapter(),
    providers: await metadataProviders(http, storage),
    debrid: await debridProvider(http, storage),
    // Seed of the §13.6 debug channel: surface skipped/failed addons in dev
    // without committing to a UI. Raw engine messages stay out of the product
    // UI (ADR-0007); this is the developer console only.
    onError: import.meta.env.DEV
      ? (error) => console.warn("[addon-engine]", error)
      : undefined,
  });
}
