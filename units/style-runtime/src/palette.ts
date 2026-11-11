// Palette engine: one seed colour in, a full accessible palette out (OKLCH rules).
import { contrastRatio, ensureContrast, parseColor, toHex } from "./color";

export type Harmony = "complementary" | "analogous" | "triadic" | "split" | "mono";

export interface Palette {
  accent: string;
  paper: string;
  ink: string;
  surface: string;
  lines: string;
  ok: string;
  warn: string;
  bad: string;
  onAccent: string;
  /** charts / badges */
  secondary: string;
  tertiary: string;
}

export interface PaletteOptions {
  mode: "light" | "dark";
  harmony: Harmony;
}

const WHITE = "#ffffff";
const NEAR_BLACK = "#111111";
const wrap = (h: number) => ((h % 360) + 360) % 360;

export function paletteFromSeed(seed: string, opts: PaletteOptions): Palette {
  const s = parseColor(seed);
  if (!s) throw new Error(`paletteFromSeed: unparseable seed colour`);
  const dark = opts.mode === "dark";
  const hue = s.h;

  const paperL = dark ? 0.17 : 0.97;
  const paper = toHex({ l: paperL, c: Math.min(s.c, 0.012), h: hue });
  const surfL = dark ? paperL + 0.04 : Math.min(paperL + 0.015, 0.995);
  const surface = toHex({ l: surfL, c: Math.min(s.c, 0.012), h: hue });

  const accent = ensureContrast(toHex(s), paper, 3);

  let ink = toHex({ l: dark ? 0.93 : 0.25, c: Math.min(s.c, 0.02), h: hue });
  ink = ensureContrast(ink, surface, 7);
  ink = ensureContrast(ink, paper, 7);
  const lines = ink;

  const status = (h: number, startL: number) => ensureContrast(ensureContrast(toHex({ l: startL, c: 0.12, h }), surface, 4.5), paper, 4.5);
  const startL = dark ? 0.75 : 0.5;
  const ok = status(150, startL);
  const warn = status(75, startL);
  const bad = status(30, startL);

  const onWhite = contrastRatio(WHITE, accent);
  const onBlack = contrastRatio(NEAR_BLACK, accent);
  const onAccent = ensureContrast(onWhite >= onBlack ? WHITE : NEAR_BLACK, accent, 4.5);

  const a = parseColor(accent) ?? s;
  const rot = (d: number, dl = 0) => ensureContrast(toHex({ l: a.l + dl, c: a.c, h: wrap(a.h + d) }), paper, 3);
  let secondary: string;
  let tertiary: string;
  switch (opts.harmony) {
    case "complementary":
      secondary = rot(180);
      tertiary = rot(180, dark ? 0.1 : -0.1);
      break;
    case "analogous":
      secondary = rot(30);
      tertiary = rot(-30);
      break;
    case "triadic":
      secondary = rot(120);
      tertiary = rot(-120);
      break;
    case "split":
      secondary = rot(150);
      tertiary = rot(210);
      break;
    case "mono":
      secondary = rot(0, dark ? -0.12 : 0.12);
      tertiary = rot(0, dark ? 0.12 : -0.12);
      break;
  }

  return { accent, paper, ink, surface, lines, ok, warn, bad, onAccent, secondary, tertiary };
}

export interface PaletteCheckRow {
  pair: string;
  ratio: number;
  pass: boolean;
}

export function checkPalette(p: Pick<Palette, "accent" | "paper" | "ink" | "surface" | "ok" | "warn" | "bad" | "onAccent">): PaletteCheckRow[] {
  const row = (pair: string, fg: string, bg: string, min: number): PaletteCheckRow => {
    const ratio = contrastRatio(fg, bg);
    return { pair, ratio, pass: ratio >= min };
  };
  return [
    row("ink/paper", p.ink, p.paper, 7),
    row("ink/surface", p.ink, p.surface, 4.5),
    row("onAccent/accent", p.onAccent, p.accent, 4.5),
    row("accent/paper", p.accent, p.paper, 3),
    row("ok/paper", p.ok, p.paper, 4.5),
    row("warn/paper", p.warn, p.paper, 4.5),
    row("bad/paper", p.bad, p.paper, 4.5),
  ];
}
