// @vitest-environment jsdom
// Every export of the unit is pinned here, with the real principal-hub as the host's one other piece.
import { afterEach, describe, expect, test, vi } from "vitest";
import { __freshPageForTests, clearAllCaches, registeredCaches, setPrincipal } from "@kaigilb/gilbplatformcode-principal-hub";
import * as unit from "./index";
import { cacheKey, clearSessionCache, createSessionCache, keyParts, MAX_BYTES, MAX_ENTRIES, sessionCache, STALE_MS } from "./sessionCache";

afterEach(() => { __freshPageForTests(); clearSessionCache(); });

describe("the public surface", () => {
  test("the library entry exports exactly these names", () => {
    expect(Object.keys(unit).sort()).toEqual(["MAX_BYTES", "MAX_ENTRIES", "STALE_MS", "cacheKey", "clearSessionCache", "createSessionCache", "keyParts", "sessionCache"]);
  });
  test("the constants", () => {
    expect(STALE_MS).toBe(30_000);
    expect(MAX_ENTRIES).toBe(200);
    expect(MAX_BYTES).toBe(32 * 1024 * 1024);
  });
  test("a cache made by createSessionCache has exactly these members", () => {
    expect(Object.keys(createSessionCache()).sort()).toEqual(["bytes", "clear", "hydrate", "installFocus", "invalidate", "key", "notifyFocus", "onCommit", "peek", "refresh", "set", "size", "subscribe", "swr", "warm"]);
    expect(createSessionCache().key).toBe(cacheKey);
  });
});

describe("keys carry the person", () => {
  test("cacheKey is principal|workspace|resource, with an empty person when nobody is signed in", () => {
    expect(cacheKey("w", "r")).toBe("|w|r");
    setPrincipal("https://ann.example.test/vault");
    expect(cacheKey("w", "r")).toBe("https://ann.example.test/vault|w|r");
  });
  test("keyParts splits a key and keeps a resource that contains the separator", () => {
    expect(keyParts("p|w|a|b|c")).toEqual({ principal: "p", workspace: "w", resource: "a|b|c" });
    expect(keyParts("")).toEqual({ principal: "", workspace: "", resource: "" });
  });
});

describe("the one cache and the hub", () => {
  test("the singleton registers itself with the hub as sessionCache", () => {
    expect(registeredCaches()).toContain("sessionCache");
  });
  test("a change of person clears the singleton; the same person again does not", async () => {
    setPrincipal("https://ann.example.test/vault");
    const k = cacheKey("w", "topics");
    await sessionCache.swr(k, async () => "Ann's").promise;
    setPrincipal("https://ann.example.test/vault");
    expect(sessionCache.peek(k).data).toBe("Ann's");
    setPrincipal("https://ben.example.test/vault");
    expect(sessionCache.peek(k).data).toBeUndefined();
    expect(sessionCache.size()).toBe(0);
  });
  test("clearAllCaches and clearSessionCache both empty it", async () => {
    const k = cacheKey("w", "x");
    await sessionCache.swr(k, async () => 1).promise;
    clearAllCaches();
    expect(sessionCache.size()).toBe(0);
    await sessionCache.swr(k, async () => 1).promise;
    clearSessionCache();
    expect(sessionCache.size()).toBe(0);
  });
  test("an answer that arrives after the person changed is dropped, for swr and for refresh", async () => {
    setPrincipal("https://ann.example.test/vault");
    const k = cacheKey("w", "late");
    let release!: (v: string) => void;
    const p = sessionCache.swr(k, () => new Promise<string>((r) => { release = r; })).promise;
    setPrincipal("https://ben.example.test/vault");
    release("Ann's secret");
    expect(await p).toBe("Ann's secret"); // its caller still gets it
    expect(sessionCache.peek(k).data).toBeUndefined();
    expect(sessionCache.peek(cacheKey("w", "late")).data).toBeUndefined();
  });
  test("importing the unit does not install a focus listener on the window", async () => {
    const add = vi.spyOn(window, "addEventListener");
    vi.resetModules();
    await import("./sessionCache");
    expect(add.mock.calls.filter(([t]) => t === "focus")).toHaveLength(0);
    add.mockRestore();
  });
});

