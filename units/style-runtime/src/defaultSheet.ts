// The style used when nothing can be read: a seeded blue, system fonts, card windows.
import { paletteFromSeed } from "./palette";
import type { Palette } from "./palette";
import type { PaletteInput, StyleSheet } from "./schema";

const pickInput = (p: Palette): PaletteInput => ({
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
