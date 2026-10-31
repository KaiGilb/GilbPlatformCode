// Ported whole from the source's `countryFlags.s8fix.test.ts` (18 cases), with the example hosts of the library; the imports are the unit's own entry and the pool unit.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetFlags,
  FLAG_BACKOFF_MS,
  FLAG_TTL_MS,
  flagSvgIsComplete,
  flagSvgIsSafe,
  geoFlagSource,
  readFlag,
  setFlagSource,
  setFlagStore,
  type CountryFlag,
  type FlagSource,
  type FlagStore,
} from "./index";
import { __resetFetchPool } from "@kaigilb/gilbplatformcode-language-fetch-pool";

const NORWAY = "https://geo.example.test/base/e/osm-r-2978650";
const SWEDEN = "https://geo.example.test/base/e/osm-r-52822";
const SVG_A = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#ed2939" d="M0 0h640v480H0z"/></svg>';
const SVG_B = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#00205b" d="M0 0h640v480H0z"/></svg>';
const CUT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#ed2939" d="M0 0h640v4';

function memoryStore(): FlagStore & { held: Map<string, CountryFlag>; deleted: string[] } {
  const held = new Map<string, CountryFlag>();
  const deleted: string[] = [];
  return {
    held,
    deleted,
    get: async (k) => held.get(k) ?? null,
    put: async (k, f) => void held.set(k, f),
    delete: async (k) => {
      deleted.push(k);
      held.delete(k);
    },
  };
}

/** A geo-like fixture; `answer` decides each file's response. */
function geo(answer: (kind: "files" | "entity", id: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const m = /^https:\/\/geo\.example\.test\/(base\/e|files)\/(flag-[a-z0-9-]+)$/.exec(url);
    if (!m) return new Response("not found", { status: 404 });
    return answer(m[1] === "files" ? "files" : "entity", m[2]!);
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}
const svgOk = (svg: string, type = "image/svg+xml") => new Response(svg, { status: 200, headers: { "content-type": type } });
const entityOk = () => new Response(JSON.stringify({ fileTag: ["flag", "no"] }), { status: 200 });

beforeEach(() => {
  __resetFlags();
  __resetFetchPool();
  setFlagStore(null);
});
afterEach(() => {
  vi.useRealTimers();
  setFlagSource(null);
  setFlagStore(null);
});

describe("🔴 F6 · never keep or trust a truncated or non-image SVG", () => {
  it("what is a WHOLE svg: closed, or one self-closed root; a cut one is not", () => {
    expect(flagSvgIsComplete(SVG_A)).toBe(true);
    expect(flagSvgIsComplete(`<?xml version="1.0"?>\n${SVG_A}\n`)).toBe(true);
    expect(flagSvgIsComplete('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(true);
    expect(flagSvgIsComplete(CUT)).toBe(false);
    expect(flagSvgIsComplete(SVG_A.replace("</svg>", ""))).toBe(false);
    expect(flagSvgIsComplete('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(false);
    expect(flagSvgIsComplete("<html></html>")).toBe(false);
    // a safe picture must be whole
    expect(flagSvgIsSafe(CUT)).toBe(false);
  });

  it("a picture cut short (a proxy, a dropped connection) is a FAILED read: not drawn, not kept", async () => {
    const g = geo((kind) => (kind === "files" ? svgOk(CUT) : entityOk()));
    await expect(geoFlagSource({ fetchFn: g.fetchFn }).read(NORWAY)).rejects.toThrow(/cut short/);
    const store = memoryStore();
    setFlagStore(store);
    setFlagSource(geoFlagSource({ fetchFn: g.fetchFn }));
    expect(await readFlag(NORWAY)).toBeNull();
    expect(store.held.size).toBe(0);
  });

  it("a body that is not served as an image (a page, text) is a FAILED read, even when it looks like an svg", async () => {
    for (const type of ["text/html; charset=utf-8", "text/plain", "application/json", ""]) {
      const g = geo((kind) => (kind === "files" ? svgOk(SVG_A, type) : entityOk()));
      await expect(geoFlagSource({ fetchFn: g.fetchFn }).read(NORWAY), `content-type ${JSON.stringify(type)}`).rejects.toThrow(/image/);
    }
    const g = geo((kind) => (kind === "files" ? svgOk(SVG_A, "image/svg+xml; charset=utf-8") : entityOk()));
    expect((await geoFlagSource({ fetchFn: g.fetchFn }).read(NORWAY))?.svg).toBe(SVG_A);
  });

  it("a body that stops half-way is a failed read", async () => {
    const g = geo((kind) =>
      kind === "files"
        ? new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("<svg xmlns")); c.error(new TypeError("terminated")); } }), { status: 200, headers: { "content-type": "image/svg+xml" } })
        : entityOk(),
    );
    await expect(geoFlagSource({ fetchFn: g.fetchFn }).read(NORWAY)).rejects.toThrow();
  });

  it("an unsafe picture (a script) is still 'no flag' (an answer), not a failed read", async () => {
    const g = geo((kind) => (kind === "files" ? svgOk('<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>') : entityOk()));
    expect(await geoFlagSource({ fetchFn: g.fetchFn }).read(NORWAY)).toBeNull();
  });
});