describe("set, onCommit, hydrate, refresh without a loader, installFocus", () => {
  const rig = () => { let t = 5_000_000; return { cache: createSessionCache({ now: () => t }), advance: (ms: number) => { t += ms; } }; };
  test("set stores a fresh value, tells subscribers and the commit listener, and supersedes a load in flight", async () => {
    const { cache } = rig();
    const k = cacheKey("w", "s");
    const told = vi.fn(), commits = vi.fn();
    cache.subscribe(k, told);
    cache.onCommit(commits);
    let release!: (v: string) => void;
    void cache.swr(k, () => new Promise<string>((r) => { release = r; }));
    cache.set(k, "set-value");
    expect(cache.peek(k)).toMatchObject({ data: "set-value", updating: false });
    expect(commits).toHaveBeenCalledWith(k, "set-value", 5_000_000);
    release("late");
    await new Promise((r) => setTimeout(r, 0));
    expect(cache.peek(k).data).toBe("set-value");
    expect(cache.swr(k, async () => "x").stale).toBe(false);
    expect(told).toHaveBeenCalled();
  });
  test("a commit listener that throws does not break a load; onCommit(undefined) removes it", async () => {
    const { cache } = rig();
    cache.onCommit(() => { throw new Error("listener"); });
    expect(await cache.swr(cacheKey("w", "a"), async () => 1).promise).toBe(1);
    const fn = vi.fn();
    cache.onCommit(fn); cache.onCommit(undefined);
    cache.set(cacheKey("w", "b"), 2);
    expect(fn).not.toHaveBeenCalled();
  });
  test("hydrate puts values in as stale and dated as stored, leaves a key that holds a value alone, and tells subscribers", async () => {
    const { cache } = rig();
    const a = cacheKey("w", "a"), b = cacheKey("w", "b");
    await cache.swr(b, async () => "live").promise;
    const told = vi.fn();
    cache.subscribe(a, told);
    cache.hydrate([{ key: a, value: "disk", at: 123 }, { key: b, value: "disk-b", at: 456 }]);
    expect(cache.peek(a)).toMatchObject({ data: "disk", updatedAt: 123 });
    expect(cache.peek(b).data).toBe("live");
    expect(told).toHaveBeenCalled();
    const l = vi.fn(async () => "fresh");
    const r = cache.swr(a, l);
    expect(r.value).toBe("disk");
    expect(r.stale).toBe(true);
    await r.promise;
    expect(l).toHaveBeenCalledTimes(1);
  });
  test("refresh with no loader and no earlier load rejects with a message naming the resource", async () => {
    const { cache } = rig();
    await expect(cache.refresh(cacheKey("w", "nothing"))).rejects.toThrow("session cache: nothing to refresh for nothing");
  });
  test("a loader that throws at once is an error of the entry, not a throw from swr", async () => {
    const { cache } = rig();
    const k = cacheKey("w", "sync");
    const r = cache.swr(k, () => { throw new Error("sync boom"); });
    await expect(r.promise).rejects.toThrow("sync boom");
    expect((cache.peek(k).error as Error).message).toBe("sync boom");
  });
  test("an entry that fails to size counts as 0 bytes", async () => {
    const { cache } = rig();
    const cyc: Record<string, unknown> = {}; cyc.self = cyc;
    cache.set(cacheKey("w", "cyc"), cyc);
    expect(cache.bytes()).toBe(0);
    cache.set(cacheKey("w", "str"), "abcd");
    expect(cache.bytes()).toBe(6);
  });
  test("installFocus listens to focus and to the page becoming visible, and the remover stops both", async () => {
    const { cache } = rig();
    const k = cacheKey("w", "f");
    await cache.swr(k, async () => "v").promise;
    const off = cache.installFocus(window);
    window.dispatchEvent(new Event("focus"));
    expect(cache.swr(k, async () => "v2").stale).toBe(true);
    await cache.refresh(k, async () => "v3");
    expect(cache.swr(k, async () => "x").stale).toBe(false);
    document.dispatchEvent(new Event("visibilitychange")); // jsdom: visibilityState is "visible"
    expect(cache.swr(k, async () => "v4").stale).toBe(true);
    await cache.refresh(k, async () => "v5");
    off();
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cache.swr(k, async () => "x").stale).toBe(false);
  });
  test("a shown entry is revalidated at once when the tab regains focus", async () => {
    const { cache } = rig();
    const k = cacheKey("w", "shown");
    const load = vi.fn(async () => "v");
    await cache.swr(k, load).promise;
    const off = cache.subscribe(k, () => undefined);
    cache.notifyFocus();
    expect(load).toHaveBeenCalledTimes(2);
    off();
  });
  test("a subscriber's placeholder with no value is removed when it leaves", () => {
    const { cache } = rig();
    const k = cacheKey("w", "ph");
    const off = cache.subscribe(k, () => undefined);
    cache.swr(k, () => new Promise<string>(() => undefined)); // creates the entry
    off();
    expect(cache.size()).toBe(1); // in flight: kept
    const k2 = cacheKey("w", "ph2");
    const off2 = cache.subscribe(k2, () => undefined);
    cache.peek(k2);
    off2();
    expect(cache.size()).toBe(1);
  });
});
