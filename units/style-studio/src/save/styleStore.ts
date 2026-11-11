// Save / load the style as typed records in the app's resource vault on GilbPlatform.
// Wire contract (measured): see README "Saving to the app resource vault".
// Reads accept BOTH `a:x` and bare `x` keys (the server returns bare keys); writes always use `a:` keys.
import { parseColor, toHex } from "@kaigilb/gilbplatformcode-style-runtime";
import { validateStyleSheet, type PaletteInput, type StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import { defaultSheet } from "../studio/model";
import { findFont } from "../studio/fonts";

export interface StoreDeps {
  fetch?: typeof fetch;
  /** Supplied by the host app: DPoP (or other) headers for this exact method + url. */
  auth: (method: string, url: string) => Promise<Record<string, string>>;
  /** Maps an identity URL (always https) to the URL the browser can actually fetch (e.g. http on a local rig). Default: identity. */
  toFetchUrl?: (identityUrl: string) => string;
  /**
   * Maps the create response `location` (an LWS RESOURCE url, `/lws/r/<id>`) to the ENTITY URI that grant-direct,
   * `@id` links and anonymous reads use. Default: `<vault URI>/e/<id>` (the vault URI carries host and segment, `/base` or `/vault`).
   * Must leave a URL that is already an entity URI unchanged.
   */
  toEntityUri?: (resourceUrl: string) => string;
}

export interface VaultRecord {
  type: string;
  facts: Record<string, unknown>;
}

/** `id` is the ENTITY URI (identity; used for grants and links). `resource` is the LWS resource URL a PUT goes to (absent = `id`). */
export interface SavedRef {
  id: string;
  etag: string;
  resource?: string;
}

export interface SavedIds {
  sheet: SavedRef;
  palette: SavedRef;
  brandKit: SavedRef;
  logo?: string;
  logoMark?: string;
  favicon?: string;
}

export type SaveStep = "logo" | "palette" | "brandKit" | "sheet" | "grant" | "load";

export class StyleSaveError extends Error {
  /** Ids written before the failure, so a retry can pass them as `existing`. */
  ids?: Partial<SavedIds>;
  step: SaveStep;
  status: number;
  constructor(step: SaveStep, status: number, message: string) {
    super(message);
    this.step = step;
    this.status = status;
    this.name = "StyleSaveError";
  }
}
/** 412 (stale If-Match) or 428 (If-Match missing). Reload the record and try again. */
export class StaleEtagError extends StyleSaveError {
  constructor(step: SaveStep, status: number, message: string) {
    super(step, status, message);
    this.name = "StaleEtagError";
  }
}

// Same text as the Wada catalogue's source line (src/catalogue/wada.generated.ts); a test keeps them equal.
export const WADA_SOURCE_WORK =
  "after Sanzo Wada, A Dictionary of Color Combinations (1933–34); data mattdesl/dictionary-of-colour-combinations (MIT)";

// ------------------------------------------------------------------ sheet -> records
const hex6 = (c: string): string | undefined => {
  const p = parseColor(c);
  return p ? toHex(p) : undefined;
};
const r = (n: number, d: number) => String(Number(n.toFixed(d)));
const oklchText = (hex: string): string => {
  const p = parseColor(hex)!;
  return `oklch(${r(p.l * 100, 1)}% ${r(p.c, 3)} ${r(Number.isFinite(p.h) ? p.h : 0, 1)})`;
};
const colourItem = (c: string, role?: string): Record<string, string> | undefined => {
  const h = hex6(c);
  if (!h) return undefined;
  const item: Record<string, string> = { "a:colourHex": h, "a:colourOklch": oklchText(h) };
  if (role) item["a:colourRole"] = role;
  return item;
};

export function sheetToRecords(sheet: StyleSheet): {
  palette: VaultRecord;
  brandKit: VaultRecord;
  sheetFacts: (paletteId: string, brandKitId: string) => VaultRecord;
} {
  const p = sheet.palette;
  const extra = p.extra ?? [];
  const slots: [string | undefined, string | undefined][] = [
    [p.accent, "primary"],
    [p.paper, "background"],
    [p.surface, "surface"],
    [p.ink, "text"],
    [p.lines, "border"],
    [extra[0], "secondary"],
    [extra[1], "accent"],
    ...extra.slice(2, 6).map((c): [string, undefined] => [c, undefined]),
  ];
  const items = slots.flatMap(([c, role]) => (c ? [colourItem(c, role)].filter((x): x is Record<string, string> => !!x) : []));

  const pf: Record<string, unknown> = { "a:paletteColour": items };
  const src = sheet.paletteSource;
  if (src?.kind === "catalogue" && src.catalogue === "wada" && src.combination !== undefined) {
    pf["a:paletteSource"] = "publishedCombination";
    pf["a:combinationNumber"] = src.combination;
    pf["a:sourceWork"] = WADA_SOURCE_WORK;
  } else if (src?.kind === "seed" && src.seed) {
    pf["a:paletteSource"] = "seedColour";
    pf["a:seedColour"] = hex6(src.seed) ?? src.seed;
  } else if (src?.kind === "url" && src.url) {
    pf["a:paletteSource"] = "website";
    pf["a:url"] = src.url;
    if (src.readAt) pf["a:paletteReadAt"] = src.readAt;
  } else {
    pf["a:paletteSource"] = "handPicked";
  }

  const bf: Record<string, unknown> = { "a:brandFont": sheet.fonts.sans.family };
  if (sheet.fonts.serif) bf["a:brandHeadingFont"] = sheet.fonts.serif.family;
  if (sheet.fonts.mono) bf["a:brandCodeFont"] = sheet.fonts.mono.family;

  return {
    palette: { type: "t:ColourPalette", facts: pf },
    brandKit: { type: "t:BrandKit", facts: bf },
    sheetFacts: (paletteId, brandKitId) => {
      const f: Record<string, unknown> = {
        "a:stylePalette": { "@id": paletteId },
        "a:styleBrandKit": { "@id": brandKitId },
        "a:cornerRadius": sheet.shape.radius,
        "a:shadowDepth": sheet.shape.shadow,
        "a:spacingDensity": sheet.shape.density,
        "a:buttonStyle": sheet.button,
        "a:windowStyle": sheet.window,
        "a:baseFontSize": sheet.fonts.baseSizePx,
        "a:typeScaleRatio": sheet.fonts.scaleRatio,
        "a:defaultThemeMode": sheet.mode,
      };
      if (sheet.paletteSource?.kind === "url" && sheet.paletteSource.url) f["a:url"] = sheet.paletteSource.url;
      return { type: "t:AppStyleSheet", facts: f };
    },
  };
}

// ------------------------------------------------------------------ records -> sheet
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Attribute value by bare or `a:` key; unwraps single-element arrays and `{"@value": x}`. */
function get(o: unknown, name: string): unknown {
  if (!isObj(o)) return undefined;
  let v = o[`a:${name}`] !== undefined ? o[`a:${name}`] : o[name];
  if (Array.isArray(v) && v.length === 1) v = v[0];
  if (isObj(v) && "@value" in v) v = v["@value"];
  return v;
}
const getStr = (o: unknown, name: string): string | undefined => {
  const v = get(o, name);
  return typeof v === "string" ? v : undefined;
};
function getNum(o: unknown, name: string): number | undefined {
  const v = get(o, name);
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(v.trim())) return Number(v);
  return undefined;
}
/** `@id` link value as `{"@id": x}` or a plain string. */
export function linkId(o: unknown, name: string): string | undefined {
  let v = get(o, name);
  if (Array.isArray(v)) v = v[0];
  if (typeof v === "string") return v;
  if (isObj(v) && typeof v["@id"] === "string") return v["@id"];
  return undefined;
}
function getList(o: unknown, name: string): unknown[] {
  if (!isObj(o)) return [];
  const v = o[`a:${name}`] !== undefined ? o[`a:${name}`] : o[name];
  if (Array.isArray(v)) return v;
  if (isObj(v) && Array.isArray(v["@list"])) return v["@list"] as unknown[];
  return v === undefined ? [] : [v];
}
const pick = <T extends string>(v: unknown, allowed: readonly T[], dflt: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : dflt);

