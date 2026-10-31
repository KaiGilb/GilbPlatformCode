// @vitest-environment jsdom
// LoadContext.preview (0.2.0): a loader shows an early, partial value for an entry that holds none yet. The clock is injected and each load is held by hand.
import { afterEach, describe, expect, test, vi } from "vitest";
import { __freshPageForTests, registerCache, setPrincipal } from "@kaigilb/gilbplatformcode-principal-hub";
import { cacheKey, createSessionCache, STALE_MS, type LoadContext } from "./sessionCache";

afterEach(() => { __freshPageForTests(); });

function rig() {
  let t = 1_000_000;
  const cache = createSessionCache({ now: () => t });
  const advance = (ms: number) => { t += ms; };
  /** A loader that is handed its context, and answers when the test says. */
  function held<T>() {
    const ctxs: Array<LoadContext<T> | undefined> = [];
    const waiting: Array<{ resolve: (v: T) => void; reject: (e: unknown) => void }> = [];
    const fn = vi.fn((ctx?: LoadContext<T>) => new Promise<T>((resolve, reject) => { ctxs.push(ctx); waiting.push({ resolve, reject }); }));
    return { fn, ctx: (i = ctxs.length - 1) => ctxs[i]!, answer: (v: T, i = waiting.length - 1) => waiting[i]!.resolve(v), fail: (e: unknown, i = waiting.length - 1) => waiting[i]!.reject(e) };
  }
  return { cache, advance, held };
}
const K = cacheKey("https://a.example/vault", "entries");
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("preview shows a partial value", () => {
  test("data is the preview with partial:true, updating:true and NO updatedAt; the snapshot is one stable object until something changes", async () => {
    const { cache, held } = rig();
    const l = held<number[]>();
    void cache.swr(K, l.fn).promise.catch(() => undefined);
    expect(cache.peek(K).partial).toBeUndefined();
    l.ctx().preview([1, 2]);
    const a = cache.peek<number[]>(K);
    expect(a).toEqual({ data: [1, 2], updating: true, error: undefined, updatedAt: undefined, partial: true });
    expect(cache.peek(K)).toBe(a);
    l.ctx().preview([1, 2, 3]);
    const b = cache.peek<number[]>(K);
    expect(b).not.toBe(a);
    expect(b.data).toEqual([1, 2, 3]);
    expect(b.updatedAt).toBeUndefined();
  });

  test("subscribers are told of each preview", async () => {
    const { cache, held } = rig();
    const l = held<number[]>();
    const told = vi.fn();
    cache.subscribe(K, told);
    void cache.swr(K, l.fn).promise.catch(() => undefined);
    const before = told.mock.calls.length;
    l.ctx().preview([1]);
    l.ctx().preview([1, 2]);
    expect(told.mock.calls.length - before).toBe(2);
  });

  test("a preview made before the loader has returned is published with the load (updating:true, partial:true), once", () => {
    const { cache } = rig();
    const told = vi.fn();
    cache.subscribe(K, told);
    void cache.swr(K, (ctx) => { ctx!.preview(["early"]); return new Promise<string[]>(() => undefined); });
    expect(cache.peek(K)).toEqual({ data: ["early"], updating: true, error: undefined, updatedAt: undefined, partial: true });
    expect(told).toHaveBeenCalledTimes(1);
  });

  test("a preview is not a commit: onCommit is not called, the entry is not fresh (a second swr joins the load), and the answer then commits once", async () => {
    const { cache, held } = rig();
    const committed = vi.fn();
    cache.onCommit(committed);
    const l = held<number[]>();
    const first = cache.swr(K, l.fn);
    l.ctx().preview([1]);
    const second = cache.swr(K, l.fn);
    expect(second.value).toBeUndefined();
    expect(second.stale).toBe(false);
    expect(l.fn).toHaveBeenCalledTimes(1);
    expect(committed).not.toHaveBeenCalled();
    l.answer([1, 2, 3]);
    await first.promise;
    expect(committed).toHaveBeenCalledTimes(1);
    expect(committed.mock.calls[0]![1]).toEqual([1, 2, 3]);
  });

  test("a preview is not counted in bytes and does not evict anything", async () => {
    const { cache, held } = rig();
    const l = held<string>();
    void cache.swr(K, l.fn).promise.catch(() => undefined);
    l.ctx().preview("x".repeat(5000));
    expect(cache.bytes()).toBe(0);
  });
});

