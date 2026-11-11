// Read side of the app's style in its operating vault: anonymous GETs, records -> StyleSheet. No React, fonts or studio code,
// so an end user's app can apply its style without downloading the Style Studio.
// Reads accept BOTH `a:x` and bare `x` keys (the server returns bare keys).
import { validateStyleSheet, type PaletteInput, type StyleSheet } from "./schema";
import { defaultSheet } from "./defaultSheet";
import { isBundledFont } from "./fontNames";

type Fetch = typeof fetch;
const doFetch = (deps: { fetch?: Fetch }): Fetch => deps.fetch ?? ((...a) => globalThis.fetch(...a));

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
      return f === undefined ? undefined : { family: f, source: isBundledFont(f) ? "bundled" : "system" };
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
