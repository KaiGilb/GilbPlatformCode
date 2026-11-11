// Colour maths on top of culori (MIT). All lightness work is done in OKLCH.
import { parse, converter, formatHex, clampChroma, wcagContrast } from "culori";

const toOklch = converter("oklch");

export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

export function parseColor(s: string): Oklch | null {
  if (typeof s !== "string") return null;
  const parsed = parse(s);
  if (!parsed) return null;
  const o = toOklch(parsed);
  return { l: o.l, c: o.c, h: o.h ?? 0, alpha: o.alpha ?? 1 };
}

/** OKLCH to #rrggbb. Out-of-gamut colours are brought into sRGB by reducing chroma, hue and lightness kept. */
export function toHex(o: { l: number; c: number; h?: number; alpha?: number }): string {
  const clamped = clampChroma({ mode: "oklch", l: clamp01(o.l), c: Math.max(0, o.c), h: o.h ?? 0 }, "oklch");
  return formatHex(clamped);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function asHex(x: string | Oklch): string {
  if (typeof x === "string") {
    const p = parseColor(x);
    if (!p) throw new Error(`unparseable colour: ${x}`);
    return toHex(p);
  }
  return toHex(x);
}

/** WCAG 2.x contrast ratio, 1..21. Accepts any colour string or an Oklch value. */
export function contrastRatio(a: string | Oklch, b: string | Oklch): number {
  return wcagContrast(asHex(a), asHex(b));
}

export function meetsAA(fg: string | Oklch, bg: string | Oklch, opts: { large?: boolean } = {}): boolean {
  return contrastRatio(fg, bg) >= (opts.large ? 3 : 4.5);
}

/**
 * Move fg lightness (OKLCH) toward black or white, in small steps, until the target ratio against bg is met.
 * Picks the direction that reaches the target with the smaller move. If neither can reach it, returns the best reachable.
 */
export function ensureContrast(fg: string | Oklch, bg: string | Oklch, target = 4.5): string {
  const start = typeof fg === "string" ? parseColor(fg) : fg;
  if (!start) throw new Error(`unparseable colour: ${String(fg)}`);
  const bgHex = asHex(bg);
  const startHex = toHex(start);
  if (wcagContrast(startHex, bgHex) >= target) return startHex;

  const STEP = 0.004;
  const walk = (dir: 1 | -1): { hex: string; ok: boolean; best: number } => {
    let best = wcagContrast(startHex, bgHex);
    let bestHex = startHex;
    for (let l = start.l + dir * STEP; l >= -STEP && l <= 1 + STEP; l += dir * STEP) {
      const hex = toHex({ ...start, l });
      const r = wcagContrast(hex, bgHex);
      if (r > best) {
        best = r;
        bestHex = hex;
      }
      if (r >= target) return { hex, ok: true, best: r };
    }
    return { hex: bestHex, ok: false, best };
  };

  const up = walk(1);
  const down = walk(-1);
  if (up.ok && down.ok) {
    const dUp = Math.abs((parseColor(up.hex)?.l ?? 0) - start.l);
    const dDown = Math.abs((parseColor(down.hex)?.l ?? 0) - start.l);
    return dUp <= dDown ? up.hex : down.hex;
  }
  if (up.ok) return up.hex;
  if (down.ok) return down.hex;
  return up.best >= down.best ? up.hex : down.hex;
}
