// SPDX-License-Identifier: AGPL-3.0-or-later
// RealDebridProvider tests: a route-table HttpAdapter returns canned RD JSON and
// records requests (method/url/body/opts) so we can assert form encoding, the
// Authorization header, file selection, and the cached flag. A route value may
// be an array to return a different body per call (for the info poll). Plain
// Node, no network (§2.2).

import { describe, expect, it } from "vitest";
import type { HttpAdapter, HttpOpts, HttpResponse } from "../adapters/http";
import { RealDebridProvider } from "./real-debrid";

interface RecordedCall {
  method: "GET" | "POST";
  url: string;
  body?: unknown;
  opts?: HttpOpts;
}

function mockHttp(routes: Record<string, unknown>): HttpAdapter & {
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const cursors: Record<string, number> = {};
  const respond = (url: string): Promise<HttpResponse> => {
    const hit = Object.prototype.hasOwnProperty.call(routes, url);
    let body = routes[url];
    if (Array.isArray(body)) {
      const seq = body;
      const i = Math.min(cursors[url] ?? 0, seq.length - 1);
      cursors[url] = (cursors[url] ?? 0) + 1;
      body = seq[i];
    }
    return Promise.resolve({
      status: hit ? 200 : 404,
      ok: hit,
      text: () => Promise.resolve(JSON.stringify(body)),
      json: <T>() => Promise.resolve(body as T),
    });
  };
  return {
    calls,
    get: (url, opts) => {
      calls.push({ method: "GET", url, opts });
      return respond(url);
    },
    post: (url, body, opts) => {
      calls.push({ method: "POST", url, body, opts });
      return respond(url);
    },
  };
}

const TOKEN = "rd-token";
const BASE = "https://api.real-debrid.com/rest/1.0";
const noWait = (): Promise<void> => Promise.resolve();