export interface RecordsInput {
  /** The sheet whose non-stored fields (name, dark override, ok/warn/bad/onAccent) are NOT taken from the vault. */
  sheet?: StyleSheet;
  palette: unknown;
  brandKit: unknown;
  /** The AppStyleSheet record itself (closed-set words, numbers, mode). */
  sheetRecord?: unknown;
  /** Resolved logo URLs (the file entity URIs), by role. */
  logo?: { primary?: string; mark?: string; favicon?: string };
}

/**
 * Map vault records to a StyleSheet, then validate. Unknown/invalid closed-set words fall back to the defaults
 * (shadow none, density comfortable, button filled, window flat, mode system). On any validation failure the
 * default sheet is returned together with the errors. Never throws.
 */
export function recordsToSheet(input: RecordsInput): StyleSheet {
  return recordsToSheetChecked(input).sheet;
}

export function recordsToSheetChecked(input: RecordsInput): { sheet: StyleSheet; errors: string[]; valid: boolean } {
  const base = defaultSheet();
  const rec = input.sheetRecord ?? input.sheet;
  try {
    const items = getList(input.palette, "paletteColour").filter(isObj);
    const byRole = new Map<string, string>();
    const noRole: string[] = [];
    let first: string | undefined;
    for (const it of items) {
      const hex = getStr(it, "colourHex");
      if (hex === undefined) continue;
      const role = getStr(it, "colourRole");
      first ??= hex;
      if (role) {
        if (!byRole.has(role)) byRole.set(role, hex);
      } else noRole.push(hex);
    }
    const accent = byRole.get("primary") ?? first;
    const paper = byRole.get("background");
    const ink = byRole.get("text");
    const palette: PaletteInput = { accent: accent as string, paper: paper as string, ink: ink as string };
    const surface = byRole.get("surface");
    const lines = byRole.get("border");
    if (surface) palette.surface = surface;
    if (lines) palette.lines = lines;
    const secondary = byRole.get("secondary");
    const acc2 = byRole.get("accent");
    const extra = [...(secondary ? [secondary] : []), ...(acc2 ? [acc2] : []), ...noRole];
    if (extra.length) palette.extra = extra.slice(0, 6);

    const srcKind = getStr(input.palette, "paletteSource");
    let paletteSource: StyleSheet["paletteSource"] = { kind: "manual" };
    if (srcKind === "publishedCombination") {
      const n = getNum(input.palette, "combinationNumber");
      paletteSource = n !== undefined ? { kind: "catalogue", catalogue: "wada", combination: n } : { kind: "manual" };
    } else if (srcKind === "seedColour") {
      const seed = getStr(input.palette, "seedColour");
      paletteSource = seed ? { kind: "seed", seed } : { kind: "manual" };
    } else if (srcKind === "website") {
      const url = getStr(input.palette, "url") ?? getStr(rec, "url");
      const readAt = getStr(input.palette, "paletteReadAt");
      paletteSource = url ? { kind: "url", url, ...(readAt ? { readAt } : {}) } : { kind: "manual" };
    }

    const fam = (name: string): { family: string; source: "system" | "bundled" } | undefined => {
      const f = getStr(input.brandKit, name);
      return f === undefined ? undefined : { family: f, source: findFont(f) ? "bundled" : "system" };
    };
    const sans = fam("brandFont") ?? base.fonts.sans;
    const serif = fam("brandHeadingFont");
    const mono = fam("brandCodeFont");

    const sheet: StyleSheet = {
      version: 1,
      mode: pick(get(rec, "defaultThemeMode"), ["light", "dark", "system"], "system"),
      palette,
      paletteSource,
      fonts: {
        sans,
        ...(serif ? { serif } : {}),
        ...(mono ? { mono } : {}),
        baseSizePx: getNum(rec, "baseFontSize") ?? base.fonts.baseSizePx,
        scaleRatio: getNum(rec, "typeScaleRatio") ?? base.fonts.scaleRatio,
      },
      shape: {
        radius: getNum(rec, "cornerRadius") ?? base.shape.radius,
        shadow: pick(get(rec, "shadowDepth"), ["none", "soft", "medium", "strong"], "none"),
        density: pick(get(rec, "spacingDensity"), ["compact", "comfortable", "spacious"], "comfortable"),
      },
      button: pick(get(rec, "buttonStyle"), ["filled", "outline", "soft", "text", "pill"], "filled"),
      window: pick(get(rec, "windowStyle"), ["flat", "bordered", "card", "glass"], "flat"),
    };
    const lg = input.logo;
    if (lg && (lg.primary || lg.mark || lg.favicon)) {
      sheet.logo = { ...(lg.primary ? { primary: lg.primary } : {}), ...(lg.mark ? { mark: lg.mark } : {}), ...(lg.favicon ? { favicon: lg.favicon } : {}) };
    }
    const v = validateStyleSheet(sheet);
    if (v.ok) return { sheet: v.value, errors: [], valid: true };
    return { sheet: base, errors: v.errors, valid: false };
  } catch (e) {
    return { sheet: base, errors: [`style records could not be read: ${e instanceof Error ? e.message : String(e)}`], valid: false };
  }
}

