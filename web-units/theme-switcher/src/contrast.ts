/**
 * Colour maths for the AA guard (WCAG 2.1 relative luminance). Pure; no browser needed.
 * Moved without change in behaviour from the Gilb Websites composables/useTheme.ts (see README "Source").
 */
import type { AccentResult } from "./types";

type RGB = [number, number, number];

/** WCAG AA contrast minimum for normal text. */
export const AA_MIN = 4.5;

/** "#rrggbb" or "#rgb" (the # is optional) to channels, or null when it is neither. */
export function hexToRgb(hex: string): RGB | null {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

const toLinear = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]: RGB): number => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** WCAG contrast ratio of two colours, 1 to 21; 0 when either is not a colour. */
export function contrastRatio(aHex: string, bHex: string): number {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  if (!a || !b) return 0;
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const channelsOf = ([r, g, b]: RGB): string => `${r} ${g} ${b}`;

/**
 * Guard a chosen accent so that it and the background clear the minimum (default WCAG AA, 4.5:1). A pick that
 * clears is returned as it is. Otherwise it is moved toward black (on a light background) or white (on a dark
 * one) in 4 % steps until it clears, and `adjusted` is true. A value that is not a colour gives `fallbackHex`
 * (adjusted), or, if that is not a colour either, black or white by the background.
 *
 * @param hex the visitor's pick
 * @param bgHex the background it must be readable on
 * @param min the contrast minimum
 * @param fallbackHex used when `hex` is not a colour
 */
export function nudgeToAA(hex: string, bgHex: string, min: number = AA_MIN, fallbackHex?: string): AccentResult {
  const bg = hexToRgb(bgHex);
  const start = hexToRgb(hex) ?? (fallbackHex ? hexToRgb(fallbackHex) : null);
  const pickWasColour = hexToRgb(hex) !== null;
  if (!bg) {
    const rgb = start ?? [0, 0, 0];
    return { hex: rgbToHex(rgb), channels: channelsOf(rgb), adjusted: !pickWasColour, ratio: 0 };
  }
  const target: RGB = luminance(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  const from: RGB = start ?? target;
  let cur: RGB = from;
  let adjusted = !pickWasColour;
  if (contrastRatio(rgbToHex(from), bgHex) < min) {
    adjusted = true;
    for (let t = 0.04; t <= 1.0001; t += 0.04) {
      cur = [0, 1, 2].map((i) => Math.round(from[i]! + (target[i]! - from[i]!) * t)) as RGB;
      if (contrastRatio(rgbToHex(cur), bgHex) >= min) break;
    }
  }
  const out = rgbToHex(cur);
  return { hex: out, channels: channelsOf(cur), adjusted, ratio: contrastRatio(out, bgHex) };
}
