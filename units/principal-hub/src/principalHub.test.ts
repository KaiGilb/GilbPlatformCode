// The hub on its own. The first two blocks are ported from the source app's test of its hub (the
// "one hub, every cache registered" block: the clear on a change of person, and a cache that throws);
// the rest pin every export and the late-answer guard.
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  __freshPageForTests,
  clearAllCaches,
  currentPrincipal,
  guardLate,
  principalGuard,
  principalVersion,
  registerCache,
  registeredCaches,
  setPrincipal,
} from "./index";

const ANN = "https://ann.example.test/vault";
const BEN = "https://ben.example.test/vault";

afterEach(() => {
  setPrincipal(null);
  for (const n of registeredCaches()) registerCache(n, () => undefined);
});

describe("one hub, every cache registered (ported)", () => {
  test("setPrincipal clears everything for another person, for 'nobody', and for the first person after nobody; the same person again changes nothing", () => {
    const cleared = vi.fn();
    registerCache("probe", cleared);
    setPrincipal(ANN);
    expect(cleared).toHaveBeenCalledTimes(1); // nobody -> Ann
    setPrincipal(ANN);
    expect(cleared).toHaveBeenCalledTimes(1);
    setPrincipal(BEN); // Ann -> Ben, no sign-out between
    expect(cleared).toHaveBeenCalledTimes(2);
    setPrincipal(null); // sign-out
    expect(cleared).toHaveBeenCalledTimes(3);
    setPrincipal(BEN); // nobody -> Ben
    expect(cleared).toHaveBeenCalledTimes(4);
    expect(currentPrincipal()).toBe(BEN);
  });

  test("a cache that throws does not stop the others", () => {
    const after = vi.fn();
    registerCache("a-bad", () => { throw new Error("boom"); });
    registerCache("z-after", after);
    expect(() => clearAllCaches()).not.toThrow();
    expect(after).toHaveBeenCalled();
  });
});

describe("the exports", () => {
  test("a clearer is told who comes next, including null", () => {
    const told: Array<string | null> = [];
    registerCache("probe", (next) => told.push(next));
    setPrincipal(ANN);
    setPrincipal(null);
    expect(told).toEqual([ANN, null]);
  });

  test("registering a name again replaces its clearer, and registeredCaches lists names once", () => {
    const first = vi.fn();
    const second = vi.fn();
    registerCache("same", first);
    registerCache("same", second);
    expect(registeredCaches().filter((n) => n === "same")).toEqual(["same"]);
    clearAllCaches();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("currentPrincipal starts null and follows setPrincipal", () => {
    expect(currentPrincipal()).toBeNull();
    setPrincipal(ANN);
    expect(currentPrincipal()).toBe(ANN);
  });

  test("principalVersion goes up on each clear and stays on a repeat of the same person", () => {
    const v0 = principalVersion();
    setPrincipal(ANN);
    expect(principalVersion()).toBe(v0 + 1);
    setPrincipal(ANN);
    expect(principalVersion()).toBe(v0 + 1);
    clearAllCaches();
    expect(principalVersion()).toBe(v0 + 2);
  });

  test("clearAllCaches with no argument tells the clearers the current person", () => {
    const told: Array<string | null> = [];
    registerCache("probe", (next) => told.push(next));
    setPrincipal(ANN);
    told.length = 0;
    clearAllCaches();
    expect(told).toEqual([ANN]);
  });

  test("clearAllCaches(next) passes next on", () => {
    const told: Array<string | null> = [];
    registerCache("probe", (next) => told.push(next));
    clearAllCaches(BEN);
    expect(told).toEqual([BEN]);
  });

  test("__freshPageForTests forgets the person without clearing, and bumps the version", () => {
    const cleared = vi.fn();
    registerCache("probe", cleared);
    setPrincipal(ANN);
    cleared.mockClear();
    const v = principalVersion();
    __freshPageForTests();
    expect(currentPrincipal()).toBeNull();
    expect(cleared).not.toHaveBeenCalled();
    expect(principalVersion()).toBe(v + 1);
    setPrincipal(ANN); // the first person after nobody, as at a reload
    expect(cleared).toHaveBeenCalledTimes(1);
  });
});

describe("a late answer (two people)", () => {
  test("principalGuard: Ann's answer that arrives after setPrincipal(Ben) is dropped", async () => {
    setPrincipal(ANN);
    const cache = new Map<string, string>();
    registerCache("cache", () => cache.clear());
    const alive = principalGuard();
    let arrive: (v: string) => void = () => undefined;
    const load = new Promise<string>((r) => { arrive = r; });
    const done = load.then((v) => { if (alive()) cache.set("k", v); });
    setPrincipal(BEN);
    arrive("ann-secret");
    await done;
    expect(cache.size).toBe(0);
  });

  test("principalGuard stays true while the person does not change", () => {
    setPrincipal(ANN);
    const alive = principalGuard();
    setPrincipal(ANN);
    expect(alive()).toBe(true);
    clearAllCaches();
    expect(alive()).toBe(false);
  });

  test("guardLate lands the value for the person who asked, and returns it either way", async () => {
    setPrincipal(ANN);
    const landed: string[] = [];
    expect(await guardLate(Promise.resolve("a"), (v) => landed.push(v))).toBe("a");
    expect(landed).toEqual(["a"]);
  });

  test("guardLate does not land Ann's value after Ben came, but still returns it", async () => {
    setPrincipal(ANN);
    const landed: string[] = [];
    let arrive: (v: string) => void = () => undefined;
    const p = guardLate(new Promise<string>((r) => { arrive = r; }), (v) => landed.push(v));
    setPrincipal(BEN);
    arrive("ann-secret");
    expect(await p).toBe("ann-secret");
    expect(landed).toEqual([]);
  });
});