// ------------------------------------------------------------------ http
type Fetch = typeof fetch;
const doFetch = (deps: { fetch?: Fetch }): Fetch => deps.fetch ?? ((...a) => globalThis.fetch(...a));

async function readText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

async function send(
  deps: StoreDeps,
  step: SaveStep,
  method: "POST" | "PUT",
  url: string,
  headers: Record<string, string>,
  body: string | Blob,
): Promise<Response> {
  let res: Response;
  try {
    url = (deps.toFetchUrl ?? ((u: string) => u))(url);
    const a = await deps.auth(method, url);
    res = await doFetch(deps)(url, { method, headers: { ...a, ...headers }, body, credentials: "omit" });
  } catch (e) {
    throw new StyleSaveError(step, 0, `The ${step} step could not reach the server: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const text = await readText(res);
    if (res.status === 412 || res.status === 428) {
      throw new StaleEtagError(step, res.status, `The ${step} record changed since it was loaded (HTTP ${res.status}). Reload and save again.`);
    }
    throw new StyleSaveError(step, res.status, `The ${step} step failed (HTTP ${res.status})${text ? `: ${text}` : ""}`);
  }
  return res;
}

async function entityOf(res: Response, step: SaveStep, keys: string[]): Promise<string> {
  let body: unknown;
  try {
    body = await res.clone().json();
  } catch {
    body = undefined;
  }
  if (isObj(body)) {
    for (const k of keys) {
      const v = body[k];
      if (typeof v === "string") return v;
      if (isObj(v) && typeof v["@id"] === "string") return v["@id"] as string;
    }
  }
  const loc = res.headers.get("location");
  if (loc) return loc;
  throw new StyleSaveError(step, res.status, `The ${step} step did not return the record address.`);
}

export interface SaveStyleOptions {
  vaultBase: string;
  vaultId: string;
  /** The address of the vault's "public" grantee, supplied by the host. Every grant of public read goes to it. */
  publicGrantee: string;
  sheet: StyleSheet;
  logoPng?: Blob;
  logoMarkPng?: Blob;
  faviconPng?: Blob;
  existing?: SavedIds;
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/** `/lws/r/<id>` resource URL -> `<vault URI>/e/<id>`; anything else (already an entity URI) is returned unchanged. */
export function defaultEntityUri(vaultId: string, origin: string): (resourceUrl: string) => string {
  return (url) => {
    const m = /\/lws\/r\/([^/?#]+)/.exec(url);
    if (!m) return url;
    let base = `${origin}/base`;
    try {
      const v = new URL(vaultId);
      base = `${v.origin}${trimSlash(v.pathname)}`;
    } catch {
      /* vaultId is not a URI: the system-vault segment */
    }
    return `${base}/e/${m[1]}`;
  };
}

export async function saveStyle(deps: StoreDeps, opts: SaveStyleOptions): Promise<SavedIds> {
  const valid = validateStyleSheet(opts.sheet);
  if (!valid.ok) throw new StyleSaveError("sheet", 0, `The style is not valid: ${valid.errors.join("; ")}`);
  const base = `${trimSlash(opts.vaultBase)}/lws/vault/${encodeURIComponent(opts.vaultId)}`;
  const origin = new URL(opts.vaultBase).origin;
  const ex = opts.existing;
  const toEntity = deps.toEntityUri ?? defaultEntityUri(opts.vaultId, origin);
  const json = { "content-type": "application/json" };
  const files: Record<"logo" | "logoMark" | "favicon", string | undefined> = { logo: ex?.logo, logoMark: ex?.logoMark, favicon: ex?.favicon };
  const grants: { entity: string; type: string; facts: Record<string, unknown> }[] = [];

  const upload = async (key: "logo" | "logoMark" | "favicon", blob: Blob | undefined, name: string) => {
    if (!blob) return;
    const url = `${base}/files?name=${encodeURIComponent(name)}`;
    const res = await send(deps, "logo", "PUT", url, { "content-type": "image/png" }, blob);
    const id = toEntity(await entityOf(res, "logo", ["fileEntity", "entity", "@id"]));
    files[key] = id;
    let facts: Record<string, unknown> = {};
    try {
      const b = (await res.clone().json()) as unknown;
      if (isObj(b) && isObj(b.facts)) facts = b.facts;
    } catch {
      /* no body facts */
    }
    grants.push({ entity: id, type: "t:ImageFile", facts });
  };

  const written: Partial<SavedIds> = {};
  try {
    // Files first: the BrandKit links to them.
    await upload("logo", opts.logoPng, "logo.png");
    await upload("logoMark", opts.logoMarkPng, "logo-mark.png");
    await upload("favicon", opts.faviconPng, "favicon.png");
    for (const k of ["logo", "logoMark", "favicon"] as const) if (files[k]) written[k] = files[k];

    const recs = sheetToRecords(valid.value);
    const bk = recs.brandKit;
    if (files.logo) bk.facts["a:brandLogo"] = { "@id": files.logo };
    if (files.logoMark) bk.facts["a:brandLogoMark"] = { "@id": files.logoMark };
    if (files.favicon) bk.facts["a:brandFavicon"] = { "@id": files.favicon };

    const write = async (step: "palette" | "brandKit" | "sheet", rec: VaultRecord, prev?: SavedRef) => {
      const body = JSON.stringify({ type: rec.type, facts: rec.facts });
      let res: Response;
      let resource: string;
      if (prev) {
        resource = prev.resource ?? prev.id;
        res = await send(deps, step, "PUT", resource, { ...json, "if-match": prev.etag }, body);
      } else {
        res = await send(deps, step, "POST", `${base}/c`, json, body);
        resource = await entityOf(res, step, ["@id"]);
      }
      const id = toEntity(resource);
      const etag = res.headers.get("etag") ?? prev?.etag ?? "";
      grants.push({ entity: id, type: rec.type, facts: rec.facts });
      return { id, etag, resource };
    };

    const palette = await write("palette", recs.palette, ex?.palette);
    written.palette = palette;
    const brandKit = await write("brandKit", bk, ex?.brandKit);
    written.brandKit = brandKit;
    const sheetRec = recs.sheetFacts(palette.id, brandKit.id);
    const sheet = await write("sheet", sheetRec, ex?.sheet);
    written.sheet = sheet;

    // Grants only after every write succeeded, so a failed write never leaves a half-public style.
    for (const g of grants) {
      await send(deps, "grant", "POST", `${origin}/base/authz/grant-direct`, json, JSON.stringify({ entity: g.entity, principal: opts.publicGrantee, type: g.type, facts: g.facts }));
    }
    return { sheet, palette, brandKit, ...(files.logo ? { logo: files.logo } : {}), ...(files.logoMark ? { logoMark: files.logoMark } : {}), ...(files.favicon ? { favicon: files.favicon } : {}) };
  } catch (e) {
    if (e instanceof StyleSaveError) e.ids = written;
    throw e;
  }
}

// ------------------------------------------------------------------ load (anonymous)
export interface LoadedStyle {
  sheet: StyleSheet;
  errors: string[];
  /** false when the vault data was unreachable or failed validation (sheet is then the default). */
  valid: boolean;
}

async function getJson(f: Fetch, url: string, toFetchUrl: (u: string) => string = (u) => u): Promise<Obj> {
  const res = await f(toFetchUrl(url), { method: "GET", headers: { accept: "application/ld+json, application/json" }, credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const body = (await res.json()) as unknown;
  if (isObj(body) && Array.isArray(body["@graph"])) {
    const g = (body["@graph"] as unknown[]).filter(isObj);
    return g.find((n) => n["@id"] === url) ?? g[0] ?? {};
  }
  if (!isObj(body)) throw new Error(`unexpected body from ${url}`);
  return body;
}

function safeLink(id: string | undefined, sheetUrl: string, what: string): string {
  if (!id) throw new Error(`the style sheet has no ${what} link`);
  const u = new URL(id, sheetUrl);
  if (u.protocol !== "https:") throw new Error(`${what} link is not https`);
  if (u.origin !== new URL(sheetUrl).origin) throw new Error(`${what} link points to another site`);
  return u.toString();
}

export async function loadStyleFromVault(opts: { sheetUrl: string; fetch?: Fetch; toFetchUrl?: (identityUrl: string) => string }): Promise<LoadedStyle> {
  const f = doFetch(opts);
  const m = opts.toFetchUrl ?? ((u: string) => u);
  try {
    // Safety checks (https, same origin) run on IDENTITY URLs; only the outgoing GET is mapped.
    const sheetRec = await getJson(f, opts.sheetUrl, m);
    const pUrl = safeLink(linkId(sheetRec, "stylePalette"), opts.sheetUrl, "palette");
    const bUrl = safeLink(linkId(sheetRec, "styleBrandKit"), opts.sheetUrl, "brand kit");
    const [palette, brandKit] = await Promise.all([getJson(f, pUrl, m), getJson(f, bUrl, m)]);
    const logo: { primary?: string; mark?: string; favicon?: string } = {};
    for (const [k, n] of [["primary", "brandLogo"], ["mark", "brandLogoMark"], ["favicon", "brandFavicon"]] as const) {
      const id = linkId(brandKit, n);
      if (!id) continue;
      try {
        logo[k] = safeLink(id, opts.sheetUrl, n);
      } catch {
        /* a logo link that is not ours is dropped, not fatal */
      }
    }
    return recordsToSheetChecked({ palette, brandKit, sheetRecord: sheetRec, logo });
  } catch (e) {
    return { sheet: defaultSheet(), errors: [`vault: ${e instanceof Error ? e.message : String(e)}`], valid: false };
  }
}

/** For the runtime `loadStyle({ fetchRemote })`. Throws when the vault data is unusable, so the cache / fallback is used. */
export function makeVaultFetchRemote(sheetUrl: string, fetchImpl?: Fetch, toFetchUrl?: (identityUrl: string) => string): () => Promise<unknown> {
  return async () => {
    const r = await loadStyleFromVault({ sheetUrl, fetch: fetchImpl, toFetchUrl });
    if (!r.valid) throw new Error(r.errors.join("; ") || "vault style invalid");
    return r.sheet;
  };
}
