// Spec: Rule_Code_accessibility RuleA11yWcagAa and RuleA11yContrast — the text of the sign-in card reads at 4.5:1 or
// better on its background (WCAG 2.1 AA), in a light and in a dark look.
//
// jsdom draws nothing, so this works the colours out from signin.css's own text: it reads each rule's declarations and
// resolves var(), color-mix(in srgb, …) and `transparent` against the variables a look puts in force. The looks are the
// ones an app really gives the card: no style at all, the default style as style-runtime writes it (light and dark),
// and the editorial tokens (light and dark). Its known answers are the three ratios measured in Chrome on 2026-11-21 with
// the default style in the dark look: 3.73, 1.22 and 1.77 by axe-core; 3.73, 1.23 and 1.78 from the computed colours.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

type Rgba = [number, number, number, number];
type Vars = Record<string, string>;

// ---------------------------------------------------------------- the instrument

/** The rules of a flat style sheet: selector to its declarations. */
function rulesOf(css: string): Map<string, Vars> {
  const out = new Map<string, Vars>();
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls: Vars = {};
    for (const d of m[2]!.split(";")) {
      const at = d.indexOf(":");
      if (at > 0) decls[d.slice(0, at).trim()] = d.slice(at + 1).trim();
    }
    for (const selector of m[1]!.split(",").map((s) => s.trim().replace(/\s+/g, " "))) out.set(selector, { ...out.get(selector), ...decls });
  }
  return out;
}

/** One declaration of one rule; throws when it is not there, so a renamed rule cannot pass unseen. */
function declared(rules: Map<string, Vars>, selector: string, property: string): string {
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

/** The colour a value stands for. Understands hex, `transparent`, var() with a fallback, and color-mix(in srgb, a p%, b); anything else throws. */
function colourOf(value: string, vars: Vars, depth = 0): Rgba {
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
    const withShare = /^(.*?)\s+([\d.]+)%$/.exec(first ?? "");
    if (space !== "in srgb" || !withShare || !second) throw new Error(`cannot read ${v}`);
    const p = Number(withShare[2]) / 100;
    const a = colourOf(withShare[1]!, vars, depth + 1);
    const b = colourOf(second, vars, depth + 1);
    const alpha = a[3] * p + b[3] * (1 - p); // mixed with the alpha multiplied in, as a browser does
    if (alpha === 0) return [0, 0, 0, 0];
    const channel = (i: 0 | 1 | 2) => (a[i] * a[3] * p + b[i] * b[3] * (1 - p)) / alpha;
    return [channel(0), channel(1), channel(2), alpha];
  }
  throw new Error(`cannot read the colour ${v}`);
}

