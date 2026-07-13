// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from "vitest";
import { RnHttpAdapter } from "./rn-http";

// Locally-typed fetch shapes so the test needs no DOM lib.
interface FakeSignal {
  addEventListener(type: string, cb: () => void): void;
  aborted: boolean;
}
interface FakeInit {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  signal?: FakeSignal;
}
interface FakeResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

function okResponse(body = "ok"): FakeResponse {
  return {
    status: 200,
    ok: true,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve({ ok: true }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("RnHttpAdapter", () => {
  it("GET passes the url, merges headers, and returns status/ok/text", async () => {
    const fetchMock = vi.fn(
      (_url: string, _init: FakeInit): Promise<FakeResponse> =>
        Promise.resolve(okResponse("hi")),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await new RnHttpAdapter().get("http://x/y", {
      headers: { a: "1" },
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hi");
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe("http://x/y");
    expect(call[1].method).toBe("GET");
    expect(call[1].headers?.a).toBe("1");
    expect(call[1].signal).toBeDefined();
  });

  it("form POST url-encodes a record body and sets the form content-type", async () => {
    const fetchMock = vi.fn(
      (_url: string, _init: FakeInit): Promise<FakeResponse> =>
        Promise.resolve(okResponse()),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new RnHttpAdapter().post(
      "http://x",
      { a: "1", b: "two words" },
      { form: true },
    );

    const init = fetchMock.mock.calls[0]![1];
    expect(init.body).toBe("a=1&b=two%20words");
    expect(init.headers?.["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("JSON POST stringifies the body by default", async () => {
    const fetchMock = vi.fn(
      (_url: string, _init: FakeInit): Promise<FakeResponse> =>
        Promise.resolve(okResponse()),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new RnHttpAdapter().post("http://x", { a: 1 });

    const init = fetchMock.mock.calls[0]![1];
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(init.headers?.["content-type"]).toBe("application/json");
  });

  it("aborts the request when timeoutMs elapses", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchMock = vi.fn(
      (_url: string, init: FakeInit): Promise<FakeResponse> =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = new RnHttpAdapter().get("http://x", { timeoutMs: 50 });
    const expectation = expect(promise).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(50);
    await expectation;
    expect(aborted).toBe(true);
  });
});
