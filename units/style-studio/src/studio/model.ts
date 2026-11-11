// Pure helpers for the Studio. Colour maths, validation and CSS generation are NOT done here: they come from the Batch 1 modules.
import { contrastRatio, ensureContrast, parseColor, toHex } from "@kaigilb/gilbplatformcode-style-runtime";
import { checkPalette, paletteFromSeed, type Harmony, type Palette, type PaletteCheckRow } from "@kaigilb/gilbplatformcode-style-runtime";
import { paletteToSheetColors, type CataloguePalette } from "../catalogue/index";
import type { PaletteInput, StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";

export type Mode = "light" | "dark";

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

export function defaultSheet(): StyleSheet {
  const seed = "#3b6fd4";
  const light = paletteFromSeed(seed, { mode: "light", harmony: "analogous" });
  const dark = paletteFromSeed(seed, { mode: "dark", harmony: "analogous" });
  return {
    version: 1,
    name: "My app style",
    mode: "system",
    palette: pickInput(light),
    dark: pickInput(dark),
    paletteSource: { kind: "seed", seed },
    fonts: { sans: { family: "System Sans", source: "system" }, baseSizePx: 16, scaleRatio: 1.25 },
    shape: { radius: 10, shadow: "soft", density: "comfortable" },
    button: "filled",
    window: "card",
  };
}

export function sheetFromSeed(sheet: StyleSheet, seed: string, harmony: Harmony): StyleSheet {
  const light = paletteFromSeed(seed, { mode: "light", harmony });
  const dark = paletteFromSeed(seed, { mode: "dark", harmony });
  return withColors(sheet, light, dark, { kind: "seed", seed });
}

export function sheetFromCatalogue(sheet: StyleSheet, catalogue: string, pal: CataloguePalette): StyleSheet | null {
  try {
    const light = paletteToSheetColors(pal, "light");
    const dark = paletteToSheetColors(pal, "dark");
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
