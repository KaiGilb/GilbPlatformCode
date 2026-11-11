import { describe, expect, it } from "vitest";
import {
  StaleEtagError,
  StyleSaveError,
  WADA_SOURCE_WORK,
  loadStyleFromVault,
  makeVaultFetchRemote,
  recordsToSheet,
  saveStyle,
  sheetToRecords,
  type SavedIds,
} from "./save/styleStore";
import { contrastReport, defaultSheet, sheetFromCatalogue, sheetFromSeed } from "./studio/model";
import { validateStyleSheet, type StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import { BUNDLED_FONT_NAMES } from "@kaigilb/gilbplatformcode-style-runtime";
import { FONT_CATALOGUE } from "./studio/fonts";
import { wadaPalettes } from "./catalogue/wada.generated";

const BASE = "https://vault.test";
const VID = "v1";
const PNG = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

interface Req {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** Fake vault. Stores WRITE-shape facts, and returns them with BARE keys, as the live server does. */
function fakeServer(opts: { failOn?: (r: Req) => number | undefined; publicRead?: boolean } = {}) {
  const log: Req[] = [];
  const store = new Map<string, { type: string; facts: Record<string, unknown>; etag: string }>();
  const files = new Map<string, boolean>();
  let n = 0;
  const bare = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(bare);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k.replace(/^a:/, ""), bare(x)]));
    return v;
  };
  const respond = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const raw = init?.body;
    const body = typeof raw === "string" ? JSON.parse(raw) : raw;
    const req: Req = { method, url, headers, body };
    log.push(req);
    const forced = opts.failOn?.(req);
    if (forced) return respond(forced, { error: "forced" });
    if (method === "POST" && url === `${BASE}/lws/vault/${VID}/c`) {
      const id = `${BASE}/lws/vault/${VID}/e/${++n}`;
      store.set(id, { type: body.type, facts: body.facts, etag: `"1"` });
      return respond(201, undefined, { location: id, etag: `"1"` });
    }
    if (method === "PUT" && url.startsWith(`${BASE}/lws/vault/${VID}/files?name=`)) {
      expect(raw).toBeInstanceOf(Blob);
      const id = `${BASE}/lws/vault/${VID}/f/${++n}`;
      files.set(id, true);
      return respond(201, { fileEntity: id });
    }
    if (method === "PUT") {
      const rec = store.get(url);
      if (!rec) return respond(404);
      if (!headers["if-match"]) return respond(428);
      if (headers["if-match"] !== rec.etag) return respond(412);
      const etag = `"${Number(rec.etag.replace(/"/g, "")) + 1}"`;
      store.set(url, { type: body.type, facts: body.facts, etag });
      return respond(200, undefined, { etag });
    }
    if (method === "GET") {
      const rec = store.get(url);
      if (!rec || opts.publicRead === false) return respond(404);
      return respond(200, { "@id": url, "@type": rec.type, ...(bare(rec.facts) as object) }, { etag: rec.etag });
    }
    if (method === "POST" && url === `${BASE}/base/authz/grant-direct`) return respond(200, { ok: true });
    return respond(404);
  }) as unknown as typeof fetch;
  return { fetch: fetchFn, log, store };
}

const authLog: [string, string][] = [];
const auth = async (method: string, url: string) => {
  authLog.push([method, url]);
  return { authorization: "DPoP t", dpop: `proof:${method}:${url}` };
};

