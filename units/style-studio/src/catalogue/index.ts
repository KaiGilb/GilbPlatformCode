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

/** Turn a catalogue palette into sheet colours (accent, paper, ink, ...). Contrast is always enforced. */
export function paletteToSheetColors(palette: CataloguePalette, mode: "light" | "dark" = "light"): Palette {
  const parsed = palette.colors.map((c) => ({ hex: c, o: parseColor(c) })).filter((x): x is { hex: string; o: NonNullable<ReturnType<typeof parseColor>> } => x.o !== null);
  if (parsed.length === 0) throw new Error(`palette ${palette.id} has no usable colours`);
  const accentEntry = parsed.reduce((best, x) => (x.o.c > best.o.c ? x : best));
  const base = paletteFromSeed(accentEntry.hex, { mode, harmony: "mono" });
  const light = parsed.find((x) => x.o.l > 0.93);
  const darkC = parsed.find((x) => x.o.l < 0.3);
  if (!light || !darkC) return base;
  // The palette brings its own paper and ink. Use them (dark mode swaps the roles), then rerun the contrast step.
  const paperHex = mode === "light" ? light.hex : darkC.hex;
  const inkHex = mode === "light" ? darkC.hex : light.hex;
  const surfaceO = parseColor(paperHex)!;
  const surface = toHex({ ...surfaceO, l: mode === "light" ? Math.min(surfaceO.l + 0.015, 0.995) : surfaceO.l + 0.04 });
  // Re-derive everything that depends on paper/ink by running the engine's rules on the chosen pair.
  return rebuild(base, paperHex, inkHex, surface);
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
