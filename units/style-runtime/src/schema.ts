// StyleSheet v1 and its validator. SECURITY: this is the only gate between untrusted style data and CSS text.
// Every string that css.ts interpolates must have passed through here (Value Sec.TokenInjection = 100%).

import { parseColor } from "./color";

export type ColorString = string;
export interface PaletteInput {
  accent: ColorString;
  paper: ColorString;
  ink: ColorString;
  surface?: ColorString;
  lines?: ColorString;
  ok?: ColorString;
  warn?: ColorString;
  bad?: ColorString;
  onAccent?: ColorString;
  /** The palette's original colours, in order (max 6). Used for chart colours; contrast-fixed when emitted. */
  extra?: ColorString[];
}
export interface FontRef {
  family: string;
  source: "system" | "bundled";
}
export interface StyleSheet {
  version: 1;
  name?: string;
  mode: "light" | "dark" | "system";
  palette: PaletteInput;
  dark?: PaletteInput;
  paletteSource?: {
    kind: "catalogue" | "seed" | "url" | "manual";
    catalogue?: string;
    combination?: number;
    seed?: string;
    url?: string;
    readAt?: string;
  };
  fonts: { sans: FontRef; serif?: FontRef; mono?: FontRef; baseSizePx: number; scaleRatio: number };
  shape: {
    radius: number;
    shadow: "none" | "soft" | "medium" | "strong";
    density: "compact" | "comfortable" | "spacious";
  };
  button: "filled" | "outline" | "soft" | "text" | "pill";
  window: "flat" | "bordered" | "card" | "glass";
  logo?: { primary?: string; mark?: string; favicon?: string };
}

export type ValidationResult = { ok: true; value: StyleSheet } | { ok: false; errors: string[] };

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`;
const NUMP = `${NUM}%?`;
const ANGLE = `${NUM}(?:deg)?`;
const WS = String.raw`\s*`;

export const COLOR_PATTERNS: readonly RegExp[] = [
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
  // rgb(r, g, b) / rgba(r, g, b, a) / rgb(r g b / a): numbers (and percent) only
  new RegExp(`^rgba?\\(${WS}${NUMP}${WS},${WS}${NUMP}${WS},${WS}${NUMP}${WS}(?:,${WS}${NUMP}${WS})?\\)$`),
  new RegExp(`^rgba?\\(${WS}${NUMP}\\s+${NUMP}\\s+${NUMP}${WS}(?:/${WS}${NUMP}${WS})?\\)$`),
  // oklch(L C H) / oklch(L C H / a)
  new RegExp(`^oklch\\(${WS}${NUMP}\\s+${NUMP}\\s+${ANGLE}${WS}(?:/${WS}${NUMP}${WS})?\\)$`),
  // hsl(h, s%, l%) / hsla(...) / hsl(h s% l% / a)
  new RegExp(`^hsla?\\(${WS}${ANGLE}${WS},${WS}${NUMP}${WS},${WS}${NUMP}${WS}(?:,${WS}${NUMP}${WS})?\\)$`),
  new RegExp(`^hsla?\\(${WS}${ANGLE}\\s+${NUMP}\\s+${NUMP}${WS}(?:/${WS}${NUMP}${WS})?\\)$`),
];

const FONT_RE = /^[A-Za-z0-9 -]{1,60}$/;
const DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const HTTPS_URL_RE = /^https:\/\/[^\s"'()]+$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const SAFE_TEXT_RE = /^[^\u0000-\u001f]*$/;

const FORBIDDEN: readonly RegExp[] = [/[;{}<>\\]/, /url\s*\(/i, /@import/i, /expression\s*\(/i, /\/\*/, /\*\//];

export function hasForbidden(s: string): boolean {
  return FORBIDDEN.some((re) => re.test(s));
}

export function isSafeColor(s: unknown): s is string {
  return typeof s === "string" && s.length <= 64 && !hasForbidden(s) && COLOR_PATTERNS.some((re) => re.test(s));
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function checkKeys(o: Obj, allowed: readonly string[], path: string, errors: string[]): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${path}.${k}: unknown key`);
}

function oneOf(v: unknown, opts: readonly string[], path: string, errors: string[]): void {
  if (typeof v !== "string" || !opts.includes(v)) errors.push(`${path}: must be one of ${opts.join(", ")}`);
}

function checkColor(v: unknown, path: string, errors: string[]): void {
  if (typeof v !== "string") return void errors.push(`${path}: must be a colour string`);
  if (hasForbidden(v)) return void errors.push(`${path}: contains forbidden characters or sequences`);
  if (!isSafeColor(v) || parseColor(v) === null) errors.push(`${path}: not an accepted colour (#hex, rgb(), oklch(), hsl() with numbers only)`);
}

function checkNumber(v: unknown, min: number, max: number, path: string, errors: string[]): void {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) errors.push(`${path}: must be a number from ${min} to ${max}`);
}

function checkFont(v: unknown, path: string, errors: string[]): void {
  if (!isObj(v)) return void errors.push(`${path}: must be an object {family, source}`);
  checkKeys(v, ["family", "source"], path, errors);
  if (typeof v.family !== "string") errors.push(`${path}.family: must be a string`);
  else if (hasForbidden(v.family) || !FONT_RE.test(v.family)) errors.push(`${path}.family: only letters, digits, spaces and hyphens, 1 to 60 characters`);
  oneOf(v.source, ["system", "bundled"], `${path}.source`, errors);
}

const PALETTE_KEYS = ["accent", "paper", "ink", "surface", "lines", "ok", "warn", "bad", "onAccent", "extra"] as const;