describe("🔴 F6 · a kept flag expires and is read again", () => {
  const stamp = (flag: CountryFlag, savedAt: number | undefined): CountryFlag => (savedAt === undefined ? flag : { ...flag, savedAt });

  it("a kept flag inside its time is drawn with NO call; the flag stored carries when it was read", async () => {
    const store = memoryStore();
    setFlagStore(store);
    const source: FlagSource = { read: vi.fn(async () => ({ svg: SVG_A, code: "no" })) };
    setFlagSource(source);
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_A);
    expect(store.held.get(NORWAY)?.savedAt).toBeGreaterThan(Date.now() - 5000);
    __resetFlags();
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_A);
    expect(source.read).toHaveBeenCalledTimes(1);
  });

  it("🔴 once old, it is read again and the CHANGED flag is the one drawn and kept", async () => {
    const store = memoryStore();
    store.held.set(NORWAY, stamp({ svg: SVG_A, code: "no" }, Date.now() - FLAG_TTL_MS - 1000));
    setFlagStore(store);
    const source: FlagSource = { read: vi.fn(async () => ({ svg: SVG_B, code: "no" })) };
    setFlagSource(source);
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_B);
    expect(source.read).toHaveBeenCalledTimes(1);
    expect(store.held.get(NORWAY)?.svg).toBe(SVG_B);
    expect(Date.now() - (store.held.get(NORWAY)?.savedAt ?? 0)).toBeLessThan(5000);
  });

  it("a kept flag of unknown age (kept by the first build) counts as old", async () => {
    const store = memoryStore();
    store.held.set(NORWAY, stamp({ svg: SVG_A, code: "no" }, undefined));
    setFlagStore(store);
    const source: FlagSource = { read: vi.fn(async () => ({ svg: SVG_B, code: "no" })) };
    setFlagSource(source);
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_B);
  });

  it("old, and GilbGeo cannot be asked: the old flag is still drawn (and the failure backs off)", async () => {
    const store = memoryStore();
    store.held.set(NORWAY, stamp({ svg: SVG_A, code: "no" }, Date.now() - FLAG_TTL_MS - 1000));
    setFlagStore(store);
    const source: FlagSource = { read: vi.fn(async () => { throw new Error("down"); }) };
    setFlagSource(source);
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_A);
    expect(source.read).toHaveBeenCalledTimes(1);
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_A);
    expect(source.read).toHaveBeenCalledTimes(1);
  });

  it("old, and GilbGeo says the country holds NO flag now: the old flag is forgotten and the globe shows", async () => {
    const store = memoryStore();
    store.held.set(NORWAY, stamp({ svg: SVG_A, code: "no" }, Date.now() - FLAG_TTL_MS - 1000));
    setFlagStore(store);
    setFlagSource({ read: vi.fn(async () => null) });
    expect(await readFlag(NORWAY)).toBeNull();
    expect(store.deleted).toEqual([NORWAY]);
    expect(store.held.has(NORWAY)).toBe(false);
  });

  it("the time is a week", () => {
    expect(FLAG_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("🔴 F6 · a failed read backs off instead of retrying at every remount", () => {
  it("within the back-off, asking again makes NO call; after it, one; a success clears it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    let up = false;
    const source: FlagSource = { read: vi.fn(async () => { if (!up) throw new Error("down"); return { svg: SVG_A, code: "no" }; }) };
    setFlagSource(source);
    expect(await readFlag(NORWAY)).toBeNull();
    expect(source.read).toHaveBeenCalledTimes(1);
    // 20 remounts a moment later: none reaches GilbGeo
    for (let i = 0; i < 20; i++) expect(await readFlag(NORWAY)).toBeNull();
    vi.setSystemTime(Date.now() + FLAG_BACKOFF_MS - 1000);
    expect(await readFlag(NORWAY)).toBeNull();
    expect(source.read).toHaveBeenCalledTimes(1);
    // after the wait it tries again, and (still down) waits twice as long
    vi.setSystemTime(Date.now() + 2000);
    expect(await readFlag(NORWAY)).toBeNull();
    expect(source.read).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + FLAG_BACKOFF_MS + 1000);
    expect(await readFlag(NORWAY)).toBeNull();
    expect(source.read).toHaveBeenCalledTimes(2);
    // up again, after the doubled wait: read, kept in memory, and no more calls
    up = true;
    vi.setSystemTime(Date.now() + FLAG_BACKOFF_MS + 1000);
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_A);
    expect(source.read).toHaveBeenCalledTimes(3);
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_A);
    expect(source.read).toHaveBeenCalledTimes(3);
  });

  it("a success clears the country's back-off: a later failure waits the FIRST time again, not a longer one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    const store = memoryStore();
    setFlagStore(store);
    let up = false;
    const source: FlagSource = { read: vi.fn(async () => { if (!up) throw new Error("down"); return { svg: SVG_A, code: "no" }; }) };
    setFlagSource(source);
    expect(await readFlag(NORWAY)).toBeNull(); // failure 1
    vi.setSystemTime(Date.now() + FLAG_BACKOFF_MS + 1000);
    up = true;
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_A); // success: kept, and the back-off is cleared
    // a week later the kept flag is old; GilbGeo is down again: this is failure 1 again, so the wait is the first one
    vi.setSystemTime(Date.now() + FLAG_TTL_MS + 1000);
    up = false;
    setFlagStore(store); // a new session's memory (the back-off is the module's, not reset)
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_A); // the old picture still draws
    expect(source.read).toHaveBeenCalledTimes(3);
    vi.setSystemTime(Date.now() + FLAG_BACKOFF_MS + 1000);
    setFlagStore(store);
    await readFlag(NORWAY);
    expect(source.read).toHaveBeenCalledTimes(4);
  });

  it("the back-off is per country: one country down does not stop another", async () => {
    const source: FlagSource = { read: vi.fn(async (c: string) => { if (c === NORWAY) throw new Error("down"); return { svg: SVG_B, code: "se" }; }) };
    setFlagSource(source);
    expect(await readFlag(NORWAY)).toBeNull();
    expect((await readFlag(SWEDEN))?.svg).toBe(SVG_B);
  });

  it("'no flag' is still an answer: remembered for the session, never kept on the device, no back-off needed", async () => {
    const store = memoryStore();
    setFlagStore(store);
    const source: FlagSource = { read: vi.fn(async () => null) };
    setFlagSource(source);
    expect(await readFlag(NORWAY)).toBeNull();
    expect(await readFlag(NORWAY)).toBeNull();
    expect(source.read).toHaveBeenCalledTimes(1);
    expect(store.held.size).toBe(0);
  });
});

