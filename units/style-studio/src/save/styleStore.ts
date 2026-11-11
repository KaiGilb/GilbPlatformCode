// Save the style (and re-export the load) as typed records in the app's resource vault on GilbPlatform.
// Wire contract (measured): see README "Saving to the app resource vault".
// Reads accept BOTH `a:x` and bare `x` keys (the server returns bare keys); writes always use `a:` keys.
import { parseColor, toHex } from "@kaigilb/gilbplatformcode-style-runtime";
import { validateStyleSheet, type StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";

// The READ side (records -> sheet, anonymous load) lives in style-runtime so end users never download the studio; re-exported here.
export {
  linkId,
  recordsToSheet,
  recordsToSheetChecked,
  loadStyleFromVault,
  makeVaultFetchRemote,
  type RecordsInput,
  type LoadedStyle,
} from "@kaigilb/gilbplatformcode-style-runtime";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

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