// ---------------------------------------------------------------- sheets
const seedSheet = (seed: string, h: Parameters<typeof sheetFromSeed>[2], mut: (s: StyleSheet) => StyleSheet = (s) => s) => mut(sheetFromSeed(defaultSheet(), seed, h));
const wada = (n: number, colors: string[]): StyleSheet => {
  const s = sheetFromCatalogue(defaultSheet(), "wada", { id: `wada-${n}`, name: `Wada No. ${n}`, source: WADA_SOURCE_WORK, licence: "MIT", colors });
  if (!s) throw new Error("wada fixture rejected");
  return s;
};
const sheets: [string, StyleSheet][] = [
  ["wada 2 colours", wada(1, ["#d96629", "#0093a5"])],
  ["wada 3 colours", wada(12, ["#bb7125", "#ffefae", "#1d3557"])],
  ["wada 6 colours", wada(200, ["#f99d1b", "#12354e", "#437742", "#064f6e", "#c5a56e", "#59256a"])],
  ["seed analogous", seedSheet("#3b6fd4", "analogous")],
  ["seed triadic, outline pill-less", seedSheet("#b5462f", "triadic", (s) => ({ ...s, button: "outline", window: "bordered", shape: { radius: 0, shadow: "none", density: "compact" }, mode: "light" }))],
  ["seed mono, strong shadow", seedSheet("#2a7f62", "mono", (s) => ({ ...s, button: "pill", window: "glass", shape: { radius: 32, shadow: "strong", density: "spacious" }, mode: "dark" }))],
  ["url source", seedSheet("#0b6e4f", "split", (s) => ({ ...s, paletteSource: { kind: "url", url: "https://example.com/", readAt: "2026-11-11T10:00:00Z" }, button: "soft", window: "card", shape: { radius: 6, shadow: "medium", density: "comfortable" } }))],
  ["manual with fonts", seedSheet("#8a3ffc", "complementary", (s) => ({ ...s, paletteSource: { kind: "manual" }, button: "text", fonts: { sans: { family: "Inter", source: "bundled" }, serif: { family: "Lora", source: "bundled" }, mono: { family: "Fira Code", source: "bundled" }, baseSizePx: 18, scaleRatio: 1.333 } }))],
  ["catalogue pop (not Wada)", seedSheet("#e4572e", "analogous", (s) => ({ ...s, paletteSource: { kind: "catalogue", catalogue: "pop" }, fonts: { ...s.fonts, baseSizePx: 14, scaleRatio: 1.2 } }))],
  ["no extra, no surface", seedSheet("#1d3557", "analogous", (s) => { const { surface: _s, lines: _l, extra: _e, ...rest } = s.palette; return { ...s, palette: rest, paletteSource: { kind: "manual" } }; })],
];

/** The fields the vault stores; name, dark override and ok/warn/bad/onAccent are not stored. */
function stored(s: StyleSheet) {
  const { ok: _o, warn: _w, bad: _b, onAccent: _a, ...pal } = s.palette;
  const src = s.paletteSource;
  return {
    mode: s.mode,
    palette: pal,
    source: src?.kind === "catalogue" && src.catalogue !== "wada" ? { kind: "manual" } : src ?? { kind: "manual" },
    fonts: s.fonts,
    shape: s.shape,
    button: s.button,
    window: s.window,
  };
}

const PUBLIC_GRANTEE = "https://example.test/base/t/PublicGrantee";

describe("one list of bundled fonts", () => {
  it("the studio catalogue carries exactly style-runtime's bundled names, in order", () => {
    expect(FONT_CATALOGUE.map((f) => f.family)).toEqual([...BUNDLED_FONT_NAMES]);
  });
});

describe("wada source text", () => {
  it("matches the catalogue's own source line", () => {
    expect(wadaPalettes[0]!.source).toBe(WADA_SOURCE_WORK);
  });
});

