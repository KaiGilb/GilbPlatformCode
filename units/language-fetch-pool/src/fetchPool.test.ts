// Ported whole from the source's `fetchPool.s8fix.test.ts` (6 cases); the import is the unit's own file.
import { afterEach, describe, expect, it, vi } from "vitest";
import { __poolActive, __resetFetchPool, FetchTimeoutError, LANGUAGE_FETCH_PARALLEL, pooledGet } from "./index";

afterEach(() => {
  __resetFetchPool();
  vi.useRealTimers();
});

describe("the pool", () => {
  it("🔴 never has more than 8 reads in flight, and every read still completes", async () => {
    expect(LANGUAGE_FETCH_PARALLEL).toBe(8);
    let inFlight = 0;
    let peak = 0;
    const fetchFn = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return new Response("ok");
    });
    const all = await Promise.all(
      Array.from({ length: 160 }, (_, i) => pooledGet(`https://x.example/${i}`, {}, (r) => r.text(), { fetchFn: fetchFn as unknown as typeof fetch })),
    );
    expect(all).toHaveLength(160);
    expect(peak).toBe(8);
    expect(fetchFn).toHaveBeenCalledTimes(160);
    expect(__poolActive()).toBe(0);
  });

  it("a read that fails frees its place for the next one", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/bad")) throw new TypeError("network");
      return new Response("ok");
    });
    const f = fetchFn as unknown as typeof fetch;
    const bad = Array.from({ length: 10 }, () => pooledGet("https://x.example/bad", {}, (r) => r.text(), { fetchFn: f }).catch(() => "failed"));
    const good = pooledGet("https://x.example/good", {}, (r) => r.text(), { fetchFn: f });
    expect(await good).toBe("ok");
    expect(await Promise.all(bad)).toEqual(Array(10).fill("failed"));
    expect(__poolActive()).toBe(0);
  });
});

describe("the timeout", () => {
  it("🔴 a read that never answers is given up after the time, says so, and frees its place", async () => {
    const hang = vi.fn((_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("a", "AbortError")))));
    const started = Date.now();
    await expect(pooledGet("https://x.example/hang", {}, (r) => r.text(), { fetchFn: hang as unknown as typeof fetch, timeoutMs: 40 })).rejects.toBeInstanceOf(FetchTimeoutError);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(__poolActive()).toBe(0);
  });

  it("🔴 eight reads that hang do not hold back a ninth: each is given up on its own clock", async () => {
    const f = vi.fn((url: RequestInfo | URL, init?: RequestInit) =>
      String(url).includes("hang")
        ? new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("a", "AbortError"))))
        : Promise.resolve(new Response("fine")),
    ) as unknown as typeof fetch;
    const hung = Array.from({ length: 8 }, (_, i) => pooledGet(`https://x.example/hang${i}`, {}, (r) => r.text(), { fetchFn: f, timeoutMs: 60 }).catch((e) => e));
    const ninth = pooledGet("https://x.example/ok", {}, (r) => r.text(), { fetchFn: f, timeoutMs: 60 });
    expect(await ninth).toBe("fine");
    for (const e of await Promise.all(hung)) expect(e).toBeInstanceOf(FetchTimeoutError);
  });

  it("the clock starts when the read STARTS, not when it joins the queue", async () => {
    // 9 reads of 50 ms each, a timeout of 80 ms: the ninth waits ~50 ms for a place, then takes 50 ms. It must not time out.
    const f = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return new Response("ok");
    }) as unknown as typeof fetch;
    const all = await Promise.all(Array.from({ length: 9 }, (_, i) => pooledGet(`https://x.example/${i}`, {}, (r) => r.text(), { fetchFn: f, timeoutMs: 80 })));
    expect(all).toEqual(Array(9).fill("ok"));
  });

  it("a body that stalls half-way is also given up (the limit covers the reading of the body)", async () => {
    const f = vi.fn(async () => new Response(new ReadableStream({ start() { /* never enqueues, never closes */ } }))) as unknown as typeof fetch;
    await expect(pooledGet("https://x.example/stall", {}, (r) => r.text(), { fetchFn: f, timeoutMs: 40 })).rejects.toBeInstanceOf(FetchTimeoutError);
  });
});

describe("an aborted ask", () => {
  it("new: a signal that is already aborted ends in an AbortError and makes no request", async () => {
    const fetchFn = vi.fn(async () => new Response("ok"));
    const ctl = new AbortController();
    ctl.abort();
    await expect(pooledGet("https://x.example/a", { signal: ctl.signal }, (r) => r.text(), { fetchFn: fetchFn as unknown as typeof fetch })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(__poolActive()).toBe(0);
  });
});
