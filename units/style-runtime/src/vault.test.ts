// @vitest-environment node
// The READ side of the app's style: records -> sheet and the anonymous load. Needs no studio, React or fonts.
import { describe, expect, it } from "vitest";
import { defaultSheet, loadStyleFromVault, makeVaultFetchRemote, recordsToSheet, validateStyleSheet, type StyleSheet } from "./index";

const BASE = "https://vault.test";
const IDB = "https://x.localhost:8787";
const VID = "v1";
const toFetch = (u: string) => u.replace(IDB, "http://x.localhost:8787");
const toId = (u: string) => u.replace("http://x.localhost:8787", IDB);
const FETCHED = "http://x.localhost:8787/";

/** A tiny read-only vault of three bare-key records. Extra facts are merged into the sheet record. */
function vault(sheetFacts: Record<string, unknown> = {}, palette: unknown = undefined, brand: Record<string, unknown> = { brandFont: "Inter" }) {
  const id = (n: number) => `${BASE}/lws/vault/${VID}/e/${n}`;
  const recs: Record<string, unknown> = {
    [id(1)]: { stylePalette: { "@id": id(2) }, styleBrandKit: { "@id": id(3) }, ...sheetFacts },
    [id(2)]: palette ?? { paletteColour: [{ colourHex: "#112233", colourRole: "primary" }, { colourHex: "#ffffff", colourRole: "background" }, { colourHex: "#111111", colourRole: "text" }] },
    [id(3)]: brand,
  };
  const log: { url: string; init?: RequestInit }[] = [];
  const fetch = (async (i: RequestInfo | URL, init?: RequestInit) => {
    log.push({ url: String(i), init });
    return new Response(JSON.stringify(recs[String(i)] ?? {}), { status: 200 });
  }) as typeof globalThis.fetch;
  return { sheetUrl: id(1), fetch, log };
}

describe("records to sheet", () => {
  it("recordsToSheet accepts both a: and bare keys, and @id as object or string", () => {
    const palette = { paletteColour: [{ colourHex: "#112233", colourRole: "primary" }, { "a:colourHex": "#f0f0f0", "a:colourRole": "background" }, { colourHex: "#101010", colourRole: "text" }], paletteSource: "handPicked" };
    const s = recordsToSheet({ palette, brandKit: { "a:brandFont": "Inter" }, sheetRecord: { "a:cornerRadius": 4, buttonStyle: "pill" } });
    expect(s.palette).toMatchObject({ accent: "#112233", paper: "#f0f0f0", ink: "#101010" });
    expect(s.shape.radius).toBe(4);
    expect(s.button).toBe("pill");
    expect(s.fonts.sans).toEqual({ family: "Inter", source: "bundled" });
  });

  it("a font is bundled only if it is on the bundled list (case and edge spaces ignored)", () => {
    const s = recordsToSheet({ palette: { paletteColour: [{ colourHex: "#112233", colourRole: "primary" }, { colourHex: "#ffffff", colourRole: "background" }, { colourHex: "#111111", colourRole: "text" }] }, brandKit: { brandFont: " inter ", brandCodeFont: "Courier New" } });
    expect(s.fonts.sans.source).toBe("bundled");
    expect(s.fonts.mono?.source).toBe("system");
  });
});

