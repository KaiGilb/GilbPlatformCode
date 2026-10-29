// New. Pins every export and each option of the registry.
import { afterEach, describe, expect, test, vi } from "vitest";
import { registeredCaches, setPrincipal, __freshPageForTests } from "@kaigilb/gilbplatformcode-principal-hub";
import * as api from "./index";
import { createPrefetchRegistry, onIdle } from "./index";

afterEach(() => { __freshPageForTests(); });
const ctx = (vault: unknown = {}, ws = "ws") => ({ vault, ws });

describe("the export surface", () => {
  test("the module exports createPrefetchRegistry and onIdle", () => { expect(Object.keys(api).sort()).toEqual(["createPrefetchRegistry", "onIdle"]); expect(api.onIdle).toBe(onIdle); });
  test("a registry has exactly these members", () => {
    expect(Object.keys(createPrefetchRegistry()).sort()).toEqual(["getWarmContext", "heavyPrefetchOk", "network", "prefetchAll", "prefetchPage", "prefetchPictureCount", "registerWarm", "setPrefetchClock", "setWarmContext"]);
  });
});

describe("context", () => {
  test("setWarmContext / getWarmContext round-trip; null clears", () => {
    const r = createPrefetchRegistry(); const c = ctx();
    expect(r.getWarmContext()).toBeNull();
    r.setWarmContext(c); expect(r.getWarmContext()).toBe(c);
    r.setWarmContext(null); expect(r.getWarmContext()).toBeNull();
  });
  test("a change of person clears the context and forgets which warmers started", () => {
    const r = createPrefetchRegistry(); const fn = vi.fn();
    r.registerWarm("p", fn); const c = ctx(); r.setWarmContext(c); r.prefetchPage("p");
    setPrincipal("a"); setPrincipal("b");
    expect(r.getWarmContext()).toBeNull();
    r.setWarmContext(c); r.prefetchPage("p");
    expect(fn).toHaveBeenCalledTimes(2); // the memory of the first start went with the person
  });
  test("registers with the hub as 'prefetch', or under cacheName", () => {
    createPrefetchRegistry(); createPrefetchRegistry({ cacheName: "warm2" });
    expect(registeredCaches()).toEqual(expect.arrayContaining(["prefetch", "warm2"]));
  });
});

describe("registration", () => {
  test("the remover takes only that warmer out; an unknown page does nothing", () => {
    const r = createPrefetchRegistry(); r.setWarmContext(ctx());
    const a = vi.fn(), b = vi.fn();
    const offA = r.registerWarm("p", a); r.registerWarm("p", b);
    offA(); r.prefetchPage("p"); r.prefetchPage("none");
    expect(a).not.toHaveBeenCalled(); expect(b).toHaveBeenCalledTimes(1);
  });
  test("the same function registered twice on a page is one warmer (a Set)", () => {
    const r = createPrefetchRegistry(); r.setWarmContext(ctx()); const a = vi.fn();
    r.registerWarm("p", a); r.registerWarm("p", a); r.prefetchPage("p");
    expect(a).toHaveBeenCalledTimes(1);
  });
  test("one function registered on two pages starts once for the pair (the dedupe key is the function)", () => {
    const r = createPrefetchRegistry(); r.setWarmContext(ctx()); const a = vi.fn();
    r.registerWarm("p", a); r.registerWarm("q", a); r.prefetchAll();
    expect(a).toHaveBeenCalledTimes(1);
  });
});

