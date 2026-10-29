// @vitest-environment jsdom
// The session cache (no React). The clock is injected, loads are held by hand, so each rule is tested on its own.
import { describe, expect, test, vi } from "vitest";
import { cacheKey, createSessionCache, STALE_MS } from "./sessionCache";

function rig(o: Parameters<typeof createSessionCache>[0] = {}) {
  let t = 1_000_000;
  const cache = createSessionCache({ now: () => t, ...o });
  const advance = (ms: number) => { t += ms; };
  /** A loader whose answers the test releases, and which counts its starts. */
  function loader<T>(...answers: T[]) {
    const waiting: Array<{ resolve: (v: T) => void; reject: (e: unknown) => void }> = [];
    let n = 0;
    const fn = vi.fn(() => new Promise<T>((resolve, reject) => { waiting.push({ resolve, reject }); n++; }));
    return { fn, release: (i = waiting.length - 1, v?: T) => waiting[i]!.resolve(v ?? answers[Math.min(i, answers.length - 1)]!), fail: (e: unknown, i = waiting.length - 1) => waiting[i]!.reject(e), started: () => n };
  }
  const instant = <T>(v: T) => vi.fn(async () => v);
  return { cache, advance, loader, instant };
}
const K = cacheKey("https://a.example/vault", "drafts");
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("swr", () => {
  test("a miss loads and returns no value; the next call returns the cached value at once", async () => {
    const { cache, instant } = rig();
    const load = instant("one");
    const first = cache.swr(K, load);
    expect(first.value).toBeUndefined();
    expect(await first.promise).toBe("one");
    const second = cache.swr(K, load);
    expect(second.value).toBe("one"); // synchronously, before any await
    expect(second.stale).toBe(false);
    expect(load).toHaveBeenCalledTimes(1); // fresh: no second load
  });

  test("a value older than STALE_MS is returned at once and revalidated once in the background", async () => {
    const { cache, advance } = rig();
    await cache.swr(K, async () => "old").promise;
    advance(STALE_MS + 1);
    const next = vi.fn(async () => "new");
    const r = cache.swr(K, next);
    expect(r.value).toBe("old");
    expect(r.stale).toBe(true);
    expect(await r.promise).toBe("new");
    expect(cache.peek(K).data).toBe("new");
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("N concurrent gets of a stale or missing key start ONE load", async () => {
    const { cache, loader } = rig();
    const l = loader("v");
    const ps = Array.from({ length: 8 }, () => cache.swr(K, l.fn).promise);
    expect(l.started()).toBe(1);
    l.release();
    expect(await Promise.all(ps)).toEqual(Array(8).fill("v"));
    expect(l.fn).toHaveBeenCalledTimes(1);
  });

  test("an error keeps the last good value and exposes the error; the next use tries again", async () => {
    const { cache, advance } = rig();
    await cache.swr(K, async () => "good").promise;
    advance(STALE_MS + 1);
    const boom = new Error("platform down");
    const r = cache.swr(K, async () => { throw boom; });
    expect(await r.promise).toBe("good"); // a failed revalidation still answers with the value the person was shown
    const s = cache.peek<string>(K);
    expect(s.data).toBe("good");
    expect(s.error).toBe(boom);
    expect(s.updating).toBe(false);
    const ok = vi.fn(async () => "better");
    await cache.swr(K, ok).promise;
    expect(ok).toHaveBeenCalledTimes(1); // the failed load did not make the entry fresh
    expect(cache.peek(K).error).toBeUndefined();
  });

  test("a miss that fails rejects its caller and exposes the error with no value", async () => {
    const { cache } = rig();
    await expect(cache.swr(K, async () => { throw new Error("x"); }).promise).rejects.toThrow("x");
    expect(cache.peek(K).data).toBeUndefined();
    expect((cache.peek(K).error as Error).message).toBe("x");
  });
});

describe("refresh and invalidate", () => {
  test("refresh ALWAYS loads, even when the value is fresh, and with no loader reuses the last one", async () => {
    const { cache } = rig();
    let n = 0;
    const load = vi.fn(async () => `v${++n}`);
    await cache.swr(K, load).promise;
    expect(await cache.refresh(K)).toBe("v2");
    expect(await cache.refresh(K, load)).toBe("v3");
    expect(load).toHaveBeenCalledTimes(3);
    expect(cache.peek(K).data).toBe("v3");
  });

  test("a refresh is not joined to a load that began before it: the newest load wins, an older answer arriving late is dropped", async () => {
    const { cache, loader } = rig();
    const l = loader("before-write", "after-write");
    const early = cache.swr(K, l.fn).promise;
    const late = cache.refresh(K, l.fn);
    expect(l.started()).toBe(2);
    l.release(1);
    await late;
    l.release(0);
    await early;
    expect(cache.peek(K).data).toBe("after-write");
  });

  test("invalidate keeps the value, makes it stale, and the next swr revalidates; a prefix key reaches every resource of a workspace", async () => {
    const { cache, instant } = rig();
    const a = cacheKey("https://a.example/vault", "drafts"), b = cacheKey("https://a.example/vault", "topics"), c = cacheKey("https://b.example/vault", "drafts");
    for (const k of [a, b, c]) await cache.swr(k, async () => "x").promise;
    cache.invalidate(a);
    expect(cache.peek(a).data).toBe("x");
    const la = instant("y");
    const r = cache.swr(a, la);
    expect(r.value).toBe("x");
    expect(r.stale).toBe(true);
    await r.promise;
    expect(la).toHaveBeenCalledTimes(1);
    cache.invalidate(`${cacheKey("https://a.example/vault", "")}*`); // every key of that workspace (the key starts with the person, then the workspace)
    expect(cache.swr(b, instant("z")).stale).toBe(true);
    expect(cache.swr(c, instant("z")).stale).toBe(false);
  });

  test("an UNSHOWN entry's load in flight when it is invalidated cannot make it fresh", async () => {
    const { cache, loader } = rig();
    const l = loader("stale-answer");
    void cache.swr(K, l.fn);
    cache.invalidate(K);
    l.release(0);
    await flush();
    expect(cache.peek(K).data).toBeUndefined(); // the pre-invalidation answer was dropped
  });

  test("a SHOWN entry is revalidated at once; invalidations while it loads cost ONE more load, started when the first ends", async () => {
    const { cache, loader, instant } = rig();
    const idle = instant("v");
    await cache.swr(K, idle).promise;
    const l = loader("a", "b");
    const off = cache.subscribe(K, () => undefined);
    cache.invalidate(K);
    expect(l.started()).toBe(0); // no loader of the test's yet: the entry's own loader (idle) ran
    expect(idle).toHaveBeenCalledTimes(2);
    off();
    const m = rig();
    const l2 = m.loader("first", "second");
    const off2 = m.cache.subscribe(K, () => undefined);
    void m.cache.swr(K, l2.fn);
    m.cache.invalidate(K);
    m.cache.invalidate(K);
    m.cache.invalidate(K);
    expect(l2.started()).toBe(1);
    l2.release(0);
    await flush();
    expect(l2.started()).toBe(2);
    l2.release(1);
    await flush();
    expect(m.cache.peek(K).data).toBe("second");
    off2();
  });
});

describe("subscribers, warm, focus", () => {
  test("subscribers are told when loading starts, when the value lands, and on an error; unsubscribe stops it", async () => {
    const { cache, loader } = rig();
    const l = loader("v");
    const states: string[] = [];
    const off = cache.subscribe(K, () => { const s = cache.peek(K); states.push(`${s.updating ? "updating" : "idle"}:${String(s.data)}`); });
    const p = cache.swr(K, l.fn).promise;
    l.release();
    await p;
    expect(states).toEqual(["updating:undefined", "idle:v"]);
    off();
    await cache.refresh(K, async () => "w");
    expect(states).toHaveLength(2);
  });

  test("warm loads once for many callers, never throws, and does nothing for a fresh value", async () => {
    const { cache, loader, instant } = rig();
    const l = loader("w");
    const a = cache.warm(K, l.fn), b = cache.warm(K, l.fn);
    expect(l.started()).toBe(1);
    l.release();
    await Promise.all([a, b]);
    const again = instant("no");
    await cache.warm(K, again);
    expect(again).not.toHaveBeenCalled();
    await expect(cache.warm(cacheKey("w", "bad"), async () => { throw new Error("x"); })).resolves.toBeUndefined();
  });

  test("a value loaded before the tab regained focus is revalidated on its next use, though young; one loaded after is not", async () => {
    const { cache, instant } = rig();
    await cache.swr(K, async () => "v").promise;
    expect(cache.swr(K, instant("x")).stale).toBe(false);
    cache.notifyFocus();
    const l = instant("v2");
    const r = cache.swr(K, l);
    expect(r.stale).toBe(true);
    expect(r.value).toBe("v");
    await r.promise;
    expect(l).toHaveBeenCalledTimes(1);
    expect(cache.swr(K, instant("x")).stale).toBe(false);
  });

  test("the window's focus event reaches notifyFocus", async () => {
    const { cache, instant } = rig();
    const off = cache.installFocus(window);
    await cache.swr(K, async () => "v").promise;
    window.dispatchEvent(new Event("focus"));
    expect(cache.swr(K, instant("x")).stale).toBe(true);
    off();
  });
});

describe("workspace switch and bounds", () => {
  test("clear drops every entry, tells subscribers, and a load in flight cannot put its answer back", async () => {
    const { cache, loader } = rig();
    const l = loader("late");
    await cache.swr(K, async () => "v").promise;
    const hits = vi.fn();
    cache.subscribe(K, hits);
    const other = cacheKey("https://a.example/vault", "topics");
    void cache.swr(other, l.fn);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.peek(K).data).toBeUndefined();
    expect(hits).toHaveBeenCalled();
    l.release();
    await flush();
    expect(cache.peek(other).data).toBeUndefined();
  });

  test("the entry bound evicts the least recently used, never one in flight or shown", async () => {
    const { cache, loader } = rig({ maxEntries: 3 });
    const keys = ["a", "b", "c"].map((r) => cacheKey("w", r));
    for (const k of keys) await cache.swr(k, async () => k).promise;
    cache.peek(keys[0]!); // a is now the most recently used
    const shown = vi.fn();
    cache.subscribe(keys[1]!, shown); // b is shown: it stays
    await cache.swr(cacheKey("w", "d"), async () => "d").promise;
    expect(cache.size()).toBe(3);
    expect(cache.peek(keys[0]!).data).toBe(keys[0]);
    expect(cache.peek(keys[1]!).data).toBe(keys[1]);
    expect(cache.peek(keys[2]!).data).toBeUndefined(); // the least recently used went
    const l = loader("x");
    void cache.swr(cacheKey("w", "e"), l.fn); // in flight
    await cache.swr(cacheKey("w", "f"), async () => "f").promise;
    expect(cache.peek(cacheKey("w", "e")).updating).toBe(true);
  });

  test("the byte bound evicts too", async () => {
    const { cache } = rig({ maxBytes: 100, sizeOf: (v) => String(v).length });
    for (const r of ["a", "b", "c"]) await cache.swr(cacheKey("w", r), async () => r.repeat(60)).promise;
    expect(cache.bytes()).toBeLessThanOrEqual(100);
    expect(cache.size()).toBe(1);
    expect(cache.peek(cacheKey("w", "c")).data).toBe("c".repeat(60)); // the one just written is kept
  });
});