describe("loader with hostile vault data", () => {
  it("invalid closed-set words fall back to the defaults", async () => {
    const v = vault({ "a:buttonStyle": "evil", "a:windowStyle": "x;y", "a:shadowDepth": 7, "a:spacingDensity": "huge", "a:defaultThemeMode": "neon" });
    const out = await loadStyleFromVault({ sheetUrl: v.sheetUrl, fetch: v.fetch });
    expect(out.valid).toBe(true);
    expect(out.sheet).toMatchObject({ button: "filled", window: "flat", mode: "system", shape: { shadow: "none", density: "comfortable" } });
  });

  it('cornerRadius "8px;}" gives the default radius, never CSS text', async () => {
    const v = vault({ "a:cornerRadius": "8px;}" });
    const out = await loadStyleFromVault({ sheetUrl: v.sheetUrl, fetch: v.fetch });
    expect(out.sheet.shape.radius).toBe(10);
    expect(JSON.stringify(out.sheet)).not.toContain("8px");
  });

  it("an out-of-range number or a hostile colour gives errors and the safe default sheet", async () => {
    for (const v of [
      vault({ "a:cornerRadius": 9999 }),
      vault({}, { paletteColour: [{ colourHex: "url(x)", colourRole: "primary" }] }),
      vault({}, undefined, { brandFont: "Inter;}body{x" }),
    ]) {
      const out = await loadStyleFromVault({ sheetUrl: v.sheetUrl, fetch: v.fetch });
      expect(out.valid).toBe(false);
      expect(out.errors.length).toBeGreaterThan(0);
      expect(out.sheet).toEqual(defaultSheet());
    }
  });

  it("never throws: 404, bad JSON, missing links, a link to another site", async () => {
    const f404 = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    expect((await loadStyleFromVault({ sheetUrl: `${BASE}/e/1`, fetch: f404 })).valid).toBe(false);
    const fBad = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    expect((await loadStyleFromVault({ sheetUrl: `${BASE}/e/1`, fetch: fBad })).valid).toBe(false);
    const fNoLinks = (async () => new Response(JSON.stringify({ cornerRadius: 3 }), { status: 200 })) as unknown as typeof fetch;
    expect((await loadStyleFromVault({ sheetUrl: `${BASE}/e/1`, fetch: fNoLinks })).errors[0]).toMatch(/palette link/);
    const fEvil = (async () => new Response(JSON.stringify({ stylePalette: { "@id": "https://evil.test/p" }, styleBrandKit: "https://evil.test/b" }), { status: 200 })) as unknown as typeof fetch;
    expect((await loadStyleFromVault({ sheetUrl: `${BASE}/e/1`, fetch: fEvil })).errors[0]).toMatch(/another site/);
  });

  it("GETs are anonymous (no authorization header, credentials omit)", async () => {
    const v = vault();
    await loadStyleFromVault({ sheetUrl: v.sheetUrl, fetch: v.fetch });
    expect(v.log).toHaveLength(3);
    for (const r of v.log) {
      expect(r.init?.method).toBe("GET");
      expect(Object.keys((r.init?.headers as Record<string, string>) ?? {}).sort()).toEqual(["accept"]);
      expect(r.init?.credentials).toBe("omit");
    }
  });

  it("a logo link on the same site comes back; one on another site is dropped", async () => {
    const v = vault({}, undefined, { brandFont: "Inter", brandLogo: { "@id": `${BASE}/lws/vault/${VID}/f/9` }, brandLogoMark: "https://evil.test/m.png" });
    const out = await loadStyleFromVault({ sheetUrl: v.sheetUrl, fetch: v.fetch });
    expect(out.sheet.logo).toEqual({ primary: `${BASE}/lws/vault/${VID}/f/9` });
  });

  it("makeVaultFetchRemote returns a valid sheet, and throws on unusable data", async () => {
    const v = vault();
    const ok = (await makeVaultFetchRemote(v.sheetUrl, v.fetch)()) as StyleSheet;
    expect(validateStyleSheet(ok).ok).toBe(true);
    const bad = vault({}, { paletteColour: [] });
    await expect(makeVaultFetchRemote(bad.sheetUrl, bad.fetch)()).rejects.toThrow();
  });
});

describe("toFetchUrl: identity URLs mapped to fetchable URLs", () => {
  it("GETs are mapped; same-origin check uses identity origins; default unchanged", async () => {
    const urls: string[] = [];
    const sheetId = `${IDB}/lws/vault/${VID}/e/1`;
    const recs: Record<string, unknown> = {
      [sheetId]: { stylePalette: { "@id": `${IDB}/lws/vault/${VID}/e/2` }, styleBrandKit: { "@id": `${IDB}/lws/vault/${VID}/e/3` } },
      [`${IDB}/lws/vault/${VID}/e/2`]: { paletteColour: [{ colourHex: "#112233", colourRole: "primary" }, { colourHex: "#ffffff", colourRole: "background" }, { colourHex: "#111111", colourRole: "text" }] },
      [`${IDB}/lws/vault/${VID}/e/3`]: { brandFont: "Inter" },
    };
    const f = (async (i: RequestInfo | URL) => {
      urls.push(String(i));
      return new Response(JSON.stringify(recs[toId(String(i))] ?? {}), { status: 200 });
    }) as typeof fetch;
    const r = await loadStyleFromVault({ sheetUrl: sheetId, fetch: f, toFetchUrl: toFetch });
    expect(urls).toHaveLength(3);
    expect(urls.every((u) => u.startsWith(FETCHED))).toBe(true);
    expect(r.errors).toEqual([]);
    expect(await makeVaultFetchRemote(sheetId, f, toFetch)()).toBeTruthy();
    expect(urls.slice(3).every((u) => u.startsWith(FETCHED))).toBe(true);
    urls.length = 0;
    await loadStyleFromVault({ sheetUrl: sheetId, fetch: f });
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
  });
});

describe("load: read-back @type in any served form", () => {
  // Server read shape: a framed doc whose "@type" is "t:X", bare "X" or the full type URI.
  it.each([["t:"], [""], ["https://types.example/base/t/"]])("accepts @type prefix %j", async (pre) => {
    const sheetId = `https://id.example/lws/vault/v1/e/1`;
    const recs: Record<string, unknown> = {
      [sheetId]: { "@type": `${pre}AppStyleSheet`, stylePalette: { "@id": `https://id.example/lws/vault/v1/e/2` }, styleBrandKit: { "@id": `https://id.example/lws/vault/v1/e/3` } },
      [`https://id.example/lws/vault/v1/e/2`]: { "@type": `${pre}ColourPalette`, paletteColour: [{ colourHex: "#112233", colourRole: "primary" }, { colourHex: "#ffffff", colourRole: "background" }, { colourHex: "#111111", colourRole: "text" }] },
      [`https://id.example/lws/vault/v1/e/3`]: { "@type": `${pre}BrandKit`, brandFont: "Inter" },
    };
    const f = (async (i: RequestInfo | URL) => new Response(JSON.stringify(recs[String(i)] ?? {}), { status: 200 })) as typeof fetch;
    const r = await loadStyleFromVault({ sheetUrl: sheetId, fetch: f });
    expect(r.errors).toEqual([]);
    expect(r.sheet.fonts.sans.family).toBe("Inter");
  });
});
