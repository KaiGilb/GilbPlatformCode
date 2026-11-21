// @vitest-environment node
// Spec: Rule_Code_accessibility RuleA11yWcagAa and RuleA11yContrast — normal text reads at 4.5:1 or better on its background.
// axe cannot measure colour in jsdom, so this works the ratios out from the style sheet's own text (test/colours.ts), for
// the colours the sheet shows before a style has loaded and for the default style, light and dark. The browser proof of
// apps/starter-app measures the same pairs with axe-core in Chrome.
import { defaultSheet, toCssVars } from "@kaigilb/gilbplatformcode-style-runtime";
import { describe, expect, test } from "vitest";
import { colourOf, contrastOn, declared, rulesOf, starterRules, type Vars } from "../test/colours";

const AA = 4.5;
const rules = starterRules();
const beforeLoad: Vars = { ...rules.get(":where(:root)"), ...rules.get(":root") };
const derived: Vars = { ...rules.get(":root") };

/** The custom properties in force: the sheet's own, then (when a style has loaded) the style's, which win. */
const LOOKS: Record<string, Vars> = {
  "before a style has loaded": beforeLoad,
  "the default style, light": { ...beforeLoad, ...toCssVars(defaultSheet(), "light"), ...derived },
  "the default style, dark": { ...beforeLoad, ...toCssVars(defaultSheet(), "dark"), ...derived },
};

const CURRENT = '.sa-menu-item[aria-current="page"]';
const OPEN_BAR_BUTTON = '.sa-app nav[aria-label="Panels"] button[aria-pressed="true"]';
// What the joined units draw text on (their own class names say so; the starter's sheet gives the variables).
const PAGE = "var(--paper)"; // app-shell: the frame, and the left region of a wide window
const DRAWER = "var(--paper-2)"; // drawer: the menu below 840 px; app-shell: the bottom bar
const TOP_BAR = "color-mix(in srgb, var(--surface) 72%, var(--paper-2))"; // app-shell: the header
const CARD = "var(--surface)"; // signin: the sign-in card; the starter's own panels

/** Every place the starter's sheet decides the colour of text: what it is, the text colour, and the backgrounds under it. */
const PAIRS: [what: string, text: string, backgrounds: string[]][] = [
  ["the open section in the menu, wide window", declared(rules, CURRENT, "color"), [PAGE, declared(rules, CURRENT, "background")]],
  ["the open section in the menu, drawer", declared(rules, CURRENT, "color"), [DRAWER, declared(rules, CURRENT, "background")]],
  ["a section in the menu, wide window", declared(rules, ".sa-menu-item", "color"), [PAGE]],
  ["a section in the menu, drawer", declared(rules, ".sa-menu-item", "color"), [DRAWER]],
  ["a section in the menu under the pointer", declared(rules, ".sa-menu-item:hover", "color"), [DRAWER, declared(rules, ".sa-menu-item:hover", "background")]],
  ["the Account heading in the drawer", declared(rules, ".sa-menu-heading", "color"), [DRAWER]],
  ["the help lines of the sign-in card (signin reads --ink-faint)", "var(--ink-faint)", [CARD]],
  ["the waiting sentence", declared(rules, ".sa-wait", "color"), [PAGE]],
  ["the View only badge", declared(rules, ".sa-badge", "color"), [TOP_BAR]],
  ["the app's name and Sign out, top bar", declared(rules, ".sa-button", "color"), [TOP_BAR]],
  ["Sign out, drawer", declared(rules, ".sa-button", "color"), [DRAWER]],
  ["Share (the main button)", declared(rules, ".sa-button--main", "color"), [PAGE, declared(rules, ".sa-button--main", "background")]],
  ["the panel of a failed start", "var(--ink)", [CARD]],
  ["the frame's bottom-bar label (app-shell reads --ink-soft)", "var(--ink-soft)", [DRAWER]],
  ["the frame's open bottom-bar label", declared(rules, OPEN_BAR_BUTTON, "color"), [DRAWER, "var(--sel)"]],
  ["the drawer's close mark (drawer reads --ink-faint)", "var(--ink-faint)", [DRAWER]],
];

describe("the instrument", () => {
  test("reads a mix with transparent as the colour at that share, and lays it over what is under it", () => {
    expect(colourOf("color-mix(in srgb, #3b6fd4 10%, transparent)", {}).map((n) => Math.round(n * 100) / 100)).toEqual([0x3b, 0x6f, 0xd4, 0.1]);
    // The tint of the open section on the default paper: the colour axe-core read in Chrome on 2026-11-21 (#dfe8fa).
    expect(contrastOn("#000000", ["#f1f5fe", "color-mix(in srgb, #3b6fd4 10%, transparent)"], {}).background).toBe("#dfe8fa");
  });

  test("gives the three ratios measured in the browser before the fix (known answers: 4.08, 4.45 and 3.74)", () => {
    const light = LOOKS["the default style, light"]!;
    const dark = LOOKS["the default style, dark"]!;
    const sel = "color-mix(in srgb, var(--accent) 10%, transparent)";
    expect(contrastOn("var(--accent-ink)", [PAGE, sel], light).ratio).toBeCloseTo(4.08, 1);
    expect(contrastOn("var(--accent-ink)", [PAGE, sel], dark).ratio).toBeCloseTo(4.45, 1);
    expect(contrastOn("color-mix(in srgb, var(--ink) 55%, var(--paper))", [CARD], light).ratio).toBeCloseTo(3.74, 1);
  });

  test("reads a rule that is written in the sheet, and refuses one that is not", () => {
    expect(rulesOf(".a, .b { color: #111; } .a { background: #fff }").get(".a")).toEqual({ color: "#111", background: "#fff" });
    expect(() => declared(rules, ".sa-no-such-rule", "color")).toThrow('the style sheet has no "color" under ".sa-no-such-rule"');
    expect(() => colourOf("var(--nothing)", {})).toThrow("--nothing has no value");
    expect(() => colourOf("rebeccapurple", {})).toThrow("cannot read the colour rebeccapurple");
  });
});

describe.each(Object.entries(LOOKS))("text contrast, %s", (_look, vars) => {
  test.each(PAIRS)("%s reads at 4.5:1 or better", (what, text, backgrounds) => {
    const got = contrastOn(text, backgrounds, vars);
    expect(got.ratio, `${what}: ${got.text} on ${got.background} is ${got.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
  });
});

describe("the open section is not marked by colour alone", () => {
  test("it is also heavier and carries a bar in the accent colour", () => {
    expect(declared(rules, CURRENT, "font-weight")).toBe("600");
    expect(declared(rules, CURRENT, "box-shadow")).toContain("var(--accent)");
  });
});