describe("🔴 F5/F6 · the flag reads are bounded: a pool and a timeout", () => {
  it("30 countries asked at once make at most 8 requests at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      const isFile = String(input).includes("/files/");
      return isFile ? svgOk(SVG_A) : entityOk();
    }) as unknown as typeof fetch;
    setFlagSource(geoFlagSource({ fetchFn }));
    const countries = Array.from({ length: 30 }, (_, i) => `https://geo.example.test/base/e/osm-r-${1000 + i}`);
    const flags = await Promise.all(countries.map((c) => readFlag(c)));
    expect(flags.every((f) => f?.svg === SVG_A)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(60);
    expect(peak).toBeLessThanOrEqual(8);
  });

  it("a geo that never answers is given up after the time (a failed read), not waited on forever", async () => {
    const hang = vi.fn((_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("a", "AbortError"))))) as unknown as typeof fetch;
    const started = Date.now();
    await expect(geoFlagSource({ fetchFn: hang, timeoutMs: 40 }).read(NORWAY)).rejects.toThrow(/in time/);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe("🔴 F3 · the flag read never reads the country entity", () => {
  it("only the two small flag files are read (by the slug rule), whatever the answer", async () => {
    for (const answer of [
      (kind: "files" | "entity") => (kind === "files" ? new Response("no", { status: 404 }) : new Response("no", { status: 404 })),
      (kind: "files" | "entity") => (kind === "files" ? svgOk(SVG_A) : entityOk()),
    ]) {
      const g = geo(answer);
      await geoFlagSource({ fetchFn: g.fetchFn }).read(NORWAY).catch(() => null);
      expect(g.calls.sort()).toEqual(["https://geo.example.test/base/e/flag-osm-r-2978650", "https://geo.example.test/files/flag-osm-r-2978650"]);
    }
  });
});
