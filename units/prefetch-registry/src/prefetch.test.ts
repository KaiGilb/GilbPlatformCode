// Ported from the source app's tester-s1 prefetch tests (P2, P3, P4-as-a-guard, P6, P9), src/p153-s7.test.tsx (onIdle, the registered warmer ONCE and again after the key is old),
// and src/p154-persist.test.tsx ("mobile first prefetch": three tests). Each runs against createPrefetchRegistry; the source app's single registry was a module.
import { afterEach, describe, expect, test, vi } from "vitest";
import { setPrincipal, __freshPageForTests } from "@kaigilb/gilbplatformcode-principal-hub";
import { createPrefetchRegistry, onIdle, type WarmContext } from "./prefetch";

const WORKSPACE = "https://v.example/ws";
const R = createPrefetchRegistry();
afterEach(() => { R.setWarmContext(null); R.setPrefetchClock(() => Date.now()); vi.useRealTimers(); R.network.read = () => undefined; __freshPageForTests(); });
const settle = (ms = 150) => new Promise((x) => setTimeout(x, ms));

describe("one registry, dedup", () => {
  test("P2 the same warmer is not started again while it runs, nor within the stale window; a throwing warmer (sync or async) does not break the caller or the others", async () => {
    let now = 5_000_000; R.setPrefetchClock(() => now);
    R.setWarmContext({ vault: {} as never, ws: WORKSPACE });
    let release!: () => void;
    const slow = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const syncBoom = vi.fn(() => { throw new Error("sync"); });
    const asyncBoom = vi.fn(async () => { throw new Error("async"); });
    const ok = vi.fn();
    const offs = [R.registerWarm("z1", slow), R.registerWarm("z1", syncBoom), R.registerWarm("z1", asyncBoom), R.registerWarm("z1", ok)];
    expect(() => { R.prefetchPage("z1"); R.prefetchPage("z1"); R.prefetchPage("z1"); }).not.toThrow();
    expect([slow, syncBoom, asyncBoom, ok].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1]);
    await settle(5); // the finished warmers are marked done
    now += 60_000; // past the stale window, but slow is still running
    R.prefetchPage("z1");
    expect(slow).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(2);
    release(); await settle(5);
    R.prefetchPage("z1");
    expect(slow).toHaveBeenCalledTimes(2);
    offs.forEach((f) => f());
  });

  test("P3 nothing is warmed with no context, an empty workspace, or after the person changes (context cleared by the hub)", async () => {
    const fn = vi.fn();
    const off = R.registerWarm("z2", fn);
    R.prefetchPage("z2"); expect(fn).not.toHaveBeenCalled();
    R.setWarmContext({ vault: {} as never, ws: "" }); R.prefetchPage("z2"); expect(fn).not.toHaveBeenCalled();
    R.setWarmContext({ vault: {} as never, ws: WORKSPACE }); setPrincipal("https://a/vault"); setPrincipal("https://b/vault");
    R.prefetchPage("z2"); expect(fn).not.toHaveBeenCalled();
    off();
  });

  test("a registered warmer runs ONCE for a burst of calls (hover, focus, press), and again only after the key is old; once removed it never runs (p153-s7)", async () => {
    let now = 1_000_000;
    R.setPrefetchClock(() => now);
    R.setWarmContext({ vault: {} as never, ws: WORKSPACE });
    const warmer = vi.fn(async () => undefined);
    const off = R.registerWarm("zz", warmer);
    R.prefetchPage("zz"); R.prefetchPage("zz"); R.prefetchPage("zz");
    expect(warmer).toHaveBeenCalledTimes(1);
    await new Promise((x) => setTimeout(x, 0));
    now += 31_000;
    R.prefetchPage("zz");
    expect(warmer).toHaveBeenCalledTimes(2);
    off();
    now += 31_000;
    R.prefetchPage("zz");
    expect(warmer).toHaveBeenCalledTimes(2);
  });

  test("prefetchAll starts each page's warmers, once even when called again (p153-s7, 'warming every page loads each key once')", async () => {
    R.setWarmContext({ vault: {} as never, ws: WORKSPACE });
    const a = vi.fn(async () => undefined), b = vi.fn(async () => undefined);
    const offs = [R.registerWarm("pa", a), R.registerWarm("pb", b)];
    R.prefetchAll(); R.prefetchAll(); R.prefetchPage("pa"); R.prefetchPage("pb");
    await settle(5);
    expect([a, b].map((f) => f.mock.calls.length)).toEqual([1, 1]);
    offs.forEach((f) => f());
  });
});

