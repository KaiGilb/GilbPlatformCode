// Ported from the source's `countryFlags.s8lang.test.ts` (10 of its 18 cases: the reader against a geo-like fixture 5, kept on the device 5; the file id, how a flag is drawn and which flags a language offers are in `flag-choice`), with the example hosts of the library.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetFlags,
  FLAG_BACKOFF_MS,
  flagSvgIsSafe,
  geoFlagSource,
  readFlag,
  setFlagSource,
  setFlagStore,
  type CountryFlag,
  type FlagSource,
  type FlagStore,
} from "./index";

const NORWAY = "https://geo.example.test/base/e/osm-r-2978650";
const SWEDEN = "https://geo.example.test/base/e/osm-r-52822";
const SVG_NO = '<svg xmlns="http://www.w3.org/2000/svg" id="flag-icons-no" viewBox="0 0 640 480"><path fill="#ed2939" d="M0 0h640v480H0z"/></svg>';

/** A local geo-like fixture: one flag file entity and its SVG, in the shape the GilbGeo run will write. */
function geoFixture(flags: Record<string, { code: string; svg: string }>) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const m = /^https:\/\/geo\.example\.test\/(base\/e|files)\/(flag-[a-z0-9-]+)$/.exec(url);
    const hit = m ? flags[m[2]!] : undefined;
    if (!m || !hit) return new Response("not found", { status: 404 });
    if (m[1] === "files") return new Response(hit.svg, { status: 200, headers: { "content-type": "image/svg+xml" } });
    return new Response(JSON.stringify({ "@id": url, fileMediaType: "image/svg+xml", fileTag: ["flag", hit.code] }), { status: 200 });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

function memoryStore(): FlagStore & { held: Map<string, CountryFlag> } {
  const held = new Map<string, CountryFlag>();
  return { held, get: async (k) => held.get(k) ?? null, put: async (k, f) => void held.set(k, f) };
}