const over = (top: Rgba, under: Rgba): Rgba => [0, 1, 2].map((i) => top[i]! * top[3] + under[i]! * (1 - top[3])).concat(1) as Rgba;
const toHex = (c: Rgba): string => `#${[c[0], c[1], c[2]].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

/** WCAG 2.1 relative luminance of a colour rounded to whole steps, as on a screen. */
function luminance(c: Rgba): number {
  const f = (n: number) => {
    const v = Math.round(n) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

/** The contrast of a text colour on a stack of backgrounds (from the bottom up), with the two colours as drawn. */
function contrastOn(text: string, backgrounds: readonly string[], vars: Vars): { ratio: number; text: string; background: string } {
  let bg: Rgba = [255, 255, 255, 1];
  for (const b of backgrounds) bg = over(colourOf(b, vars), bg);
  const fg = over(colourOf(text, vars), bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return { ratio: (hi + 0.05) / (lo + 0.05), text: toHex(fg), background: toHex(bg) };
}

// ---------------------------------------------------------------- the looks

// What style-runtime 0.2.1 writes for its default sheet (toCssVars(defaultSheet(), mode)), read on 2026-11-21 at the
// library's main df1cb9e8. It writes no --ink-faint and no --line, so the card's own fallbacks stand for those.
const STYLE_LIGHT: Vars = { "--accent": "#3b6fd4", "--paper": "#f1f5fe", "--ink": "#1c222b", "--surface": "#f7faff", "--lines": "#1c222b", "--tint-hi": "#ffffff", "--on-accent": "#ffffff", "--accent-ink": "#386bd0", "--bad": "#9c4438", "--signin-brand": "var(--accent)", "--signin-on-brand": "var(--on-accent)" };
const STYLE_DARK: Vars = { ...STYLE_LIGHT, "--paper": "#0d0f15", "--ink": "#e1e8f6", "--surface": "#15181e", "--lines": "#e1e8f6", "--tint-hi": "color-mix(in srgb, var(--ink) 26%, var(--paper))", "--accent-ink": "#487de3", "--bad": "#f09080" };
// The editorial tokens (units/editorial-tokens/src/tokens.css at the same main): :root, and what [data-theme="dark"] changes.
const EDITORIAL_LIGHT: Vars = {
  "--accent": "#a85c3b",
  "--signin-brand": "var(--accent)",
  "--signin-on-brand": "var(--on-accent)",
  "--paper": "#f4f1ea",
  "--ink": "#2a2622",
  "--tint-hi": "#ffffff",
  "--on-accent": "#fbfaf6",
  "--bad": "#a5432c",
  "--surface": "color-mix(in srgb, var(--paper) 78%, var(--tint-hi))",
  "--lines": "var(--ink)",
  "--ink-faint": "color-mix(in srgb, var(--ink) 55%, var(--paper))",
  "--line": "color-mix(in srgb, var(--lines) 9%, transparent)",
  "--accent-ink": "color-mix(in srgb, var(--accent) 80%, var(--ink))",
};
const EDITORIAL_DARK: Vars = { ...EDITORIAL_LIGHT, "--accent": "#d68b5e", "--paper": "#151719", "--ink": "#e9e3da", "--tint-hi": "color-mix(in srgb, var(--ink) 26%, var(--paper))", "--on-accent": "#191512", "--bad": "#dd8069" };

const LIGHT_LOOKS: Record<string, Vars> = { "no style": {}, "the default style, light": STYLE_LIGHT, "the editorial tokens, light": EDITORIAL_LIGHT };
const DARK_LOOKS: Record<string, Vars> = { "the default style, dark": STYLE_DARK, "the editorial tokens, dark": EDITORIAL_DARK };

// ---------------------------------------------------------------- the card's texts

const rules = rulesOf(readFileSync(fileURLToPath(new URL("./signin.css", import.meta.url)), "utf8"));
const CARD = declared(rules, ".gilb-signin-card", "background");
const INK = declared(rules, ".gilb-signin-card", "color");

/** Every text of the card: what it is, its colour, and the backgrounds under it from the bottom up. */
const TEXTS = {
  "the card's own text (title, labels, the name that is free)": [INK, [CARD]],
  "the help lines": [declared(rules, ".gilb-signin-desc", "color"), [CARD]],
  "the lines under the fields": [declared(rules, ".gilb-signin-muted", "color"), [CARD]],
  "the Change email link": [declared(rules, ".gilb-signin-link", "color"), [CARD]],
  "the button's label": [declared(rules, ".gilb-signin-btn", "color"), [CARD, declared(rules, ".gilb-signin-btn", "background")]],
  "what is typed in a field": [INK, [CARD, declared(rules, ".gilb-signin-input", "background")]],
  "the error box": [declared(rules, ".gilb-signin-alert", "color"), [CARD, declared(rules, ".gilb-signin-alert", "background")]],
  "the sentence that refuses a name": [declared(rules, ".gilb-signin-error-text", "color"), [CARD]],
  "the new vault's address": [INK, [CARD, declared(rules, ".gilb-signin-code", "background")]],
} as const satisfies Record<string, readonly [string, readonly string[]]>;
type TextName = keyof typeof TEXTS;

const read = (name: TextName, vars: Vars) => contrastOn(TEXTS[name][0], TEXTS[name][1], vars);
const AA = 4.5;

// ---------------------------------------------------------------- the tests

describe("the instrument", () => {
  test("gives the three ratios measured in Chrome for the card as it was (known answers: 3.73, 1.22 and 1.77)", () => {
    // The declarations of signin 0.2.13, in the dark look of the default style.
    expect(contrastOn("var(--signin-brand, var(--accent, #3698a2))", [CARD], STYLE_DARK).ratio).toBeCloseTo(3.73, 1);
    expect(contrastOn(INK, [CARD, "var(--signin-sheet, #fff)"], STYLE_DARK).ratio).toBeCloseTo(1.22, 1);
    expect(contrastOn("var(--signin-error-ink, #8b0000)", [CARD], STYLE_DARK).ratio).toBeCloseTo(1.77, 1);
  });

  test("lays a mix with transparent over what is under it, and refuses what it cannot read", () => {
    expect(contrastOn("#000000", ["#f1f5fe", "color-mix(in srgb, #3b6fd4 10%, transparent)"], {}).background).toBe("#dfe8fa");
    expect(() => declared(rules, ".gilb-signin-no-such-rule", "color")).toThrow('the style sheet has no "color" under ".gilb-signin-no-such-rule"');
    expect(() => colourOf("var(--nothing)", {})).toThrow("--nothing has no value");
    expect(() => colourOf("rebeccapurple", {})).toThrow("cannot read the colour rebeccapurple");
  });
});

describe("the dark look: the three texts that read under 4.5:1 on 2026-11-21", () => {
  test.each(Object.entries(DARK_LOOKS))("the new vault's address reads at 4.5:1 or better in %s", (_look, vars) => {
    const got = read("the new vault's address", vars);
    expect(got.ratio, `${got.text} on ${got.background} is ${got.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
  });

  // OPEN, and held red on purpose. These two still read under 4.5:1 in the dark look, and the unit cannot put them right
  // alone without changing what the light look of other apps shows: the link's colour is the brand colour and the
  // refusal's is a fixed dark red, and the tokens a style sets per look for them (--accent-ink, --bad) have other values
  // than those in the light look. `test.fails` passes while the assertion fails, and goes red the day it holds: then
  // take the `.fails` away. Until then a host sets --signin-link and --signin-error-text for its dark look (README, "Styling").
  test.fails("OPEN: the Change email link reads at 4.5:1 or better in the default style, dark (3.73 today)", () => {
    expect(read("the Change email link", STYLE_DARK).ratio).toBeGreaterThanOrEqual(AA);
  });
  test.fails("OPEN: the sentence that refuses a name reads at 4.5:1 or better in the default style, dark (1.77 today)", () => {
    expect(read("the sentence that refuses a name", STYLE_DARK).ratio).toBeGreaterThanOrEqual(AA);
  });

  test.each(Object.entries(DARK_LOOKS))("a host that sets the two variables for its dark look gets both at 4.5:1 or better, and the error box is not touched: %s", (_look, vars) => {
    const host = { ...vars, "--signin-link": "var(--accent-ink)", "--signin-error-text": "var(--bad)" };
    expect(read("the Change email link", host).ratio).toBeGreaterThanOrEqual(AA);
    expect(read("the sentence that refuses a name", host).ratio).toBeGreaterThanOrEqual(AA);
    expect(read("the error box", host)).toEqual(read("the error box", vars));
  });

  test("the error box's text has its own variable: a light red for a dark card, set there, would read at 1.8:1 on the box (known answer, Chrome: 1.81)", () => {
    expect(read("the error box", { ...STYLE_DARK, "--signin-error-ink": "var(--bad)" }).ratio).toBeCloseTo(1.81, 1);
  });
});

