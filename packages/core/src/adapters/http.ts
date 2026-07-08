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
  /**
   * Send a POST body as `application/x-www-form-urlencoded` instead of JSON.
   * The body is expected to be a `Record<string, string>` (or a pre-encoded
   * string). Some providers (e.g. debrid REST APIs) require form encoding.
   */
  form?: boolean;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}
