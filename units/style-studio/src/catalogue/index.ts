// The Wada set is ON by default (Kai, 2026-11-11). Credit: after Sanzo Wada, A Dictionary of Color Combinations (1933–34);
// data mattdesl/dictionary-of-colour-combinations (MIT).
import { contrastRatio, ensureContrast, parseColor, toHex } from "@kaigilb/gilbplatformcode-style-runtime";
import { paletteFromSeed, type Palette } from "@kaigilb/gilbplatformcode-style-runtime";
import { classicPalettes } from "./classic";
import { popPalettes } from "./pop";
import type { CataloguePalette } from "./types";

export type { CataloguePalette } from "./types";
export { popPalettes, classicPalettes };

export interface Catalogue {
  id: "pop" | "classic" | "wada";
  name: string;
  palettes: CataloguePalette[];
}

/** pop and classic only, synchronously. The Wada set is a separate chunk: see loadWadaCatalogue(). */
export function listCatalogues(): Catalogue[] {
  return [
    { id: "pop", name: "Popping", palettes: popPalettes },
    { id: "classic", name: "Classic", palettes: classicPalettes },
  ];
}

/** Loads the 348 Wada palettes on demand (dynamic import, so they stay out of the main bundle until asked for). */
export async function loadWadaCatalogue(): Promise<Catalogue> {
  const m = await import("./wada");
  return { id: "wada", name: "Wada", palettes: m.wadaPalettes };
}

/** Default page background per mode when the caller picks none. The palette never supplies paper or surface. */
export const DEFAULT_PAPER = { light: "#ffffff", dark: "#1c1c1e" } as const;

/**
 * Turn a catalogue palette into sheet colours. The palette gives accent and hues only. Paper comes from the background choice
 * (`paper`), surface is a small step from it, and ink, accent and status colours are contrast-repaired against both.
 */
export function paletteToSheetColors(palette: CataloguePalette, mode: "light" | "dark" = "light", paper: string = DEFAULT_PAPER[mode]): Palette {
  const parsed = palette.colors.map((c) => ({ hex: c, o: parseColor(c) })).filter((x): x is { hex: string; o: NonNullable<ReturnType<typeof parseColor>> } => x.o !== null);
  if (parsed.length === 0) throw new Error(`palette ${palette.id} has no usable colours`);
  const accentEntry = parsed.reduce((best, x) => (x.o.c > best.o.c ? x : best));
  const base = paletteFromSeed(accentEntry.hex, { mode, harmony: "mono" });
  const paperHex = toHex(parseColor(paper) ?? parseColor(DEFAULT_PAPER[mode])!);
  const po = parseColor(paperHex)!;
  const surface = toHex({ ...po, l: mode === "light" ? Math.max(po.l - 0.02, 0.01) : Math.min(po.l + 0.04, 0.99) });
  return rebuild(base, paperHex, base.ink, surface);
}

function rebuild(p: Palette, paper: string, ink: string, surface: string): Palette {
  let i = ensureContrast(ink, surface, 7);
  i = ensureContrast(i, paper, 7);
  const accent = ensureContrast(p.accent, paper, 3);
  const onAccent = contrastRatio("#ffffff", accent) >= contrastRatio("#111111", accent) ? "#ffffff" : "#111111";
  const fix = (c: string) => ensureContrast(ensureContrast(c, surface, 4.5), paper, 4.5);
  return {
    ...p,
    paper,
    surface,
    ink: i,
    lines: i,
    accent,
    onAccent: ensureContrast(onAccent, accent, 4.5),
    ok: fix(p.ok),
    warn: fix(p.warn),
    bad: fix(p.bad),
    secondary: ensureContrast(p.secondary, paper, 3),
    tertiary: ensureContrast(p.tertiary, paper, 3),
  };
}
