/**
 * The open button's colours. Open, the button is filled with the host's accent; a host's theme may let a person
 * choose any accent (GilbApp's Custom theme), while `--on-accent` is fixed by the base theme. So the label's colour
 * is chosen from the accent actually drawn: of the host's two text tokens (`--on-accent` and `--ink`), the one with
 * the higher contrast on the accent. When neither reaches 4.5:1 (a mid-tone accent), the fill is mixed toward the
 * darker token, in steps, until the lighter token reaches it, so every accent gives a readable label
 * (GilbApp C214-UI1, Agent.Tester s131 D1: Custom #4f8fd6 gave 3.23:1, #e8c547 1.61:1).
 */

/** An sRGB colour, 0-255 per channel. */
export type Rgb = readonly [number, number, number];

/** The WCAG 2 contrast floor for body-size text. */
export const OPEN_TEXT_MIN_CONTRAST = 4.5;

/** Which token draws the label, and how much (percent) of which token is mixed into the accent fill. */
export interface OpenColors {
  text: "on-accent" | "ink";
  /** 0 when the bare accent is used; otherwise the percent of `mixToward` mixed in (`color-mix(in srgb, …)`). */
  mix: number;
  mixToward: "on-accent" | "ink";
  /** The contrast reached, for tests and probes. */
  contrast: number;
}

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 2 contrast ratio of two opaque colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `color-mix(in srgb, a (100-p)%, b p%)`: a straight line in sRGB, as CSS draws it. */
export function mixSrgb(a: Rgb, b: Rgb, p: number): Rgb {
  const t = p / 100;
  return [0, 1, 2].map((i) => a[i]! * (1 - t) + b[i]! * t) as unknown as Rgb;
}

/**
 * Chooses the open button's label token and fill for an accent.
 * @param accent the accent as drawn; @param ink the `--ink` token; @param onAccent the `--on-accent` token
 */
export function openColors(accent: Rgb, ink: Rgb, onAccent: Rgb): OpenColors {
  const onC = contrast(accent, onAccent);
  const inkC = contrast(accent, ink);
  const best: OpenColors["text"] = onC >= inkC ? "on-accent" : "ink";
  const bestC = Math.max(onC, inkC);
  if (bestC >= OPEN_TEXT_MIN_CONTRAST) return { text: best, mix: 0, mixToward: best === "ink" ? "on-accent" : "ink", contrast: bestC };
  // Neither token reads on the bare accent: deepen the fill toward the darker token, label in the lighter one.
  const inkIsDark = luminance(ink) < luminance(onAccent);
  const dark = inkIsDark ? ink : onAccent;
  const light = inkIsDark ? onAccent : ink;
  const text: OpenColors["text"] = inkIsDark ? "on-accent" : "ink";
  const mixToward: OpenColors["mixToward"] = inkIsDark ? "ink" : "on-accent";
  for (let p = 5; p <= 100; p += 5) {
    const c = contrast(mixSrgb(accent, dark, p), light);
    if (c >= OPEN_TEXT_MIN_CONTRAST) return { text, mix: p, mixToward, contrast: c };
  }
  return { text, mix: 100, mixToward, contrast: contrast(dark, light) };
}

/** Reads a computed CSS colour (`rgb(…)`, `rgba(…)` or `color(srgb …)`) as sRGB 0-255; null when it cannot. */
export function parseCssColor(value: string): Rgb | null {
  const rgb = value.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const srgb = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
  return null;
}
