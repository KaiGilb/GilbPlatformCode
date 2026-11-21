// @vitest-environment node
// Spec: Rule_Code_accessibility RuleA11yContrast — the label of the red button that answers "Remove <who>?" has a
// variable of its own, --vss-on-danger, so a host can keep it at 4.5:1 on its red. Unset, nothing an app draws changes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./vaultShareSheet.css", import.meta.url)), "utf8");
/** The sheet without its comments, every run of white space as one space. */
const plain = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
const WITH_VARIABLE = "var(--vss-on-danger, var(--on-accent, #ffffff))";
const AS_IT_WAS = "var(--on-accent, #ffffff)";

type Vars = Record<string, string>;
/** The hex colour a value of var() and hex stands for; anything else throws. */
function colourOf(value: string, vars: Vars, depth = 0): string {
  if (depth > 20) throw new Error(`the variables go round in a ring at ${value}`);
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  const m = /^var\((--[a-z-]+)(?:,\s*(.+))?\)$/i.exec(v);
  if (!m) throw new Error(`cannot read the colour ${v}`);
  const found = vars[m[1]!];
  if (found !== undefined) return colourOf(found, vars, depth + 1);
  if (m[2] !== undefined) return colourOf(m[2], vars, depth + 1);
  throw new Error(`${m[1]} has no value`);
}
/** WCAG 2.1 contrast of two hex colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const f = (i: number) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(1) + 0.7152 * f(3) + 0.0722 * f(5);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The rule's `color` and `background`, read from the sheet itself. */
const danger = /\.vss \.vss-danger \{ background: ([^;]+); color: ([^;]+);/.exec(plain(css));
if (!danger) throw new Error("the sheet has no .vss .vss-danger rule with a background and a color");
const [, BACKGROUND, LABEL] = danger as unknown as [string, string, string];
const read = (vars: Vars) => ({ label: colourOf(LABEL, vars), background: colourOf(BACKGROUND, vars) });

// What style-runtime 0.2.1 writes for its default sheet (read 2026-11-21), a style with a yellow accent as the runtime
// writes it (its near-black on the accent, white on its red), and the editorial tokens, which write no --on-bad.
const DEFAULT_LIGHT: Vars = { "--bad": "#9c4438", "--on-accent": "#ffffff", "--on-bad": "#ffffff" };
const DEFAULT_DARK: Vars = { "--bad": "#f09080", "--on-accent": "#ffffff", "--on-bad": "#111111" };
const YELLOW_LIGHT: Vars = { "--bad": "#9c4438", "--on-accent": "#111111", "--on-bad": "#ffffff" };
const EDITORIAL_LIGHT: Vars = { "--bad": "#a5432c", "--on-accent": "#fbfaf6" };
const EDITORIAL_DARK: Vars = { "--bad": "#dd8069", "--on-accent": "#191512" };
const LOOKS: Record<string, Vars> = { "no style": {}, "the default style, light": DEFAULT_LIGHT, "the default style, dark": DEFAULT_DARK, "a yellow accent, light": YELLOW_LIGHT, "the editorial tokens, light": EDITORIAL_LIGHT, "the editorial tokens, dark": EDITORIAL_DARK };

describe("the stylesheet", () => {
  it("is the sheet of 0.1.2 in every rule and declaration but one: the red button's label reads its own variable first", () => {
    expect(plain(css).split(WITH_VARIABLE)).toHaveLength(2); // the variable is read in exactly one place
    // The fingerprint of 0.1.2's sheet (comments and white space apart), taken from the library's main at 3fc4baa1.
    const asItWas = plain(css).replace(WITH_VARIABLE, AS_IT_WAS);
    expect(createHash("sha256").update(asItWas).digest("hex")).toBe("3bc7b25dcbf5bfd8fe1a3e03d930e706d57c801319082ec5246c6d7c753488a9");
  });

  it.each(Object.entries(LOOKS))("with the variable unset, the red button is drawn as 0.1.2 drew it: %s", (_look, vars) => {
    expect(read(vars)).toEqual({ label: colourOf(AS_IT_WAS, vars), background: colourOf("var(--bad, #b42318)", vars) });
  });

  it("gives the two ratios measured in Chrome with the variable unset (known answers: 2.33 dark, 2.96 with a yellow accent)", () => {
    const dark = read(DEFAULT_DARK);
    expect(contrast(dark.label, dark.background)).toBeCloseTo(2.33, 1);
    const yellow = read(YELLOW_LIGHT);
    expect(contrast(yellow.label, yellow.background)).toBeCloseTo(2.96, 1);
  });

  it.each([
    ["the default style, light", DEFAULT_LIGHT],
    ["the default style, dark", DEFAULT_DARK],
    ["a yellow accent, light", YELLOW_LIGHT],
  ] as const)("a host that sets --vss-on-danger to its style's --on-bad gets the label at 4.5:1 or better: %s", (_look, vars) => {
    const got = read({ ...vars, "--vss-on-danger": "var(--on-bad)" });
    expect(got.label).toBe(vars["--on-bad"]);
    expect(contrast(got.label, got.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("refuses what it cannot read", () => {
    expect(() => colourOf("var(--nothing)", {})).toThrow("--nothing has no value");
    expect(() => colourOf("red", {})).toThrow("cannot read the colour red");
  });
});