describe("round trip through a fake vault (bare-key reads)", () => {
  it.each(sheets)("%s", async (_name, sheet) => {
    const srv = fakeServer();
    const ids = await saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet });
    const out = await loadStyleFromVault({ sheetUrl: ids.sheet.id, fetch: srv.fetch });
    expect(out.errors).toEqual([]);
    expect(out.valid).toBe(true);
    expect(stored(out.sheet)).toEqual(stored(sheet));
    expect(validateStyleSheet(out.sheet).ok).toBe(true);
    // ok/warn/bad/onAccent are regenerated by the engine and must pass contrast
    expect(contrastReport(out.sheet).filter((r) => !r.pass)).toEqual([]);
    // the stored write bodies used a: keys; the stored records are read back bare (fixture is the bare shape)
    const getBody = await (await srv.fetch(ids.palette.id)).json();
    expect(getBody.paletteColour).toBeDefined();
    expect(getBody["a:paletteColour"]).toBeUndefined();
  });

  it("records are mapped as specified", () => {
    const s = wada(1, ["#d96629", "#0093a5", "#111111", "#222222", "#333333", "#444444"]);
    const rec = sheetToRecords(s);
    const items = rec.palette.facts["a:paletteColour"] as Record<string, string>[];
    expect(items.map((i) => i["a:colourRole"])).toEqual(["primary", "background", "surface", "text", "border", "secondary", "accent", undefined, undefined, undefined, undefined]);
    expect(items[0]!["a:colourHex"]).toBe(s.palette.accent);
    expect(items[0]!["a:colourOklch"]).toMatch(/^oklch\(\d+(\.\d)?% \d\.\d+ \d+(\.\d)?\)$/);
    expect(items.every((i) => /^#[0-9a-f]{6}$/.test(i["a:colourHex"]!))).toBe(true);
    expect(rec.palette.facts["a:paletteSource"]).toBe("publishedCombination");
    expect(rec.palette.facts["a:combinationNumber"]).toBe(1);
    expect(rec.palette.facts["a:sourceWork"]).toBe(WADA_SOURCE_WORK);
    const f = rec.sheetFacts("P", "B");
    expect(f.type).toBe("t:AppStyleSheet");
    expect(f.facts["a:stylePalette"]).toEqual({ "@id": "P" });
    expect(JSON.stringify(rec)).not.toMatch(/onAccent|"a:ok"|warn/);
  });

});

describe("request shapes", () => {
  it("first save: creates palette, brandKit, sheet in order after the logo upload, grants after all writes", async () => {
    authLog.length = 0;
    const srv = fakeServer();
    const sheet = sheets[3]![1];
    const ids = await saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet, logoPng: PNG });
    const seq = srv.log.map((r) => `${r.method} ${r.url.replace(BASE, "")}`);
    expect(seq).toEqual([
      `PUT /lws/vault/${VID}/files?name=logo.png`,
      `POST /lws/vault/${VID}/c`,
      `POST /lws/vault/${VID}/c`,
      `POST /lws/vault/${VID}/c`,
      "POST /base/authz/grant-direct",
      "POST /base/authz/grant-direct",
      "POST /base/authz/grant-direct",
      "POST /base/authz/grant-direct",
    ]);
    const [up, pal, bk, sh, ...grants] = srv.log;
    expect(up!.headers["content-type"]).toBe("image/png");
    expect(pal!.body).toMatchObject({ type: "t:ColourPalette" });
    expect(bk!.body).toMatchObject({ type: "t:BrandKit" });
    expect(sh!.body).toMatchObject({ type: "t:AppStyleSheet" });
    for (const r of [pal!, bk!, sh!]) {
      expect(r.headers["content-type"]).toBe("application/json");
      expect(Object.keys((r.body as { facts: object }).facts).every((k) => k.startsWith("a:"))).toBe(true);
    }
    const bkFacts = (bk!.body as { facts: Record<string, unknown> }).facts;
    expect(bkFacts["a:brandLogo"]).toEqual({ "@id": ids.logo });
    const shFacts = (sh!.body as { facts: Record<string, unknown> }).facts;
    expect(shFacts["a:stylePalette"]).toEqual({ "@id": ids.palette.id });
    expect(shFacts["a:styleBrandKit"]).toEqual({ "@id": ids.brandKit.id });
    expect(shFacts["a:cornerRadius"]).toBe(sheet.shape.radius);
    // grants: logo file, palette, brandKit, sheet; complete facts, public principal
    expect(grants.map((g) => (g.body as { entity: string }).entity)).toEqual([ids.logo, ids.palette.id, ids.brandKit.id, ids.sheet.id]);
    expect(grants.map((g) => (g.body as { type: string }).type)).toEqual(["t:ImageFile", "t:ColourPalette", "t:BrandKit", "t:AppStyleSheet"]);
    for (const g of grants) expect((g.body as { principal: string }).principal).toBe(PUBLIC_GRANTEE);
    expect((grants[1]!.body as { facts: unknown }).facts).toEqual((pal!.body as { facts: unknown }).facts);
    expect((grants[3]!.body as { facts: unknown }).facts).toEqual(shFacts);
    expect((grants[0]!.body as { facts: unknown }).facts).toEqual({});
    // auth called once per request with the exact method and url, and its headers were sent
    expect(authLog).toEqual(srv.log.map((r) => [r.method, r.url]));
    for (const r of srv.log) expect(r.headers.dpop).toBe(`proof:${r.method}:${r.url}`);
    expect(ids.sheet.etag).toBe('"1"');
  });

  it("later save: PUT with If-Match on each, to the entity url, then grants", async () => {
    const srv = fakeServer();
    const sheet = sheets[4]![1];
    const first = await saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet });
    srv.log.length = 0;
    const second = await saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet: { ...sheet, button: "soft" }, existing: first });
    const puts = srv.log.filter((r) => r.method === "PUT");
    expect(puts.map((p) => p.url)).toEqual([first.palette.id, first.brandKit.id, first.sheet.id]);
    for (const p of puts) {
      expect(p.headers["if-match"]).toBe('"1"');
      expect(p.headers["content-type"]).toBe("application/json");
    }
    expect((puts[2]!.body as { facts: Record<string, unknown> }).facts["a:buttonStyle"]).toBe("soft");
    expect(srv.log.filter((r) => r.url.endsWith("/c"))).toHaveLength(0);
    expect(srv.log.filter((r) => r.url.endsWith("grant-direct"))).toHaveLength(3);
    expect(second.sheet.etag).toBe('"2"');
    expect(second.sheet.id).toBe(first.sheet.id);
  });
});

