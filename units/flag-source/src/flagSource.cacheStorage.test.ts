// Ported whole from the source's `countryFlags.cacheStorage.test.ts` (5 cases); the import is the unit's own entry.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetFlags, FLAG_TTL_MS, readFlag, setFlagSource, setFlagStore, type FlagSource } from "./index";

const NORWAY = "https://geo.example.test/base/e/osm-r-2978650";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#ba0c2f" d="M0 0h640v480H0z"/></svg>';
const SVG_NEW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#00205b" d="M0 0h640v480H0z"/></svg>';
const KEY = `https://flag-cache.invalid/${encodeURIComponent(NORWAY)}`;

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  return {
    stores,
    open: async (name: string) => {
      const m = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, m);
      return {
        match: async (k: string) => m.get(k)?.clone(),
        put: async (k: string, r: Response) => void m.set(k, r.clone()),
        delete: async (k: string) => m.delete(k),
      };
    },
  };
}
const kept = (c: ReturnType<typeof fakeCaches>, flag: unknown) =>
  void c.stores.set("gilb-flags-v1", new Map([[KEY, new Response(JSON.stringify(flag), { headers: { "content-type": "application/json" } })]]));

let caches: ReturnType<typeof fakeCaches>;

describe("the device flag store (Cache Storage adapter)", () => {
  beforeEach(() => {
    caches = fakeCaches();
    vi.stubGlobal("caches", caches);
    __resetFlags();
    setFlagStore(undefined as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setFlagSource(null);
    setFlagStore(null);
  });

  it("a flag read once is not read again after the page's memory is gone (a reload)", async () => {
    const read = vi.fn(async () => ({ svg: SVG, code: "no" }));
    const source: FlagSource = { read };
    setFlagSource(source);
    expect((await readFlag(NORWAY))?.code).toBe("no");
    expect(read).toHaveBeenCalledTimes(1);
    __resetFlags(); // what a reload does: the session memory goes, the device store stays
    expect((await readFlag(NORWAY))?.svg).toBe(SVG);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("🔴 a picture cut short that an older build kept is ⛔ trusted no more: it is read again", async () => {
    kept(caches, { svg: SVG.slice(0, 80), code: "no", savedAt: Date.now() });
    const read = vi.fn(async () => ({ svg: SVG_NEW, code: "no" }));
    setFlagSource({ read });
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_NEW);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("🔴 a flag kept longer than its time is read again, and the changed one replaces it on the device", async () => {
    kept(caches, { svg: SVG, code: "no", savedAt: Date.now() - FLAG_TTL_MS - 5000 });
    const read = vi.fn(async () => ({ svg: SVG_NEW, code: "no" }));
    setFlagSource({ read });
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_NEW);
    expect(read).toHaveBeenCalledTimes(1);
    __resetFlags();
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_NEW);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("a flag GilbGeo no longer holds is forgotten on the device", async () => {
    kept(caches, { svg: SVG, code: "no", savedAt: Date.now() - FLAG_TTL_MS - 5000 });
    setFlagSource({ read: vi.fn(async () => null) });
    expect(await readFlag(NORWAY)).toBeNull();
    expect(caches.stores.get("gilb-flags-v1")?.has(KEY)).toBe(false);
  });

  it("a device with no Cache Storage still draws the flag for the session", async () => {
    vi.unstubAllGlobals();
    __resetFlags();
    setFlagStore(undefined as never);
    const read = vi.fn(async () => ({ svg: SVG, code: "no" }));
    setFlagSource({ read });
    expect((await readFlag(NORWAY))?.svg).toBe(SVG);
    expect((await readFlag(NORWAY))?.svg).toBe(SVG);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