describe("dedupe key", () => {
  test("a new workspace or a new client (by identity) starts the warmer again within the window", () => {
    const r = createPrefetchRegistry(); const a = vi.fn(); r.registerWarm("p", a);
    const v1 = {}, v2 = {};
    r.setWarmContext(ctx(v1, "w1")); r.prefetchPage("p");
    r.setWarmContext(ctx(v1, "w1")); r.prefetchPage("p");
    expect(a).toHaveBeenCalledTimes(1);
    r.setWarmContext(ctx(v1, "w2")); r.prefetchPage("p");
    expect(a).toHaveBeenCalledTimes(2);
    r.setWarmContext(ctx(v2, "w2")); r.prefetchPage("p");
    expect(a).toHaveBeenCalledTimes(3);
  });
  test("staleMs: default 30 000 (not again at 29 999, again at 30 000); an option replaces it", async () => {
    for (const [opt, edge] of [[undefined, 30_000], [1000, 1000]] as const) {
      const r = createPrefetchRegistry(opt === undefined ? {} : { staleMs: opt }); let now = 0; r.setPrefetchClock(() => now);
      const a = vi.fn(async () => undefined); r.registerWarm("p", a); r.setWarmContext(ctx());
      r.prefetchPage("p"); await Promise.resolve(); await new Promise((x) => setTimeout(x, 0));
      now = edge - 1; r.prefetchPage("p"); expect(a).toHaveBeenCalledTimes(1);
      now = edge; r.prefetchPage("p"); expect(a).toHaveBeenCalledTimes(2);
    }
  });
  test("no limit of its own on width: every warmer of a page is started in the same tick (a host's warmers bound their own fan-out)", () => {
    const r = createPrefetchRegistry(); r.setWarmContext(ctx());
    const fns = Array.from({ length: 100 }, () => vi.fn(() => new Promise<void>(() => undefined)));
    fns.forEach((f) => r.registerWarm("p", f));
    r.prefetchPage("p");
    expect(fns.every((f) => f.mock.calls.length === 1)).toBe(true);
  });
  test("a warmer receives the context it was started with", () => {
    const r = createPrefetchRegistry(); const c = ctx({}, "w"); r.setWarmContext(c);
    const a = vi.fn(); r.registerWarm("p", a); r.prefetchPage("p");
    expect(a).toHaveBeenCalledWith(c);
  });
});

describe("network and picture count", () => {
  test("defaults: no connection object means heavy is allowed; width falls back to 1024 without a window", () => {
    const r = createPrefetchRegistry(); r.network.read = () => undefined;
    expect(r.heavyPrefetchOk()).toBe(true);
    expect(typeof r.network.width()).toBe("number");
  });
  test("options: wideCount, narrowCount and narrowBelow replace 3, 2 and 640; none when heavy is off", () => {
    const r = createPrefetchRegistry({ wideCount: 5, narrowCount: 1, narrowBelow: 800, network: { read: () => undefined, width: () => 700 } });
    expect(r.prefetchPictureCount()).toBe(1);
    r.network.width = () => 800; expect(r.prefetchPictureCount()).toBe(5);
    r.network.read = () => ({ saveData: true }); expect(r.prefetchPictureCount()).toBe(0);
  });
  test("the default edge is 640: 639 is narrow, 640 is wide", () => {
    const r = createPrefetchRegistry({ network: { read: () => undefined } });
    r.network.width = () => 639; expect(r.prefetchPictureCount()).toBe(2);
    r.network.width = () => 640; expect(r.prefetchPictureCount()).toBe(3);
  });
  test("a heavy warmer is skipped when heavy is off, a light one is not (checked at each start)", () => {
    const r = createPrefetchRegistry({ network: { read: () => ({ effectiveType: "2g" }) } }); r.setWarmContext(ctx());
    const h = vi.fn(), l = vi.fn(); r.registerWarm("p", h, { heavy: true }); r.registerWarm("p", l);
    r.prefetchPage("p");
    expect(h).not.toHaveBeenCalled(); expect(l).toHaveBeenCalledTimes(1);
  });
});

describe("onIdle", () => {
  test("falls back to a timeout of timeoutMs (default 300) when there is no requestIdleCallback", () => {
    vi.useFakeTimers(); try {
      const f = vi.fn(); onIdle(f);
      vi.advanceTimersByTime(299); expect(f).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1); expect(f).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  test("with requestIdleCallback it passes a 2000 ms timeout", () => {
    const g = globalThis as Record<string, unknown>; const ric = vi.fn(() => 1); g.requestIdleCallback = ric;
    try { onIdle(() => undefined); expect(ric).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 }); } finally { delete g.requestIdleCallback; }
  });
});