describe("a preview that must do nothing", () => {
  test("after set(key, v): the value stands, no partial, and the load's answer does not replace it either", async () => {
    const { cache, held } = rig();
    const l = held<string>();
    void cache.swr(K, l.fn).promise.catch(() => undefined);
    l.ctx().preview("early");
    cache.set(K, "set");
    expect(cache.peek(K)).toMatchObject({ data: "set", updating: false });
    expect(cache.peek(K).partial).toBeUndefined();
    l.ctx().preview("late");
    expect(cache.peek(K).data).toBe("set");
    expect(cache.peek(K).partial).toBeUndefined();
  });

  test("after invalidate supersedes the load: the preview is gone and a late one is ignored", async () => {
    const { cache, held } = rig();
    const l = held<string>();
    void cache.swr(K, l.fn).promise.catch(() => undefined);
    l.ctx().preview("early");
    cache.invalidate(K);
    expect(cache.peek(K)).toMatchObject({ data: undefined, updating: false });
    l.ctx().preview("late");
    expect(cache.peek(K).data).toBeUndefined();
    expect(cache.peek(K).partial).toBeUndefined();
  });

  test("after clear(): a late preview lands nowhere (the key stays empty)", async () => {
    const { cache, held } = rig();
    const l = held<string>();
    const told = vi.fn();
    cache.subscribe(K, told);
    void cache.swr(K, l.fn).promise.catch(() => undefined);
    l.ctx().preview("early");
    cache.clear();
    const after = told.mock.calls.length;
    l.ctx().preview("late");
    expect(cache.peek(K).data).toBeUndefined();
    expect(cache.size()).toBe(0);
    expect(told.mock.calls.length).toBe(after); // nobody is told of a preview that landed nowhere
  });

  test("after the load answered: a late preview is ignored", async () => {
    const { cache, held } = rig();
    const l = held<string>();
    const p = cache.swr(K, l.fn).promise;
    l.answer("final");
    await p;
    l.ctx().preview("late");
    expect(cache.peek(K).data).toBe("final");
    expect(cache.peek(K).partial).toBeUndefined();
  });

  test("after the load failed and its preview stayed: a later preview from that load is ignored", async () => {
    const { cache, held } = rig();
    const l = held<string>();
    void cache.swr(K, l.fn).promise.catch(() => undefined);
    l.ctx().preview("early");
    l.fail(new Error("down"));
    await flush();
    l.ctx().preview("later");
    expect(cache.peek(K).data).toBe("early");
  });

  test("an entry that holds a value from disk (hydrate): the revalidation's preview is ignored, so a return visit never shrinks", async () => {
    const { cache, held } = rig();
    cache.hydrate([{ key: K, value: ["a", "b", "c"], at: 1 }]);
    const l = held<string[]>();
    void cache.swr(K, l.fn).promise.catch(() => undefined);
    const told = vi.fn();
    cache.subscribe(K, told);
    l.ctx().preview(["a"]);
    expect(told).not.toHaveBeenCalled();
    expect(cache.peek(K)).toMatchObject({ data: ["a", "b", "c"], updating: true });
    expect(cache.peek(K).partial).toBeUndefined();
  });

  test("an entry that holds a committed value gone stale: the revalidation's preview is ignored", async () => {
    const { cache, held, advance } = rig();
    await cache.swr(K, async () => ["a", "b", "c"]).promise;
    advance(STALE_MS + 1);
    const l = held<string[]>();
    void cache.swr(K, l.fn).promise.catch(() => undefined);
    l.ctx().preview(["a"]);
    expect(cache.peek(K).data).toEqual(["a", "b", "c"]);
    expect(cache.peek(K).partial).toBeUndefined();
  });

  test("a refresh over a value (a write just happened): the preview is ignored, the value stays until the answer", async () => {
    const { cache, held } = rig();
    cache.set(K, ["a", "b", "c"]);
    const l = held<string[]>();
    void cache.refresh(K, l.fn).catch(() => undefined);
    l.ctx().preview(["a"]);
    expect(cache.peek(K).data).toEqual(["a", "b", "c"]);
  });
});