describe("errors", () => {
  it("412 on PUT is a StaleEtagError, and nothing is granted", async () => {
    const srv = fakeServer();
    const sheet = sheets[3]![1];
    const first = await saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet });
    srv.log.length = 0;
    const stale: SavedIds = { ...first, palette: { ...first.palette, etag: '"0"' } };
    const err = await saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet, existing: stale }).catch((e) => e);
    expect(err).toBeInstanceOf(StaleEtagError);
    expect(err).toBeInstanceOf(StyleSaveError);
    expect(err).toMatchObject({ step: "palette", status: 412 });
    expect(srv.log.some((r) => r.url.endsWith("grant-direct"))).toBe(false);
  });

  it("428 is also a StaleEtagError", async () => {
    const srv = fakeServer({ failOn: (r) => (r.method === "PUT" ? 428 : undefined) });
    const sheet = sheets[3]![1];
    const ex: SavedIds = { sheet: { id: `${BASE}/e/s`, etag: "x" }, palette: { id: `${BASE}/e/p`, etag: "x" }, brandKit: { id: `${BASE}/e/b`, etag: "x" } };
    await expect(saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet, existing: ex })).rejects.toBeInstanceOf(StaleEtagError);
  });

  it("403 on a grant is StyleSaveError{step:grant}, carrying the written ids", async () => {
    const srv = fakeServer({ failOn: (r) => (r.url.endsWith("grant-direct") ? 403 : undefined) });
    const err = await saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet: sheets[3]![1] }).catch((e) => e);
    expect(err).toBeInstanceOf(StyleSaveError);
    expect(err).not.toBeInstanceOf(StaleEtagError);
    expect(err).toMatchObject({ step: "grant", status: 403 });
    expect(err.ids.sheet.id).toMatch(/\/e\//);
  });

  it("a failed write means no grant is attempted", async () => {
    const srv = fakeServer({ failOn: (r) => (r.method === "POST" && (r.body as { type?: string })?.type === "t:AppStyleSheet" ? 500 : undefined) });
    const err = await saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet: sheets[3]![1] }).catch((e) => e);
    expect(err).toMatchObject({ step: "sheet", status: 500 });
    expect(srv.log.some((r) => r.url.endsWith("grant-direct"))).toBe(false);
  });

  it("a network failure becomes a typed error", async () => {
    const f = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    await expect(saveStyle({ fetch: f, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet: sheets[3]![1] })).rejects.toMatchObject({ step: "palette", status: 0 });
  });

  it("an invalid sheet is refused before any request", async () => {
    const srv = fakeServer();
    const bad = { ...sheets[3]![1], button: "evil" } as unknown as StyleSheet;
    await expect(saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet: bad })).rejects.toBeInstanceOf(StyleSaveError);
    expect(srv.log).toHaveLength(0);
  });
});

