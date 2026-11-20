// Pure helpers for the Studio. Colour maths, validation and CSS generation are NOT done here: they come from the Batch 1 modules.
import { contrastRatio, ensureContrast, parseColor, toHex } from "@kaigilb/gilbplatformcode-style-runtime";
import { checkPalette, paletteFromSeed, type Harmony, type Palette, type PaletteCheckRow } from "@kaigilb/gilbplatformcode-style-runtime";
import { paletteToSheetColors, type CataloguePalette } from "../catalogue/index";
import type { PaletteInput, StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";

export type Mode = "light" | "dark";

export interface BackgroundOption {
  id: string;
  name: string;
  hex: string;
}

/** The page backgrounds the Studio offers, apart from the palette. Light always starts with white. */
export const BACKGROUND_OPTIONS: Record<Mode, readonly BackgroundOption[]> = {
  light: [
    { id: "white", name: "White", hex: "#ffffff" },
    { id: "warm-off-white", name: "Warm off-white", hex: "#faf8f5" },
    { id: "cool-off-white", name: "Cool off-white", hex: "#f6f8fa" },
    { id: "ivory", name: "Ivory", hex: "#fbf9ee" },
    { id: "light-grey", name: "Light grey", hex: "#f2f2f2" },
    { id: "light-blue", name: "Very light blue", hex: "#eef5fc" },
    { id: "light-green", name: "Very light green", hex: "#eef7f0" },
    { id: "light-rose", name: "Very light rose", hex: "#fdf0f2" },
  ],
  dark: [
    { id: "near-black", name: "Near black", hex: "#0f0f10" },
    { id: "dark-grey", name: "Dark grey", hex: "#1c1c1e" },
    { id: "dark-navy", name: "Dark navy", hex: "#0e1726" },
    { id: "dark-slate", name: "Dark slate", hex: "#1b2330" },
    { id: "dark-warm", name: "Dark warm", hex: "#211c17" },
  ],
};

/** Surface is a small step from paper: a little darker in light mode, a little lighter in dark mode. */
export function surfaceFromPaper(paperHex: string, mode: Mode): string {
  const o = parseColor(paperHex) ?? { l: mode === "dark" ? 0.17 : 0.97, c: 0, h: 0, alpha: 1 };
  return toHex({ l: mode === "dark" ? Math.min(o.l + 0.04, 0.99) : Math.max(o.l - 0.02, 0.01), c: o.c, h: o.h });
}

/**
 * Put a palette on a chosen paper. Paper and surface come from the background choice; ink, accent and the status colours are repaired
 * against both with ensureContrast, the same way paletteFromBrand does. Accent and the hues are kept.
 */
export function onPaper(p: PaletteInput, mode: Mode, paperIn: string): PaletteInput {
  const paper = toHex(parseColor(paperIn) ?? { l: mode === "dark" ? 0.17 : 0.97, c: 0, h: 0 });
  const surface = surfaceFromPaper(paper, mode);
  const gen = paletteFromSeed(p.accent, { mode, harmony: "mono" });
  const ink = ensureContrast(ensureContrast(p.ink, surface, 7), paper, 7);
  const accent = ensureContrast(p.accent, paper, 3);
  const onAccent = ensureContrast(contrastRatio("#ffffff", accent) >= contrastRatio("#111111", accent) ? "#ffffff" : "#111111", accent, 4.5);
  const fix = (c: string) => ensureContrast(ensureContrast(c, surface, 4.5), paper, 4.5);
  return { ...p, accent, paper, surface, ink, lines: ink, onAccent, ok: fix(p.ok ?? gen.ok), warn: fix(p.warn ?? gen.warn), bad: fix(p.bad ?? gen.bad) };
}

/**
 * Change the background for one mode only. For a hand-typed palette (source "manual") only paper and surface change and every typed
 * colour is kept byte for byte (Kai, 2026-11-20); the Save tab's contrast report shows any failure. Other palettes are contrast-repaired.
 */
export function withBackground(sheet: StyleSheet, mode: Mode, paper: string): StyleSheet {
  const hand = sheet.paletteSource?.kind === "manual";
  const put = (p: PaletteInput): PaletteInput => {
    if (!hand) return onPaper(p, mode, paper);
    const hex = toHex(parseColor(paper) ?? { l: mode === "dark" ? 0.17 : 0.97, c: 0, h: 0 });
    return { ...p, paper: hex, surface: surfaceFromPaper(hex, mode) };
  };
  if (mode === "light") return { ...sheet, palette: put(sheet.palette) };
  const base: PaletteInput = sheet.dark ?? pickInput(paletteFromSeed(sheet.palette.accent, { mode: "dark", harmony: "mono" }));
  return { ...sheet, dark: put(base) };
}

/** The paper a sheet currently has for a mode (the generated one when the sheet has no dark palette). */
export function currentPaper(sheet: StyleSheet, mode: Mode): string {
  return (mode === "dark" ? sheet.dark?.paper : sheet.palette.paper) ?? paletteFromSeed(sheet.palette.accent, { mode, harmony: "mono" }).paper;
}

export const pickInput = (p: Palette): PaletteInput => ({
  accent: p.accent,
  paper: p.paper,
  ink: p.ink,
  surface: p.surface,
  lines: p.lines,
  ok: p.ok,
  warn: p.warn,
  bad: p.bad,
  onAccent: p.onAccent,
});

export function withColors(sheet: StyleSheet, light: Palette, dark: Palette, source: StyleSheet["paletteSource"], extra?: string[]): StyleSheet {
  const palette = pickInput(light);
  if (extra?.length) palette.extra = extra.slice(0, 6);
  return { ...sheet, palette, dark: pickInput(dark), paletteSource: source };
}

export { defaultSheet } from "@kaigilb/gilbplatformcode-style-runtime";

export function sheetFromSeed(sheet: StyleSheet, seed: string, harmony: Harmony): StyleSheet {
  // The background is its own choice: a new seed changes accent and hues only, so the sheet's paper stays.
  const light = paletteFromSeed(seed, { mode: "light", harmony });
  const dark = paletteFromSeed(seed, { mode: "dark", harmony });
  const out = withColors(sheet, light, dark, { kind: "seed", seed });
  return { ...out, palette: { ...onPaper(out.palette, "light", currentPaper(sheet, "light")), ...(out.palette.extra ? { extra: out.palette.extra } : {}) }, dark: onPaper(out.dark!, "dark", currentPaper(sheet, "dark")) };
}

export function sheetFromCatalogue(sheet: StyleSheet, catalogue: string, pal: CataloguePalette): StyleSheet | null {
  try {
    // The palette brings accent and hues only; the sheet keeps its own paper for each mode.
    const light = paletteToSheetColors(pal, "light", currentPaper(sheet, "light"));
    const dark = paletteToSheetColors(pal, "dark", currentPaper(sheet, "dark"));
    const source: NonNullable<StyleSheet["paletteSource"]> = { kind: "catalogue", catalogue };
    if (catalogue === "wada") {
      const n = Number.parseInt(pal.id.replace(/^wada-/, ""), 10);
      if (Number.isInteger(n) && n >= 0) source.combination = n;
    }
    // Keep every original colour, in order, so the preview's chart row is not limited to accent-derived hues.
    return withColors(sheet, light, dark, source, pal.colors.slice(0, 6));
  } catch {
    return null;
  }
}

/** Build a palette from brand colours picked on a website. Contrast is repaired with the Batch 1 functions. */
export function paletteFromBrand(accent: string, paper: string | undefined, ink: string | undefined, mode: Mode, harmony: Harmony): Palette {
  const base = paletteFromSeed(accent, { mode, harmony });
  if (!paper && !ink) return base;
  const paperO = paper ? parseColor(paper) : null;
  const paperHex = paperO ? toHex(paperO) : base.paper;
  const pO = parseColor(paperHex) ?? { l: 0.97, c: 0, h: 0, alpha: 1 };
  const surface = toHex({ l: mode === "dark" ? pO.l + 0.04 : Math.min(pO.l + 0.015, 0.995), c: pO.c, h: pO.h });
  const inkO = ink ? parseColor(ink) : null;
  let inkHex = inkO ? toHex(inkO) : base.ink;
  inkHex = ensureContrast(ensureContrast(inkHex, surface, 7), paperHex, 7);
  const acc = ensureContrast(base.accent, paperHex, 3);
  const onAccent = ensureContrast(contrastRatio("#ffffff", acc) >= contrastRatio("#111111", acc) ? "#ffffff" : "#111111", acc, 4.5);
  const fix = (c: string) => ensureContrast(ensureContrast(c, surface, 4.5), paperHex, 4.5);
  return {
    ...base,
    accent: acc,
    paper: paperHex,
    surface,
    ink: inkHex,
    lines: inkHex,
    onAccent,
    ok: fix(base.ok),
    warn: fix(base.warn),
    bad: fix(base.bad),
    secondary: ensureContrast(base.secondary, paperHex, 3),
    tertiary: ensureContrast(base.tertiary, paperHex, 3),
  };
}

/** Fill the optional anchors so checkPalette can judge any sheet (including imported ones). */
export function resolvePalette(sheet: StyleSheet, mode: Mode): Pick<Palette, "accent" | "paper" | "ink" | "surface" | "ok" | "warn" | "bad" | "onAccent"> {
  const given = mode === "dark" ? sheet.dark : sheet.palette;
  const gen = paletteFromSeed(sheet.palette.accent, { mode, harmony: "mono" });
  if (!given) return gen;
  const onAccent = given.onAccent ?? (contrastRatio("#ffffff", given.accent) >= contrastRatio("#111111", given.accent) ? "#ffffff" : "#111111");
  return {
    accent: given.accent,
    paper: given.paper,
    ink: given.ink,
    surface: given.surface ?? given.paper,
    ok: given.ok ?? gen.ok,
    warn: given.warn ?? gen.warn,
    bad: given.bad ?? gen.bad,
    onAccent,
  };
}

export interface ReportRow extends PaletteCheckRow {
  mode: Mode;
}

export function contrastReport(sheet: StyleSheet): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const mode of ["light", "dark"] as const) {
    try {
      for (const r of checkPalette(resolvePalette(sheet, mode))) rows.push({ ...r, mode });
    } catch {
      rows.push({ mode, pair: "colours could not be read", ratio: 0, pass: false });
    }
  }
  return rows;
}

export const clampRadius = (n: number): number => Math.min(32, Math.max(0, Math.round(n)));