beforeEach(() => {
  __resetFlags();
  setFlagStore(null);
});
afterEach(() => {
  setFlagSource(null);
  setFlagStore(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});


describe("the reader against a geo-like fixture", () => {
  it("reads the small file entity (for the ISO code) and the SVG, at the country's own host, with no credential", async () => {
    const geo = geoFixture({ "flag-osm-r-2978650": { code: "no", svg: SVG_NO } });
    const flag = await geoFlagSource({ fetchFn: geo.fetchFn }).read(NORWAY);
    expect(flag).toEqual({ svg: SVG_NO, code: "no" });
    expect(geo.calls.sort()).toEqual(["https://geo.example.test/base/e/flag-osm-r-2978650", "https://geo.example.test/files/flag-osm-r-2978650"]);
    // ⛔ never the country entity (0.5 to 3.6 MB)
    expect(geo.calls.includes(NORWAY)).toBe(false);
    const init = (geo.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1] as RequestInit | undefined);
    for (const i of init) expect(JSON.stringify(i?.headers ?? {}).toLowerCase()).not.toMatch(/authorization|dpop/);
    // no cookie either: the read is anonymous
    for (const i of init) expect(i?.credentials).toBe("omit");
  });

  it("🔴 against the real geo as it is today (no flag file written): no flag, so the globe — not an error", async () => {
    const geo = geoFixture({});
    expect(await geoFlagSource({ fetchFn: geo.fetchFn }).read(NORWAY)).toBeNull();
  });

  it("a flag whose entity cannot be read still draws (the code is then unknown)", async () => {
    const f = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/files/") ? new Response(SVG_NO, { status: 200, headers: { "content-type": "image/svg+xml" } }) : new Response("no", { status: 500 }),
    );
    expect(await geoFlagSource({ fetchFn: f as unknown as typeof fetch }).read(NORWAY)).toEqual({ svg: SVG_NO, code: null });
  });

  it("a server error or a dead network is a failed read (thrown), not 'no flag'", async () => {
    const down = vi.fn(async () => new Response("x", { status: 503 }));
    await expect(geoFlagSource({ fetchFn: down as unknown as typeof fetch }).read(NORWAY)).rejects.toThrow();
    const dead = vi.fn(async () => {
      throw new TypeError("network");
    });
    await expect(geoFlagSource({ fetchFn: dead as unknown as typeof fetch }).read(NORWAY)).rejects.toThrow();
  });

  it("🔴 a file that is not a plain SVG picture is refused, so it draws as the globe", async () => {
    for (const bad of [
      "<html><body>x</body></html>",
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/a.png"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="javascript:alert(1)"/></svg>',
      "",
    ]) {
      expect(flagSvgIsSafe(bad)).toBe(false);
      const geo = geoFixture({ "flag-osm-r-2978650": { code: "no", svg: bad } });
      expect(await geoFlagSource({ fetchFn: geo.fetchFn }).read(NORWAY)).toBeNull();
    }
    expect(flagSvgIsSafe(SVG_NO)).toBe(true);
    // the real flag set draws some flags with an INTERNAL reference (`<use href="#a">`): that is kept
    expect(flagSvgIsSafe('<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="a" d="M0 0"/></defs><use xlink:href="#a"/></svg>')).toBe(true);
    expect(flagSvgIsSafe('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(true);
  });
});

describe("kept on the device: a flag already kept is drawn with no network call", () => {
  it("🔴 read once, then from memory", async () => {
    const geo = geoFixture({ "flag-osm-r-2978650": { code: "no", svg: SVG_NO } });
    setFlagSource(geoFlagSource({ fetchFn: geo.fetchFn }));
    expect((await readFlag(NORWAY))?.code).toBe("no");
    const before = geo.calls.length;
    expect((await readFlag(NORWAY))?.code).toBe("no");
    expect(geo.calls.length).toBe(before);
  });

  it("🔴 and after a reload (memory gone) from the device store, with no call at all", async () => {
    const geo = geoFixture({ "flag-osm-r-2978650": { code: "no", svg: SVG_NO } });
    const store = memoryStore();
    setFlagStore(store);
    setFlagSource(geoFlagSource({ fetchFn: geo.fetchFn }));
    await readFlag(NORWAY);
    expect(store.held.get(NORWAY)?.code).toBe("no");
    __resetFlags(); // a reload: the memory is gone, the device store is not
    geo.calls.length = 0;
    expect((await readFlag(NORWAY))?.svg).toBe(SVG_NO);
    expect(geo.calls).toEqual([]);
  });

  it("'no flag' is remembered for the session only: never written to the device store", async () => {
    const geo = geoFixture({});
    const store = memoryStore();
    setFlagStore(store);
    setFlagSource(geoFlagSource({ fetchFn: geo.fetchFn }));
    expect(await readFlag(SWEDEN)).toBeNull();
    const n = geo.calls.length;
    expect(await readFlag(SWEDEN)).toBeNull();
    expect(geo.calls.length).toBe(n);
    expect(store.held.size).toBe(0);
  });

  it("a failed read is not remembered as an answer: once its back-off has passed, the next ask tries again (fix round F6: not before)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let up = false;
    const source: FlagSource = {
      read: vi.fn(async () => {
        if (!up) throw new Error("down");
        return { svg: SVG_NO, code: "no" };
      }),
    };
    setFlagSource(source);
    expect(await readFlag(NORWAY)).toBeNull();
    up = true;
    expect(await readFlag(NORWAY)).toBeNull(); // inside the back-off: no call at all
    vi.setSystemTime(Date.now() + FLAG_BACKOFF_MS + 1000);
    expect((await readFlag(NORWAY))?.code).toBe("no");
  });

  it("no country, no read", async () => {
    const source: FlagSource = { read: vi.fn(async () => null) };
    setFlagSource(source);
    expect(await readFlag(null)).toBeNull();
    expect(source.read).not.toHaveBeenCalled();
  });
});