describe("idle", () => {
  test("onIdle runs the function once, on idle (timeout fallback here), and can be cancelled (p153-s7)", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    onIdle(fn, 50);
    const gone = vi.fn();
    onIdle(gone, 50)();
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(gone).not.toHaveBeenCalled();
  });

  test("P6 onIdle uses requestIdleCallback when the browser has it, and cancel calls cancelIdleCallback", () => {
    const g = globalThis as Record<string, unknown>;
    const ric = vi.fn((cb: () => void) => { cb(); return 7; }), cic = vi.fn();
    g.requestIdleCallback = ric; g.cancelIdleCallback = cic;
    try {
      const fn = vi.fn();
      const cancel = onIdle(fn);
      expect(ric).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
      cancel();
      expect(cic).toHaveBeenCalledWith(7);
    } finally { delete g.requestIdleCallback; delete g.cancelIdleCallback; }
  });
});

describe("save-data, slow link, small screen", () => {
  test("P9 a heavy warmer is skipped on save-data and on 2g/slow-2g, runs otherwise; light warmers always run", async () => {
    R.setWarmContext({ vault: {} as never, ws: WORKSPACE });
    const heavy = vi.fn(), light = vi.fn();
    const offs = [R.registerWarm("z5", heavy, { heavy: true }), R.registerWarm("z5", light)];
    let t = 1; R.setPrefetchClock(() => (t += 100_000));
    for (const c of [{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) { R.network.read = () => c; R.prefetchPage("z5"); await settle(2); }
    expect(heavy).not.toHaveBeenCalled();
    expect(light).toHaveBeenCalledTimes(3);
    R.network.read = () => ({ effectiveType: "4g" }); expect(R.heavyPrefetchOk()).toBe(true);
    await settle(2); R.prefetchPage("z5");
    expect(heavy).toHaveBeenCalledTimes(1);
    offs.forEach((f) => f());
  });

  test("save-data and a 2g connection skip heavy warmers; light ones still run; the picture count follows (p154-persist)", () => {
    R.setWarmContext({ vault: {} as never, ws: WORKSPACE });
    const heavy = vi.fn(), light = vi.fn();
    const offs = [R.registerWarm("mob", heavy, { heavy: true }), R.registerWarm("mob", light)];
    R.network.read = () => ({ saveData: true, effectiveType: "4g" });
    expect(R.heavyPrefetchOk()).toBe(false);
    expect(R.prefetchPictureCount()).toBe(0);
    R.prefetchPage("mob");
    expect(heavy).not.toHaveBeenCalled();
    expect(light).toHaveBeenCalledTimes(1);
    R.network.read = () => ({ effectiveType: "2g" });
    expect(R.heavyPrefetchOk()).toBe(false);
    R.network.read = () => ({ effectiveType: "slow-2g" });
    expect(R.heavyPrefetchOk()).toBe(false);
    R.network.read = () => ({ effectiveType: "4g", saveData: false });
    expect(R.heavyPrefetchOk()).toBe(true);
    R.network.read = () => undefined; // Safari: nothing is assumed
    expect(R.heavyPrefetchOk()).toBe(true);
    offs.forEach((f) => f());
  });

  test("pictures fetched ahead: 3 on a wide screen, 2 on a phone (p154-persist)", () => {
    R.network.read = () => undefined;
    const w = R.network.width;
    R.network.width = () => 1200; expect(R.prefetchPictureCount()).toBe(3);
    R.network.width = () => 390; expect(R.prefetchPictureCount()).toBe(2);
    R.network.width = w;
  });

  test("a heavy warmer runs when the connection allows it (p154-persist)", () => {
    R.setWarmContext({ vault: {} as never, ws: WORKSPACE });
    const heavy = vi.fn();
    const off = R.registerWarm("mob2", heavy, { heavy: true });
    R.network.read = () => ({ effectiveType: "4g" });
    R.prefetchPage("mob2");
    expect(heavy).toHaveBeenCalledTimes(1);
    off();
  });
});

describe("a context type of the host's own", () => {
  test("warmers receive the host's whole context, not a copy of two members", () => {
    interface Ctx extends WarmContext { principal?: string; extra: number }
    const reg = createPrefetchRegistry<Ctx>();
    const seen: Ctx[] = [];
    const ctx: Ctx = { vault: {}, ws: WORKSPACE, principal: "p", extra: 7 };
    reg.setWarmContext(ctx);
    reg.registerWarm("p", (c) => { seen.push(c); });
    reg.prefetchPage("p");
    expect(seen).toEqual([ctx]);
    expect(seen[0]).toBe(ctx);
  });
});