describe("loader with hostile vault data", () => {
  const seedVault = async (mutate: (srv: ReturnType<typeof fakeServer>, ids: SavedIds) => void) => {
    const srv = fakeServer();
    const ids = await saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet: sheets[3]![1] });
    mutate(srv, ids);
    return { srv, ids };
  };

  it("invalid closed-set words fall back to the defaults", async () => {
    const { srv, ids } = await seedVault((s, i) => {
      const r = s.store.get(i.sheet.id)!;
      Object.assign(r.facts, { "a:buttonStyle": "evil", "a:windowStyle": "x;y", "a:shadowDepth": 7, "a:spacingDensity": "huge", "a:defaultThemeMode": "neon" });
    });
    const out = await loadStyleFromVault({ sheetUrl: ids.sheet.id, fetch: srv.fetch });
    expect(out.valid).toBe(true);
    expect(out.sheet).toMatchObject({ button: "filled", window: "flat", mode: "system", shape: { shadow: "none", density: "comfortable" } });
  });

  it('cornerRadius "8px;}" gives the default radius, never CSS text', async () => {
    const { srv, ids } = await seedVault((s, i) => { s.store.get(i.sheet.id)!.facts["a:cornerRadius"] = "8px;}"; });
    const out = await loadStyleFromVault({ sheetUrl: ids.sheet.id, fetch: srv.fetch });
    expect(out.sheet.shape.radius).toBe(10);
    expect(JSON.stringify(out.sheet)).not.toContain("8px");
  });

  it("an out-of-range number or a hostile colour gives errors and the safe default sheet", async () => {
    for (const mut of [
      (s: ReturnType<typeof fakeServer>, i: SavedIds) => { s.store.get(i.sheet.id)!.facts["a:cornerRadius"] = 9999; },
      (s: ReturnType<typeof fakeServer>, i: SavedIds) => { (s.store.get(i.palette.id)!.facts["a:paletteColour"] as Record<string, string>[])[0]!["a:colourHex"] = "url(x)"; },
      (s: ReturnType<typeof fakeServer>, i: SavedIds) => { s.store.get(i.brandKit.id)!.facts["a:brandFont"] = "Inter;}body{x"; },
    ]) {
      const { srv, ids } = await seedVault(mut);
      const out = await loadStyleFromVault({ sheetUrl: ids.sheet.id, fetch: srv.fetch });
      expect(out.valid).toBe(false);
      expect(out.errors.length).toBeGreaterThan(0);
      expect(out.sheet).toEqual(defaultSheet());
    }
  });

  it("GETs are anonymous (no authorization header)", async () => {
    const { srv, ids } = await seedVault(() => {});
    srv.log.length = 0;
    await loadStyleFromVault({ sheetUrl: ids.sheet.id, fetch: srv.fetch });
    expect(srv.log.map((r) => r.method)).toEqual(["GET", "GET", "GET"]);
    for (const r of srv.log) expect(Object.keys(r.headers).sort()).toEqual(["accept"]);
  });

  it("makeVaultFetchRemote returns a valid sheet, and throws on unusable data", async () => {
    const { srv, ids } = await seedVault(() => {});
    const ok = (await makeVaultFetchRemote(ids.sheet.id, srv.fetch)()) as StyleSheet;
    expect(validateStyleSheet(ok).ok).toBe(true);
    const bad = await seedVault((s, i) => { s.store.get(i.palette.id)!.facts["a:paletteColour"] = []; });
    await expect(makeVaultFetchRemote(bad.ids.sheet.id, bad.srv.fetch)()).rejects.toThrow();
  });

  it("a logo uploaded on save comes back as the file entity URL", async () => {
    const srv = fakeServer();
    const ids = await saveStyle({ fetch: srv.fetch, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet: sheets[3]![1], logoPng: PNG });
    const out = await loadStyleFromVault({ sheetUrl: ids.sheet.id, fetch: srv.fetch });
    expect(out.sheet.logo?.primary).toBe(ids.logo);
  });
});