describe("the person", () => {
  test("a preview that arrives after the person changed is dropped, even by a cache that was not cleared", async () => {
    const { cache, held } = rig();
    setPrincipal("https://ann.example.test/vault");
    const keyA = cacheKey("w", "entries");
    const l = held<string>();
    void cache.swr(keyA, l.fn).promise.catch(() => undefined);
    l.ctx().preview("A-early");
    expect(cache.peek(keyA).data).toBe("A-early");
    setPrincipal("https://ben.example.test/vault"); // this cache is not registered with the hub: only the guard can stop what follows
    l.ctx().preview("A-late");
    expect(cache.peek(keyA).data).toBe("A-early");
  });

  test("with the cache registered with the hub: B's key is empty at once, and A's late preview and answer land nowhere", async () => {
    const { cache, held } = rig();
    registerCache("loadContext.test", () => cache.clear());
    setPrincipal("https://ann.example.test/vault");
    const keyA = cacheKey("w", "entries");
    const l = held<string>();
    const pa = cache.swr(keyA, l.fn).promise.catch(() => undefined);
    l.ctx().preview("A-early");
    setPrincipal("https://ben.example.test/vault");
    const keyB = cacheKey("w", "entries");
    expect(keyB).not.toBe(keyA);
    expect(cache.peek(keyB).data).toBeUndefined();
    l.ctx().preview("A-late");
    l.answer("A-final");
    await pa;
    expect(cache.peek(keyB).data).toBeUndefined();
    expect(cache.peek(keyA).data).toBeUndefined();
    expect(cache.size()).toBe(0);
  });
});

describe("the end of a preview", () => {
  test("the commit replaces it: data is the answer, updatedAt is set, and the snapshot has no partial member at all", async () => {
    const { cache, held } = rig();
    const l = held<string[]>();
    const p = cache.swr(K, l.fn).promise;
    l.ctx().preview(["a"]);
    l.answer(["a", "b"]);
    await p;
    const s = cache.peek<string[]>(K);
    expect(s.data).toEqual(["a", "b"]);
    expect(s.updatedAt).toBe(1_000_000);
    expect(s.updating).toBe(false);
    expect("partial" in s).toBe(false);
  });

  test("a failed load keeps the preview with the error, updating:false and partial:true, and stores nothing", async () => {
    const { cache, held } = rig();
    const committed = vi.fn();
    cache.onCommit(committed);
    const l = held<string[]>();
    const p = cache.swr(K, l.fn).promise;
    l.ctx().preview(["a"]);
    const boom = new Error("page 2 failed");
    l.fail(boom);
    await p.catch(() => undefined);
    expect(cache.peek(K)).toEqual({ data: ["a"], updating: false, error: boom, updatedAt: undefined, partial: true });
    expect(committed).not.toHaveBeenCalled();
    expect(cache.bytes()).toBe(0);
  });

  test("the next refresh after a failed load starts with no preview of the older one, and its own preview shows", async () => {
    const { cache, held } = rig();
    const l1 = held<string[]>();
    const p1 = cache.swr(K, l1.fn).promise;
    l1.ctx().preview(["old"]);
    l1.fail(new Error("down"));
    await p1.catch(() => undefined);
    const l2 = held<string[]>();
    const p2 = cache.refresh(K, l2.fn);
    expect(cache.peek(K)).toMatchObject({ data: undefined, updating: true }); // the earlier error stays until the answer, as before 0.2.0
    expect(cache.peek(K).partial).toBeUndefined();
    l2.ctx().preview(["new"]);
    expect(cache.peek(K).data).toEqual(["new"]);
    l2.answer(["new", "newer"]);
    await p2;
    expect(cache.peek(K).data).toEqual(["new", "newer"]);
  });

  test("hydrate on an entry whose failed load left a preview puts the stored value in and drops the preview", async () => {
    const { cache, held } = rig();
    const l = held<string[]>();
    const p = cache.swr(K, l.fn).promise;
    l.ctx().preview(["a"]);
    l.fail(new Error("down"));
    await p.catch(() => undefined);
    cache.hydrate([{ key: K, value: ["a", "b", "c"], at: 5 }]);
    expect(cache.peek(K).data).toEqual(["a", "b", "c"]);
    expect(cache.peek(K).partial).toBeUndefined();
  });

  test("refresh while a load is previewing: two loads, the first one's late previews and answer do not reach the entry, the second is not joined", async () => {
    const { cache, held } = rig();
    const l1 = held<string[]>();
    const p1 = cache.swr(K, l1.fn).promise;
    l1.ctx().preview(["one"]);
    const l2 = held<string[]>();
    const p2 = cache.refresh(K, l2.fn);
    expect(l2.fn).toHaveBeenCalledTimes(1);
    expect(cache.peek(K).data).toBeUndefined(); // the older load's preview is not carried into the new one
    l1.ctx().preview(["one", "late"]);
    expect(cache.peek(K).data).toBeUndefined();
    l2.ctx().preview(["two"]);
    expect(cache.peek(K).data).toEqual(["two"]);
    l1.answer(["one-final"]);
    await p1;
    expect(cache.peek(K)).toMatchObject({ data: ["two"], updating: true, partial: true });
    l2.answer(["two-final"]);
    await p2;
    expect(cache.peek(K).data).toEqual(["two-final"]);
    expect(l1.fn).toHaveBeenCalledTimes(1);
    expect(l2.fn).toHaveBeenCalledTimes(1);
  });
});

