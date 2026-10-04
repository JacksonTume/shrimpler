// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.2 — the RN implementation of HttpAdapter, a near-verbatim copy of the
// web shell's FetchHttpAdapter (fetch + AbortController timeout; form-vs-JSON
// POST). The one behavioural win over web: React Native's fetch honors arbitrary
// request headers including User-Agent/Referer (the browser forbids these), so
// header-gated IPTV CDNs that fail on web work on mobile (ADR-0006).

import type { HttpAdapter, HttpOpts, HttpResponse } from "@shrimpler/core";

/** url-encode a flat string map as an application/x-www-form-urlencoded body. */
function encodeForm(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/** The subset of fetch init we build — typed locally to avoid the DOM lib. */
interface RequestInitLite {
  method: string;
  body?: string;
  headers?: Record<string, string>;
}

// A locally-typed view of the global fetch. React Native and @types/node each
// declare `fetch`/`RequestInit` with a differently-typed `signal` (their own vs
// DOM AbortSignal), which makes calling the ambient `fetch` with an
// AbortController signal a type error. Casting to this shape sidesteps that
// clash while keeping the response surface we actually use fully typed.
interface FetchLike {
  (
    url: string,
    init: {
      method: string;
      body?: string;
      headers?: Record<string, string>;
      signal?: unknown;
    },
  ): Promise<{
    status: number;
    ok: boolean;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }>;
}

// Resolved per call (not once at module load) so tests can stub the global.
function currentFetch(): FetchLike {
  return fetch as unknown as FetchLike;
}

export class RnHttpAdapter implements HttpAdapter {
  get(url: string, opts?: HttpOpts): Promise<HttpResponse> {
    return this.request(url, { method: "GET" }, opts);
  }

  post(url: string, body: unknown, opts?: HttpOpts): Promise<HttpResponse> {
    const init: RequestInitLite = opts?.form
      ? {
          method: "POST",
          body:
            typeof body === "string"
              ? body
              : encodeForm(body as Record<string, string>),
          headers: { "content-type": "application/x-www-form-urlencoded" },
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
    init: RequestInitLite,
    opts?: HttpOpts,
  ): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer =
      opts?.timeoutMs !== undefined
        ? setTimeout(() => controller.abort(), opts.timeoutMs)
        : undefined;
    try {
      const response = await currentFetch()(url, {
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