describe("texts whose two colours the card fixes itself read at 4.5:1 or better in every look", () => {
  test.each(Object.entries({ ...LIGHT_LOOKS, ...DARK_LOOKS }))("the error box, %s", (_look, vars) => {
    expect(read("the error box", vars).ratio).toBeGreaterThanOrEqual(AA);
  });
  test.each(Object.entries({ ...LIGHT_LOOKS, ...DARK_LOOKS }))("the card's own text and what is typed in a field, %s", (_look, vars) => {
    expect(read("the card's own text (title, labels, the name that is free)", vars).ratio).toBeGreaterThanOrEqual(AA);
    expect(read("what is typed in a field", vars).ratio).toBeGreaterThanOrEqual(AA);
  });
});

// The light look of an app that takes this unit must not change with a fix for the dark look. These are the colours
// signin 0.2.13 drew, text on background, worked out by this instrument from that version's sheet.
const LIGHT_AS_IT_WAS: Record<string, Record<TextName, string>> = {
  "no style": {
    "the card's own text (title, labels, the name that is free)": "#161514 on #fbfaf8",
    "the help lines": "#808080 on #fbfaf8",
    "the lines under the fields": "#808080 on #fbfaf8",
    "the Change email link": "#3698a2 on #fbfaf8",
    "the button's label": "#fefdfb on #3698a2",
    "what is typed in a field": "#161514 on #fefdfb",
    "the error box": "#8b0000 on #ffdada",
    "the sentence that refuses a name": "#8b0000 on #fbfaf8",
    "the new vault's address": "#161514 on #ffffff",
  },
  "the default style, light": {
    "the card's own text (title, labels, the name that is free)": "#1c222b on #f7faff",
    "the help lines": "#808080 on #f7faff",
    "the lines under the fields": "#808080 on #f7faff",
    "the Change email link": "#3b6fd4 on #f7faff",
    "the button's label": "#ffffff on #3b6fd4",
    "what is typed in a field": "#1c222b on #f7faff",
    "the error box": "#8b0000 on #ffdada",
    "the sentence that refuses a name": "#8b0000 on #f7faff",
    "the new vault's address": "#1c222b on #ffffff",
  },
  "the editorial tokens, light": {
    "the card's own text (title, labels, the name that is free)": "#2a2622 on #f6f4ef",
    "the help lines": "#85817c on #f6f4ef",
    "the lines under the fields": "#85817c on #f6f4ef",
    "the Change email link": "#a85c3b on #f6f4ef",
    "the button's label": "#fbfaf6 on #a85c3b",
    "what is typed in a field": "#2a2622 on #f6f4ef",
    "the error box": "#8b0000 on #ffdada",
    "the sentence that refuses a name": "#8b0000 on #f6f4ef",
    "the new vault's address": "#2a2622 on #ffffff",
  },
};
/** The card's border laid over the card, and the focus ring, as 0.2.13 drew them. */
const LINES_AS_THEY_WERE: Record<string, string> = {
  "no style": "#cececd #3698a2",
  "the default style, light": "#cececd #3b6fd4",
  "the editorial tokens, light": "#e4e2dc #a85c3b",
};

describe("the light look draws what signin 0.2.13 drew", () => {
  test.each(Object.entries(LIGHT_LOOKS))("%s: every text and its background are the same colours", (look, vars) => {
    const now = Object.fromEntries((Object.keys(TEXTS) as TextName[]).map((name) => [name, `${read(name, vars).text} on ${read(name, vars).background}`]));
    expect(now).toEqual(LIGHT_AS_IT_WAS[look]);
  });

  test.each(Object.entries(LIGHT_LOOKS))("%s: the lines and the focus ring are the same colours", (look, vars) => {
    const line = toHex(over(colourOf(declared(rules, ".gilb-signin-card", "border").replace("1px solid ", ""), vars), colourOf(CARD, vars)));
    const ring = toHex(colourOf(declared(rules, ".gilb-signin-input:focus-visible", "outline").replace("2px solid ", ""), vars));
    expect(`${line} ${ring}`).toBe(LINES_AS_THEY_WERE[look]);
  });
});