describe("a loader that takes no context", () => {
  test("is still a Loader: swr, refresh and warm work as before, and no partial ever shows", async () => {
    const { cache } = rig();
    const plain = vi.fn(async () => "v");
    await cache.swr(K, plain).promise;
    await cache.refresh(K, plain);
    await cache.warm(K + "2", plain);
    expect(cache.peek(K)).toMatchObject({ data: "v", updating: false });
    expect("partial" in cache.peek(K)).toBe(false);
    expect(plain).toHaveBeenCalledTimes(3);
  });
});

describe("hydrate: a copy from the disk that arrives while the first load is running", () => {
  test("an in-flight key with no value takes it (stale, dated as stored, no onCommit); the load is not superseded and its answer replaces it", async () => {
    const { cache, held } = rig();
    const committed = vi.fn();
    cache.onCommit(committed);
    const l = held<string[]>();
    const p = cache.swr(K, l.fn).promise;
    cache.hydrate([{ key: K, value: ["d1", "d2", "d3"], at: 777 }]);
    expect(cache.peek(K)).toEqual({ data: ["d1", "d2", "d3"], updating: true, error: undefined, updatedAt: 777 });
    expect(committed).not.toHaveBeenCalled();
    expect(cache.swr(K, l.fn).value).toEqual(["d1", "d2", "d3"]);
    expect(cache.swr(K, l.fn).stale).toBe(true);
    expect(l.fn).toHaveBeenCalledTimes(1); // joined the running load, no second one
    l.answer(["n1", "n2", "n3", "n4"]);
    await p;
    expect(cache.peek(K)).toMatchObject({ data: ["n1", "n2", "n3", "n4"], updating: false, updatedAt: 1_000_000 });
    expect(committed).toHaveBeenCalledTimes(1);
    expect(committed.mock.calls[0]![1]).toEqual(["n1", "n2", "n3", "n4"]);
  });

  test("subscribers are told of the copy", () => {
    const { cache, held } = rig();
    const l = held<string[]>();
    void cache.swr(K, l.fn).promise.catch(() => undefined);
    const told = vi.fn();
    cache.subscribe(K, told);
    cache.hydrate([{ key: K, value: ["d"], at: 5 }]);
    expect(told).toHaveBeenCalledTimes(1);
  });

  test("an in-flight key that HAS a value is untouched (a disk value never overwrites a newer one)", async () => {
    const { cache, held } = rig();
    cache.set(K, ["new"]);
    const l = held<string[]>();
    void cache.refresh(K, l.fn).catch(() => undefined);
    cache.hydrate([{ key: K, value: ["old-from-disk"], at: 1 }]);
    expect(cache.peek(K)).toMatchObject({ data: ["new"], updating: true, updatedAt: 1_000_000 });
  });

  test("a showing preview is replaced by the copy: partial is gone, updatedAt is the stored date; the load's own later preview is ignored", async () => {
    const { cache, held } = rig();
    const l = held<string[]>();
    void cache.swr(K, l.fn).promise.catch(() => undefined);
    l.ctx().preview(["p1"]);
    expect(cache.peek(K).partial).toBe(true);
    cache.hydrate([{ key: K, value: ["d1", "d2", "d3"], at: 42 }]);
    const s = cache.peek<string[]>(K);
    expect(s.data).toEqual(["d1", "d2", "d3"]);
    expect(s.updatedAt).toBe(42);
    expect("partial" in s).toBe(false);
    expect(s.updating).toBe(true);
    l.ctx().preview(["p1", "p2"]);
    expect(cache.peek(K).data).toEqual(["d1", "d2", "d3"]);
  });
});