describe("no cookies to header-authenticated routes", () => {
  it("every styleStore fetch (writes, grants, reads) sends credentials omit", async () => {
    const srv = fakeServer();
    const seen: (RequestCredentials | undefined)[] = [];
    const spy = ((i: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.credentials);
      return srv.fetch(i, init);
    }) as typeof fetch;
    const ids = await saveStyle({ fetch: spy, auth }, { vaultBase: BASE, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet: sheets[3]![1], logoPng: PNG });
    await loadStyleFromVault({ sheetUrl: ids.sheet.id, fetch: spy });
    expect(seen.length).toBeGreaterThan(3);
    expect(seen.every((c) => c === "omit")).toBe(true);
  });
});

describe("toFetchUrl: identity URLs mapped to fetchable URLs", () => {
  const IDB = "https://x.localhost:8787";
  const toFetch = (u: string) => u.replace(IDB, "http://x.localhost:8787");
  const toId = (u: string) => u.replace("http://x.localhost:8787", IDB);
  const FETCHED = "http://x.localhost:8787/";

  it("save: every request and auth url is mapped, bodies and ids stay identity", async () => {
    const wire: { method: string; url: string; body?: unknown }[] = [];
    const authUrls: string[] = [];
    let n = 0;
    // Minimal server: refuses anything that is not the mapped http origin, answers with identity URIs.
    const f = (async (i: RequestInfo | URL, init?: RequestInit) => {
      const url = String(i);
      const method = init?.method ?? "GET";
      wire.push({ method, url, body: init?.body });
      if (!url.startsWith(FETCHED)) throw new TypeError("Failed to fetch");
      if (url.endsWith("/grant-direct")) return new Response(null, { status: 204 });
      if (method === "PUT" && url.includes("/files?name=")) {
        return new Response(JSON.stringify({ fileEntity: `${IDB}/lws/vault/${VID}/f/${++n}` }), { status: 201 });
      }
      return new Response(null, { status: 201, headers: { location: `${IDB}/lws/vault/${VID}/e/${++n}`, etag: '"1"' } });
    }) as typeof fetch;
    const au = async (_m: string, url: string) => {
      authUrls.push(url);
      return {};
    };
    const ids = await saveStyle({ fetch: f, auth: au, toFetchUrl: toFetch }, { vaultBase: IDB, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet: sheets[3]![1], logoPng: PNG });
    expect(wire.length).toBeGreaterThan(6);
    expect(wire.every((w) => w.url.startsWith(FETCHED))).toBe(true);
    expect(authUrls).toEqual(wire.map((w) => w.url));
    expect(wire.some((w) => w.url === `${FETCHED}base/authz/grant-direct`)).toBe(true);
    for (const id of [ids.sheet.id, ids.palette.id, ids.brandKit.id, ids.logo!]) expect(id.startsWith(`${IDB}/`)).toBe(true);
    const grants = wire.filter((w) => w.url.endsWith("/grant-direct")).map((w) => JSON.parse(String(w.body)) as { entity: string });
    expect(grants.length).toBe(4);
    expect(grants.every((b) => b.entity.startsWith(`${IDB}/`))).toBe(true);
    const posts = wire.filter((w) => w.method === "POST" && w.url.endsWith("/c")).map((w) => String(w.body)).join("");
    expect(posts).toContain(`"@id":"${IDB}/`);
    expect(posts).not.toContain("http://x.localhost");
    // update path: the PUT target is an identity id and is mapped too
    wire.length = 0;
    await saveStyle({ fetch: f, auth: au, toFetchUrl: toFetch }, { vaultBase: IDB, vaultId: VID, publicGrantee: PUBLIC_GRANTEE, sheet: sheets[3]![1], existing: ids });
    expect(wire.filter((w) => w.method === "PUT").length).toBe(3);
    expect(wire.every((w) => w.url.startsWith(FETCHED))).toBe(true);
  });

});