function checkPaletteShape(v: unknown, path: string, errors: string[]): void {
  if (!isObj(v)) return void errors.push(`${path}: must be an object`);
  checkKeys(v, PALETTE_KEYS, path, errors);
  for (const k of ["accent", "paper", "ink"] as const) if (v[k] === undefined) errors.push(`${path}.${k}: required`);
  for (const k of PALETTE_KEYS) {
    if (k === "extra" || v[k] === undefined) continue;
    checkColor(v[k], `${path}.${k}`, errors);
  }
  if (v.extra !== undefined) {
    if (!Array.isArray(v.extra)) errors.push(`${path}.extra: must be a list of colours`);
    else if (v.extra.length > 6) errors.push(`${path}.extra: at most 6 colours`);
    else v.extra.forEach((c, i) => checkColor(c, `${path}.extra[${i}]`, errors));
  }
}

function checkUrl(v: unknown, path: string, errors: string[]): void {
  if (typeof v !== "string") return void errors.push(`${path}: must be a string`);
  if (v.length > 200000) return void errors.push(`${path}: too long`);
  if (v.startsWith("data:")) {
    if (!DATA_IMAGE_RE.test(v)) errors.push(`${path}: data URLs must be data:image/(png|jpeg|webp);base64,...`);
    return;
  }
  if (hasForbidden(v) || !HTTPS_URL_RE.test(v) || v.length > 2048) {
    errors.push(`${path}: must be an absolute https: URL or a png/jpeg/webp base64 data URL`);
    return;
  }
  try {
    new URL(v);
  } catch {
    errors.push(`${path}: not a valid URL`);
  }
}

function checkText(v: unknown, max: number, path: string, errors: string[]): void {
  if (typeof v !== "string") return void errors.push(`${path}: must be a string`);
  if (v.length > max) errors.push(`${path}: at most ${max} characters`);
  if (hasForbidden(v) || !SAFE_TEXT_RE.test(v)) errors.push(`${path}: contains forbidden characters`);
}

export function validateStyleSheet(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["$: must be an object"] };
  const s = input;
  checkKeys(s, ["version", "name", "mode", "palette", "dark", "paletteSource", "fonts", "shape", "button", "window", "logo"], "$", errors);
  if (s.version !== 1) errors.push("$.version: must be 1");
  if (s.name !== undefined) checkText(s.name, 80, "$.name", errors);
  oneOf(s.mode, ["light", "dark", "system"], "$.mode", errors);
  checkPaletteShape(s.palette, "$.palette", errors);
  if (s.dark !== undefined) checkPaletteShape(s.dark, "$.dark", errors);

  if (s.paletteSource !== undefined) {
    const p = s.paletteSource;
    if (!isObj(p)) errors.push("$.paletteSource: must be an object");
    else {
      checkKeys(p, ["kind", "catalogue", "combination", "seed", "url", "readAt"], "$.paletteSource", errors);
      oneOf(p.kind, ["catalogue", "seed", "url", "manual"], "$.paletteSource.kind", errors);
      if (p.catalogue !== undefined) checkText(p.catalogue, 40, "$.paletteSource.catalogue", errors);
      if (p.combination !== undefined && (!Number.isInteger(p.combination) || (p.combination as number) < 0 || (p.combination as number) > 100000))
        errors.push("$.paletteSource.combination: must be a non-negative integer");
      if (p.seed !== undefined) checkText(p.seed, 64, "$.paletteSource.seed", errors);
      if (p.url !== undefined) checkUrl(p.url, "$.paletteSource.url", errors);
      if (p.readAt !== undefined && (typeof p.readAt !== "string" || !ISO_RE.test(p.readAt) || Number.isNaN(Date.parse(p.readAt))))
        errors.push("$.paletteSource.readAt: must be an ISO date string");
    }
  }

  if (!isObj(s.fonts)) errors.push("$.fonts: must be an object");
  else {
    const f = s.fonts;
    checkKeys(f, ["sans", "serif", "mono", "baseSizePx", "scaleRatio"], "$.fonts", errors);
    if (f.sans === undefined) errors.push("$.fonts.sans: required");
    else checkFont(f.sans, "$.fonts.sans", errors);
    if (f.serif !== undefined) checkFont(f.serif, "$.fonts.serif", errors);
    if (f.mono !== undefined) checkFont(f.mono, "$.fonts.mono", errors);
    checkNumber(f.baseSizePx, 12, 22, "$.fonts.baseSizePx", errors);
    checkNumber(f.scaleRatio, 1.067, 1.618, "$.fonts.scaleRatio", errors);
  }

  if (!isObj(s.shape)) errors.push("$.shape: must be an object");
  else {
    checkKeys(s.shape, ["radius", "shadow", "density"], "$.shape", errors);
    checkNumber(s.shape.radius, 0, 32, "$.shape.radius", errors);
    oneOf(s.shape.shadow, ["none", "soft", "medium", "strong"], "$.shape.shadow", errors);
    oneOf(s.shape.density, ["compact", "comfortable", "spacious"], "$.shape.density", errors);
  }

  oneOf(s.button, ["filled", "outline", "soft", "text", "pill"], "$.button", errors);
  oneOf(s.window, ["flat", "bordered", "card", "glass"], "$.window", errors);

  if (s.logo !== undefined) {
    if (!isObj(s.logo)) errors.push("$.logo: must be an object");
    else {
      checkKeys(s.logo, ["primary", "mark", "favicon"], "$.logo", errors);
      for (const k of ["primary", "mark", "favicon"]) if (s.logo[k] !== undefined) checkUrl(s.logo[k], `$.logo.${k}`, errors);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: input as unknown as StyleSheet };
}
