// @vitest-environment node
// Spec: Rule_Code_accessibility RuleA11yWcagAa and RuleA11yContrast — normal text reads at 4.5:1 or better on its background.
// axe cannot measure colour in jsdom, so this works the ratios out from the style sheet's own text (test/colours.ts), for
// the colours the sheet shows before a style has loaded and for the default style, light and dark. The browser proof of
// apps/starter-app measures the same pairs with axe-core in Chrome.
import { defaultSheet, paletteFromSeed, toCssVars, validateStyleSheet, type PaletteInput, type StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import { describe, expect, test } from "vitest";
import { colourOf, contrastOn, declared, rulesOf, shareSheetRules, signinRules, starterRules, type Vars } from "../test/colours";

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
const CARD = "var(--surface)"; // the starter's own panels
// The sign-in card is the signin unit's: its colours are read from that unit's own sheet, whose variables this sheet sets.
const signin = signinRules();
const SIGNIN_CARD = declared(signin, ".gilb-signin-card", "background");
const SIGNIN_INK = declared(signin, ".gilb-signin-card", "color");
// The share sheet is the vault-share-sheet unit's; its dialog (modal-sheet) stands on the paper.
const share = shareSheetRules();
const SHEET = "var(--paper)";
// A placeholder is drawn in its colour at its own opacity, so both are read: the rule must say `opacity: 1` (a browser
// or a CSS reset draws a placeholder fainter when it does not), and a fainter one is worked out as it would be drawn.
const PLACEHOLDER = `color-mix(in srgb, ${declared(rules, "::placeholder", "color")} ${Number(declared(rules, "::placeholder", "opacity")) * 100}%, transparent)`;

/** Every place the starter's sheet decides the colour of text: what it is, the text colour, and the backgrounds under it. */
const PAIRS: [what: string, text: string, backgrounds: string[]][] = [
  ["the open section in the menu, wide window", declared(rules, CURRENT, "color"), [PAGE, declared(rules, CURRENT, "background")]],
  ["the open section in the menu, drawer", declared(rules, CURRENT, "color"), [DRAWER, declared(rules, CURRENT, "background")]],
  ["a section in the menu, wide window", declared(rules, ".sa-menu-item", "color"), [PAGE]],
  ["a section in the menu, drawer", declared(rules, ".sa-menu-item", "color"), [DRAWER]],
  ["a section in the menu under the pointer", declared(rules, ".sa-menu-item:hover", "color"), [DRAWER, declared(rules, ".sa-menu-item:hover", "background")]],
  ["the Account heading in the drawer", declared(rules, ".sa-menu-heading", "color"), [DRAWER]],
  ["the sign-in card's own text (title, labels, the name that is free)", SIGNIN_INK, [SIGNIN_CARD]],
  ["the sign-in card's help lines", declared(signin, ".gilb-signin-desc", "color"), [SIGNIN_CARD]],
  ["the sign-in card's lines under the fields", declared(signin, ".gilb-signin-muted", "color"), [SIGNIN_CARD]],
  ["the sign-in card's Change email link", declared(signin, ".gilb-signin-link", "color"), [SIGNIN_CARD]],
  ["the sign-in card's button label", declared(signin, ".gilb-signin-btn", "color"), [SIGNIN_CARD, declared(signin, ".gilb-signin-btn", "background")]],
  ["what is typed in a field of the sign-in card", SIGNIN_INK, [SIGNIN_CARD, declared(signin, ".gilb-signin-input", "background")]],
  ["the sign-in card's error box", declared(signin, ".gilb-signin-alert", "color"), [SIGNIN_CARD, declared(signin, ".gilb-signin-alert", "background")]],
  ["the sign-in card's sentence that refuses a vault name", declared(signin, ".gilb-signin-error-text", "color"), [SIGNIN_CARD]],
  ["the new vault's address on the sign-in card", SIGNIN_INK, [SIGNIN_CARD, declared(signin, ".gilb-signin-code", "background")]],
  ["a placeholder in a field of the sign-in card", PLACEHOLDER, [SIGNIN_CARD, declared(signin, ".gilb-signin-input", "background")]],
  ["a placeholder in the share sheet's field", PLACEHOLDER, [SHEET]],
  ["the share sheet's red Remove button", declared(share, ".vss .vss-danger", "color"), [SHEET, declared(share, ".vss .vss-danger", "background")]],
  ["the share sheet's Share button", declared(share, ".vss .vss-primary", "color"), [SHEET, declared(share, ".vss .vss-primary", "background")]],
  ["the share sheet's Remove word and its refusals", declared(share, ".vss .vss-danger-text", "color"), [SHEET]],
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

  test("gives the three ratios measured in the browser on the dark sign-in card before it was put right (known answers: 3.73, 1.23 and 1.78)", () => {
    // The dark look of the default style without the three variables this sheet sets (the card on its surface, as
    // signin draws it when no host says otherwise), and the address on the fixed white of signin 0.2.13.
    const dark = { ...LOOKS["the default style, dark"]! };
    delete dark["--signin-link"];
    delete dark["--signin-error-text"];
    delete dark["--signin-card"];
    expect(contrastOn(declared(signin, ".gilb-signin-link", "color"), [SIGNIN_CARD], dark).ratio).toBeCloseTo(3.73, 1);
    expect(contrastOn(declared(signin, ".gilb-signin-error-text", "color"), [SIGNIN_CARD], dark).ratio).toBeCloseTo(1.78, 1);
    expect(contrastOn(SIGNIN_INK, [SIGNIN_CARD, "var(--signin-sheet, #fff)"], dark).ratio).toBeCloseTo(1.23, 1);
  });

  test("gives the ratios measured in the browser for the red Remove button and the placeholders before they were put right (known answers: 2.33; 3.15 and 3.13)", () => {
    const dark = { ...LOOKS["the default style, dark"]! };
    delete dark["--vss-on-danger"]; // the label as the share sheet draws it when no host says otherwise
    expect(contrastOn(declared(share, ".vss .vss-danger", "color"), [SHEET, declared(share, ".vss .vss-danger", "background")], dark).ratio).toBeCloseTo(2.33, 1);
    // A placeholder as a CSS reset draws it: the field's text colour at half strength. The card stood on its surface then.
    const light = LOOKS["the default style, light"]!;
    expect(contrastOn("color-mix(in srgb, var(--ink) 50%, transparent)", ["var(--surface)"], light).ratio).toBeCloseTo(3.15, 1);
    expect(contrastOn("color-mix(in srgb, var(--ink) 50%, transparent)", [SHEET], light).ratio).toBeCloseTo(3.13, 1);
  });

  test("counts a placeholder's own opacity: the sheet's colour at half opacity reads as a tester measured it in the browser (known answers: 2.13 light, 2.81 dark)", () => {
    expect(declared(rules, "::placeholder", "opacity")).toBe("1");
    const half = `color-mix(in srgb, ${declared(rules, "::placeholder", "color")} 50%, transparent)`;
    expect(contrastOn(half, [SHEET], LOOKS["the default style, light"]!).ratio).toBeCloseTo(2.13, 1);
    expect(contrastOn(half, [SHEET], LOOKS["the default style, dark"]!).ratio).toBeCloseTo(2.81, 1);
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

// Spec: Rule_Code_accessibility RuleA11yWcagAa — an app taken from the starter may choose another style. Every text whose
// colour this sheet decides must hold for the styles the style runtime writes, not only for the default one. The
// runtime brings --accent-ink, and the --bad it works out itself, to 4.5:1 against the paper of each look, and against
// the surface only when the style gives one; so the sheet stands the sign-in card on the paper. This sweeps styles of
// four shapes, 72 accents each, in both looks, over every pair above.
// Two things it does not prove. The muted colours (--ink-soft, --ink-faint, the placeholders) are mixes of the ink and
// the paper: they hold here because every swept style has a strong ink (the runtime's own palettes do); a style whose
// ink is only just readable needs its own --ink-soft and --ink-faint. And the label on the accent is the style's own
// pair, held apart below.
describe("every text the sheet decides holds for the styles the style runtime writes", () => {
  /** A colour from hue (degrees), saturation and lightness (0 to 1). */
  const hsl = (h: number, sat: number, l: number): string => {
    const a = sat * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
        .toString(16)
        .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  const SEEDS = Array.from({ length: 24 }, (_, i) => i * 15).flatMap((h) => [hsl(h, 0.75, 0.5), hsl(h, 0.5, 0.35), hsl(h, 0.9, 0.65)]);
  const chosen = (seed: string, mode: "light" | "dark"): Required<Omit<PaletteInput, "extra">> => {
    const p = paletteFromSeed(seed, { mode, harmony: "analogous" });
    return { accent: p.accent, paper: p.paper, ink: p.ink, surface: p.surface, lines: p.lines, ok: p.ok, warn: p.warn, bad: p.bad, onAccent: p.onAccent };
  };
  const bare = (p: PaletteInput): PaletteInput => ({ accent: p.accent, paper: p.paper, ink: p.ink });
  const noSurface = (p: PaletteInput): PaletteInput => {
    const { surface: _surface, ...rest } = p;
    return rest;
  };
  /** The shapes of style a sheet may have: what the Studio saves, and what a hand-written or a read-back sheet may leave out. */
  const SHAPES: Record<string, (seed: string) => Pick<StyleSheet, "palette" | "dark">> = {
    "a light and a dark palette, each with its surface": (seed) => ({ palette: chosen(seed, "light"), dark: chosen(seed, "dark") }),
    "a light and a dark palette with no surface": (seed) => ({ palette: noSurface(chosen(seed, "light")), dark: noSurface(chosen(seed, "dark")) }),
    "accent, paper and ink only, in both looks": (seed) => ({ palette: bare(chosen(seed, "light")), dark: bare(chosen(seed, "dark")) }),
    "a light palette only (the runtime makes the dark one)": (seed) => ({ palette: chosen(seed, "light"), dark: undefined }),
  };
  // A label on the accent: the runtime picks white or near-black for it, whichever reads better, and for an accent of
  // middling brightness neither reaches 4.5:1 (lowest here 4.3). That pair is the style's own and no sheet can mend it.
  const ON_THE_ACCENT = ["the sign-in card's button label", "the share sheet's Share button", "Share (the main button)"];
  const varsOf = (sheet: StyleSheet, mode: "light" | "dark"): Vars => ({ ...beforeLoad, ...toCssVars(sheet, mode), ...derived });

  test.each(Object.entries(SHAPES))("%s: 72 accents, light and dark", (_shape, make) => {
    const low: string[] = [];
    let read = 0;
    for (const seed of SEEDS) {
      const { dark, ...rest } = make(seed);
      const checked = validateStyleSheet({ ...defaultSheet(), ...rest, ...(dark ? { dark } : { dark: undefined }) });
      if (!checked.ok) throw new Error(`the runtime refuses the style made from ${seed}: ${checked.errors.join("; ")}`);
      for (const mode of ["light", "dark"] as const) {
        const vars = varsOf(checked.value, mode);
        for (const [what, text, backgrounds] of PAIRS) {
          const got = contrastOn(text, backgrounds, vars);
          read++;
          if (got.ratio < AA && !(ON_THE_ACCENT.includes(what) && got.ratio >= 4.3)) low.push(`${seed} ${mode}: ${what} ${got.text} on ${got.background} = ${got.ratio.toFixed(2)}`);
        }
      }
    }
    expect(read).toBe(72 * 2 * PAIRS.length);
    expect(low).toEqual([]);
  });

  test("the style measured at 4.05:1 in Chrome with the card on its surface (a dark part with no surface) reads at 4.5:1 or better on the paper", () => {
    const sheet = validateStyleSheet({ ...defaultSheet(), dark: { accent: "#a74ea1", paper: "#0d0f15", ink: "#e1e8f6" } });
    if (!sheet.ok) throw new Error(sheet.errors.join("; "));
    const vars = varsOf(sheet.value, "dark");
    const link = declared(signin, ".gilb-signin-link", "color");
    // Known answer: the card on the surface the runtime mixes for this style, as signin draws it when no host says otherwise.
    expect(contrastOn(link, ["var(--surface)"], vars).ratio).toBeCloseTo(4.05, 1);
    // What the starter draws: the card on the paper.
    expect(colourOf(SIGNIN_CARD, vars)).toEqual(colourOf("var(--paper)", vars));
    expect(contrastOn(link, [SIGNIN_CARD], vars).ratio).toBeGreaterThanOrEqual(AA);
  });
});
