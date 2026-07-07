// SPDX-License-Identifier: AGPL-3.0-or-later
// Spec §7.2 — HttpAdapter. The single place to handle TV web-runtime CORS/cert quirks.
// Core performs no fetch directly; shells inject an implementation.

export interface HttpAdapter {
  get(url: string, opts?: HttpOpts): Promise<HttpResponse>;
  post(url: string, body: unknown, opts?: HttpOpts): Promise<HttpResponse>;
}

export interface HttpOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}