describe("RealDebridProvider.resolve", () => {
  it("unrestricts a direct hoster url without touching the torrents API", async () => {
    const http = mockHttp({
      [`${BASE}/unrestrict/link`]: { download: "https://dl.real-debrid.com/f.mp4" },
    });
    const rd = new RealDebridProvider({ http, token: TOKEN });

    const result = await rd.resolve({ url: "https://host.example/file" });

    expect(result).toEqual({
      url: "https://dl.real-debrid.com/f.mp4",
      cached: true,
    });
    const post = http.calls.find((c) => c.method === "POST");
    expect(post?.url).toBe(`${BASE}/unrestrict/link`);
    expect(post?.body).toEqual({ link: "https://host.example/file" });
    // Form-encoded + bearer auth on every request.
    expect(post?.opts?.form).toBe(true);
    expect(post?.opts?.headers?.authorization).toBe(`Bearer ${TOKEN}`);
    expect(http.calls.some((c) => c.url.includes("/torrents/"))).toBe(false);
  });

  it("runs the magnet flow, selects the largest video file, and resolves a cached link", async () => {
    const http = mockHttp({
      [`${BASE}/torrents/addMagnet`]: { id: "T1" },
      [`${BASE}/torrents/info/T1`]: [
        {
          id: "T1",
          status: "waiting_files_selection",
          files: [
            { id: 1, path: "/readme.txt", bytes: 100 },
            { id: 2, path: "/movie.720p.mkv", bytes: 900 },
            { id: 3, path: "/movie.1080p.mkv", bytes: 5000 },
          ],
        },
        { id: "T1", status: "downloaded", links: ["https://rd/link/3"] },
      ],
      [`${BASE}/torrents/selectFiles/T1`]: "",
      [`${BASE}/unrestrict/link`]: { download: "https://dl.real-debrid.com/movie.mkv" },
    });
    const rd = new RealDebridProvider({ http, token: TOKEN, wait: noWait });

    const result = await rd.resolve({ infoHash: "ABCDEF" });

    expect(result).toEqual({
      url: "https://dl.real-debrid.com/movie.mkv",
      cached: true,
    });
    // Magnet synthesized from the infoHash.
    const add = http.calls.find((c) => c.url.endsWith("/torrents/addMagnet"));
    expect(add?.body).toEqual({ magnet: "magnet:?xt=urn:btih:ABCDEF" });
    // Largest video file (id 3) selected.
    const select = http.calls.find((c) => c.url.endsWith("/torrents/selectFiles/T1"));
    expect(select?.body).toEqual({ files: "3" });
    // The torrent's link is unrestricted, not the magnet.
    const unrestrict = http.calls.find((c) => c.url.endsWith("/unrestrict/link"));
    expect(unrestrict?.body).toEqual({ link: "https://rd/link/3" });
  });

  it("honours an explicit fileIdx as an index into the file list", async () => {
    const http = mockHttp({
      [`${BASE}/torrents/addMagnet`]: { id: "T2" },
      [`${BASE}/torrents/info/T2`]: [
        {
          id: "T2",
          status: "waiting_files_selection",
          files: [
            { id: 10, path: "/a.mkv", bytes: 100 },
            { id: 20, path: "/b.mkv", bytes: 5000 },
          ],
        },
        { id: "T2", status: "downloaded", links: ["https://rd/link/10"] },
      ],
      [`${BASE}/torrents/selectFiles/T2`]: "",
      [`${BASE}/unrestrict/link`]: { download: "https://dl/a.mkv" },
    });
    const rd = new RealDebridProvider({ http, token: TOKEN, wait: noWait });

    await rd.resolve({ magnet: "magnet:?xt=urn:btih:X", fileIdx: 0 });

    // fileIdx 0 → files[0].id === 10, not the largest (id 20).
    const select = http.calls.find((c) => c.url.endsWith("/torrents/selectFiles/T2"));
    expect(select?.body).toEqual({ files: "10" });
  });

  it("returns null when a torrent never becomes cached (no link within the poll budget)", async () => {
    const http = mockHttp({
      [`${BASE}/torrents/addMagnet`]: { id: "T3" },
      [`${BASE}/torrents/info/T3`]: {
        id: "T3",
        status: "downloading",
        files: [{ id: 1, path: "/movie.mkv", bytes: 5000 }],
        links: [],
      },
      [`${BASE}/torrents/selectFiles/T3`]: "",
    });
    const rd = new RealDebridProvider({
      http,
      token: TOKEN,
      wait: noWait,
      maxPolls: 2,
    });

    expect(await rd.resolve({ infoHash: "Z" })).toBeNull();
  });

  it("returns null when addMagnet fails", async () => {
    const http = mockHttp({});
    const rd = new RealDebridProvider({ http, token: TOKEN, wait: noWait });
    expect(await rd.resolve({ infoHash: "Z" })).toBeNull();
  });

  it("returns null when there is neither a url, magnet, nor infoHash", async () => {
    const http = mockHttp({});
    const rd = new RealDebridProvider({ http, token: TOKEN });
    expect(await rd.resolve({})).toBeNull();
  });
});

describe("RealDebridProvider.checkCached", () => {
  it("reduces instantAvailability to a per-hash boolean map (cached vs empty)", async () => {
    const http = mockHttp({
      [`${BASE}/torrents/instantAvailability/aaa/bbb`]: {
        aaa: { rd: [{ "1": { filename: "x.mkv" } }] },
        bbb: [],
      },
    });
    const rd = new RealDebridProvider({ http, token: TOKEN });

    const cached = await rd.checkCached(["AAA", "BBB"]);
    expect(cached).toEqual({ aaa: true, bbb: false });
  });

  it("returns all-false and never throws when the endpoint fails or is empty", async () => {
    const rd = new RealDebridProvider({ http: mockHttp({}), token: TOKEN });
    expect(await rd.checkCached(["AAA"])).toEqual({ aaa: false });
    expect(await rd.checkCached([])).toEqual({});
  });
});
