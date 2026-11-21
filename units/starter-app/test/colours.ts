// Works out the colours the starter's own style sheet gives, from the sheet's text itself, so a contrast test reads the
// numbers a browser would draw. It understands what the sheet uses: hex colours, var(), color-mix(in srgb, …) and
// `transparent`. A value it does not understand throws; it never guesses.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contrastRatio } from "@kaigilb/gilbplatformcode-style-runtime";

/** Red, green, blue (0 to 255) and alpha (0 to 1). */
export type Rgba = [number, number, number, number];
export type Vars = Record<string, string>;

/** The rules of a flat style sheet: selector to its declarations. A selector written twice keeps both, later ones winning. */
export function rulesOf(css: string): Map<string, Vars> {
  const out = new Map<string, Vars>();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls: Vars = {};
    for (const d of m[2]!.split(";")) {
      const at = d.indexOf(":");
      if (at > 0) decls[d.slice(0, at).trim()] = d.slice(at + 1).trim();
    }
    for (const selector of m[1]!.split(",").map((s) => s.trim().replace(/\s+/g, " "))) out.set(selector, { ...out.get(selector), ...decls });
  }
  return out;
}

/** The starter's style sheet, read from the unit's own source. */
export function starterRules(): Map<string, Vars> {
  return rulesOf(readFileSync(resolve(process.cwd(), "src/starterApp.css"), "utf8"));
}

/** The sign-in card's style sheet, as the signin unit installed beside this one ships it: the starter's sheet sets its variables. */
export function signinRules(): Map<string, Vars> {
  return rulesOf(readFileSync(resolve(process.cwd(), "node_modules/@kaigilb/gilbplatformcode-signin/src/signin.css"), "utf8"));
}

/** The share sheet's style sheet, as the vault-share-sheet unit installed beside this one ships it. */
export function shareSheetRules(): Map<string, Vars> {
  return rulesOf(readFileSync(resolve(process.cwd(), "node_modules/@kaigilb/gilbplatformcode-vault-share-sheet/src/vaultShareSheet.css"), "utf8"));
}

/** One declaration of one rule; throws when the sheet has no such rule or declaration, so a renamed rule cannot pass unseen. */
export function declared(rules: Map<string, Vars>, selector: string, property: string): string {
  const value = rules.get(selector)?.[property];
  if (value === undefined) throw new Error(`the style sheet has no "${property}" under "${selector}"`);
  return value;
}

/** Splits on commas that are not inside brackets. */
function parts(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) {
      out.push(text.slice(from, i).trim());
      from = i + 1;
    }
  }
  return [...out, text.slice(from).trim()];
}

/**
 * The colour a value stands for, with every var() looked up in `vars`.
 *
 * @param value a hex colour, `transparent`, `var(--x)`, `var(--x, fallback)` or `color-mix(in srgb, a p%, b)`
 * @param vars the custom properties in force
 * @returns red, green, blue and alpha
 * @throws Error for a value of any other form, and for a var() with no value and no fallback
 */
export function colourOf(value: string, vars: Vars, depth = 0): Rgba {
  if (depth > 20) throw new Error(`the variables go round in a ring at ${value}`);
  const v = value.trim();
  if (v === "transparent") return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join("") : hex[1]!;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  if (v.startsWith("var(") && v.endsWith(")")) {
    const [name, ...fallback] = parts(v.slice(4, -1));
    const found = vars[name!];
    if (found !== undefined) return colourOf(found, vars, depth + 1);
    if (fallback.length) return colourOf(fallback.join(", "), vars, depth + 1);
    throw new Error(`${name} has no value`);
  }
  if (v.startsWith("color-mix(") && v.endsWith(")")) {
    const [space, first, second] = parts(v.slice(10, -1));
    if (space !== "in srgb" || !first || !second) throw new Error(`cannot read ${v}`);
    const withShare = /^(.*?)\s+([\d.]+)%$/.exec(first);
    if (!withShare) throw new Error(`cannot read the share in ${v}`);
    const p = Number(withShare[2]) / 100;
    const a = colourOf(withShare[1]!, vars, depth + 1);
    const b = colourOf(second, vars, depth + 1);
    // As the browser mixes: with the alpha multiplied in, so a mix with `transparent` keeps the colour and takes the share as its alpha.
    const alpha = a[3] * p + b[3] * (1 - p);
    if (alpha === 0) return [0, 0, 0, 0];
    const channel = (i: 0 | 1 | 2) => (a[i] * a[3] * p + b[i] * b[3] * (1 - p)) / alpha;
    return [channel(0), channel(1), channel(2), alpha];
  }
  throw new Error(`cannot read the colour ${v}`);
}

/** A colour laid over an opaque one. */
function over(top: Rgba, under: Rgba): Rgba {
  const mix = (i: 0 | 1 | 2) => top[i] * top[3] + under[i] * (1 - top[3]);
  return [mix(0), mix(1), mix(2), 1];
}

const toHex = (c: Rgba): string => `#${[c[0], c[1], c[2]].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

/**
 * The contrast of a text colour on a stack of backgrounds, as a browser draws them: each background laid over the one
 * before, the first of them opaque, then the text laid over the result. Colours are rounded to whole steps, as on a screen.
 *
 * @param text the text colour's value
 * @param backgrounds the backgrounds from the bottom up
 * @param vars the custom properties in force
 * @returns the ratio, the text colour and the background, for the message of a failed test
 */
export function contrastOn(text: string, backgrounds: readonly string[], vars: Vars): { ratio: number; text: string; background: string } {
  let bg: Rgba = [255, 255, 255, 1];
  for (const b of backgrounds) bg = over(colourOf(b, vars), bg);
  const fg = over(colourOf(text, vars), bg);
  return { ratio: contrastRatio(toHex(fg), toHex(bg)), text: toHex(fg), background: toHex(bg) };
}