describe("entity URI, not LWS resource URL", () => {
  const H = "https://styletest.localhost:8787";
  const VAULT = `${H}/vault`;
  const mk = () => {
    const wire: { method: string; url: string; headers: Record<string, string>; body?: unknown }[] = [];
    let n = 0;
    const f = (async (i: RequestInfo | URL, init?: RequestInit) => {
      const url = String(i);
      const method = init?.method ?? "GET";
      wire.push({ method, url, headers: (init?.headers as Record<string, string>) ?? {}, body: init?.body });
      if (url.endsWith("/grant-direct")) return new Response(null, { status: 204 });
      if (url.includes("/files?name=")) return new Response(null, { status: 201, headers: { location: `${H}/lws/r/f${++n}` } });
      return new Response(null, { status: 201, headers: { location: `${H}/lws/r/r${++n}`, etag: '"1"' } });
    }) as typeof fetch;
    return { wire, f };
  };
  const grantsOf = (w: { url: string; body?: unknown }[]) => w.filter((x) => x.url.endsWith("/grant-direct")).map((x) => JSON.parse(String(x.body)) as { entity: string });

  it("default: grant entity, ids and @id links are <vault URI>/e/<id>; PUT goes to the resource URL with If-Match", async () => {
    const { wire, f } = mk();
    const ids = await saveStyle({ fetch: f, auth }, { vaultBase: H, vaultId: VAULT, publicGrantee: PUBLIC_GRANTEE, sheet: sheets[3]![1], logoPng: PNG });
    for (const id of [ids.sheet.id, ids.palette.id, ids.brandKit.id, ids.logo!]) expect(id).toMatch(/^https:\/\/styletest\.localhost:8787\/vault\/e\/[a-z0-9]+$/);
    expect(grantsOf(wire).map((g) => g.entity).sort()).toEqual([ids.sheet.id, ids.palette.id, ids.brandKit.id, ids.logo!].sort());
    const posts = wire.filter((w) => w.method === "POST" && w.url.endsWith("/c")).map((w) => String(w.body)).join("");
    expect(posts).not.toContain("/lws/r/");
    expect(posts).toContain(`"@id":"${ids.palette.id}"`);
    expect(posts).toContain(`"@id":"${ids.logo}"`);
    expect(ids.palette.resource).toMatch(/\/lws\/r\//);
    wire.length = 0;
    await saveStyle({ fetch: f, auth }, { vaultBase: H, vaultId: VAULT, publicGrantee: PUBLIC_GRANTEE, sheet: sheets[3]![1], existing: ids });
    const puts = wire.filter((w) => w.method === "PUT");
    expect(puts.map((p) => p.url)).toEqual([ids.palette.resource, ids.brandKit.resource, ids.sheet.resource]);
    expect(puts.every((p) => p.headers["if-match"] === '"1"')).toBe(true);
    expect(grantsOf(wire).every((g) => g.entity.includes("/vault/e/"))).toBe(true);
  });

  it("a supplied toEntityUri wins", async () => {
    const { wire, f } = mk();
    const ids = await saveStyle({ fetch: f, auth, toEntityUri: (u) => u.replace("/lws/r/", "/base/e/") }, { vaultBase: H, vaultId: VAULT, publicGrantee: PUBLIC_GRANTEE, sheet: sheets[3]![1] });
    expect(ids.sheet.id).toContain("/base/e/");
    expect(grantsOf(wire).every((g) => g.entity.includes("/base/e/"))).toBe(true);
  });

  it("loader GETs the entity URL (mapped through toFetchUrl)", async () => {
    const seen: string[] = [];
    const sheetId = `${VAULT}/e/s1`;
    const recs: Record<string, unknown> = {
      [sheetId]: { stylePalette: { "@id": `${VAULT}/e/p1` }, styleBrandKit: { "@id": `${VAULT}/e/b1` } },
      [`${VAULT}/e/p1`]: { paletteColour: [{ colourHex: "#112233", colourRole: "primary" }, { colourHex: "#ffffff", colourRole: "background" }, { colourHex: "#111111", colourRole: "text" }] },
      [`${VAULT}/e/b1`]: { brandFont: "Inter" },
    };
    const f = (async (i: RequestInfo | URL) => {
      seen.push(String(i));
      return new Response(JSON.stringify(recs[String(i).replace("http://", "https://")] ?? {}), { status: 200 });
    }) as typeof fetch;
    const r = await loadStyleFromVault({ sheetUrl: sheetId, fetch: f, toFetchUrl: (u) => u.replace("https://", "http://") });
    expect(r.errors).toEqual([]);
    expect(seen).toContain(`http://styletest.localhost:8787/vault/e/s1`);
    expect(seen.some((u) => u.includes("/lws/r/"))).toBe(false);
  });
});
