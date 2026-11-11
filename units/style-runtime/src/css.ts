// StyleSheet -> CSS custom properties. SECURITY: toCssText validates first and only ever interpolates
// (a) strings that passed validateStyleSheet, (b) hex produced by toHex, (c) constants in this file.
import { contrastRatio, ensureContrast } from "./color";
import { paletteFromSeed } from "./palette";
import { validateStyleSheet, type PaletteInput, type StyleSheet } from "./schema";

type Mode = "light" | "dark";

// System stacks copied from GilbApp src/styles/tokens.css.
const SERIF_STACK = `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif`;
const SANS_STACK = `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const MONO_STACK = `ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;

const SHADOWS: Record<"soft" | "medium" | "strong", [string, string, string]> = {
  soft: ["0 1px 2px rgba(0, 0, 0, A1)", "0 2px 8px rgba(0, 0, 0, A2)", "0 12px 32px rgba(0, 0, 0, A3)"],
  medium: ["0 1px 2px rgba(0, 0, 0, B1)", "0 2px 8px rgba(0, 0, 0, B2), 0 12px 34px rgba(0, 0, 0, B3)", "0 24px 70px rgba(0, 0, 0, B4), 0 4px 14px rgba(0, 0, 0, B5)"],
  strong: ["0 2px 4px rgba(0, 0, 0, C1)", "0 4px 14px rgba(0, 0, 0, C2), 0 18px 44px rgba(0, 0, 0, C3)", "0 32px 80px rgba(0, 0, 0, C4), 0 8px 20px rgba(0, 0, 0, C5)"],
};
const ALPHAS: Record<string, [number, number]> = {
  A1: [0.05, 0.35], A2: [0.06, 0.4], A3: [0.1, 0.5],
  B1: [0.05, 0.35], B2: [0.08, 0.4], B3: [0.1, 0.5], B4: [0.18, 0.6], B5: [0.1, 0.4],
  C1: [0.1, 0.4], C2: [0.14, 0.5], C3: [0.18, 0.6], C4: [0.3, 0.7], C5: [0.16, 0.5],
};

function shadows(kind: StyleSheet["shape"]["shadow"], mode: Mode): [string, string, string] {
  if (kind === "none") return ["none", "none", "none"];
  const i = mode === "dark" ? 1 : 0;
  const fill = (t: string) => t.replace(/\b([ABC]\d)\b/g, (_m, k: string) => String(ALPHAS[k]?.[i] ?? 0.1));
  const [a, b, c] = SHADOWS[kind];
  return [fill(a), fill(b), fill(c)];
}

const px = (n: number) => `${n}px`;

function fontValue(family: string | undefined, stack: string): string {
  // family is validated: letters, digits, spaces, hyphens only, so quoting is safe.
  return family ? `"${family}", ${stack}` : stack;
}

function colorVars(sheet: StyleSheet, mode: Mode): Record<string, string> {
  const given: PaletteInput = mode === "dark" ? (sheet.dark ?? generatedAnchors(sheet)) : sheet.palette;
  const gen = paletteFromSeed(given.accent, { mode, harmony: "mono" });
  const paper = given.paper;
  const ensure = (c: string) => ensureContrast(c, paper, 4.5);
  const onAccent = given.onAccent ?? (contrastRatio("#ffffff", given.accent) >= contrastRatio("#111111", given.accent) ? "#ffffff" : "#111111");
  // Original palette colours (catalogue / website), contrast-fixed to 3:1 against this mode's paper.
  const extras: Record<string, string> = {};
  (sheet.palette.extra ?? []).slice(0, 6).forEach((c, i) => {
    extras[`--gs-extra-${i + 1}`] = ensureContrast(c, paper, 3);
  });
  return {
    ...extras,
    "--accent": given.accent,
    "--paper": paper,
    "--ink": given.ink,
    "--surface": given.surface ?? "color-mix(in srgb, var(--paper) 78%, var(--tint-hi))",
    "--lines": given.lines ?? "var(--ink)",
    "--tint-hi": mode === "dark" ? "color-mix(in srgb, var(--ink) 26%, var(--paper))" : "#ffffff",
    "--on-accent": onAccent,
    "--ok": given.ok ?? ensure(gen.ok),
    "--warn": given.warn ?? ensure(gen.warn),
    "--bad": given.bad ?? ensure(gen.bad),
    "--signin-brand": "var(--accent)",
    "--signin-on-brand": "var(--on-accent)",
  };
}

function generatedAnchors(sheet: StyleSheet): PaletteInput {
  const p = paletteFromSeed(sheet.palette.accent, { mode: "dark", harmony: "mono" });
  return { accent: p.accent, paper: p.paper, ink: p.ink, surface: p.surface, lines: p.lines };
}

function buttonVars(sheet: StyleSheet): Record<string, string> {
  const radius = sheet.button === "pill" ? "999px" : "var(--r-md)";
  const hoverMix = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;
  switch (sheet.button) {
    case "filled":
    case "pill":
      return {
        "--gs-button-bg": "var(--accent)",
        "--gs-button-fg": "var(--on-accent)",
        "--gs-button-border": "1px solid transparent",
        "--gs-button-radius": radius,
        "--gs-button-hover-bg": "color-mix(in srgb, var(--accent) 88%, var(--ink))",
      };
    case "outline":
      return {
        "--gs-button-bg": "transparent",
        "--gs-button-fg": "var(--accent-ink)",
        "--gs-button-border": "1px solid var(--accent)",
        "--gs-button-radius": radius,
        "--gs-button-hover-bg": hoverMix(10),
      };
    case "soft":
      return {
        "--gs-button-bg": hoverMix(12),
        "--gs-button-fg": "var(--accent-ink)",
        "--gs-button-border": "1px solid transparent",
        "--gs-button-radius": radius,
        "--gs-button-hover-bg": hoverMix(20),
      };
    case "text":
      return {
        "--gs-button-bg": "transparent",
        "--gs-button-fg": "var(--accent-ink)",
        "--gs-button-border": "1px solid transparent",
        "--gs-button-radius": radius,
        "--gs-button-hover-bg": hoverMix(10),
      };
  }
}

function windowVars(sheet: StyleSheet): Record<string, string> {
  // Four clearly different looks: flat = sunken tint only; bordered = hairline only; card = shadow only; glass = blur + light edge.
  switch (sheet.window) {
    case "flat":
      return { "--gs-window-bg": "color-mix(in srgb, var(--paper) 96%, var(--ink))", "--gs-window-border": "none", "--gs-window-shadow": "none", "--gs-window-radius": "0", "--gs-window-backdrop": "none" };
    case "bordered":
      return { "--gs-window-bg": "var(--paper)", "--gs-window-border": "1px solid color-mix(in srgb, var(--lines) 22%, transparent)", "--gs-window-shadow": "none", "--gs-window-radius": "var(--r-lg)", "--gs-window-backdrop": "none" };
    case "card":
      return { "--gs-window-bg": "var(--surface)", "--gs-window-border": "none", "--gs-window-shadow": "var(--shadow-md)", "--gs-window-radius": "var(--r-lg)", "--gs-window-backdrop": "none" };
    case "glass":
      return {
        "--gs-window-bg": "color-mix(in srgb, var(--surface) 55%, transparent)",
        "--gs-window-border": "1px solid rgba(255, 255, 255, 0.35)",
        "--gs-window-shadow": "var(--shadow-lg)",
        "--gs-window-radius": "var(--r-lg)",
        "--gs-window-backdrop": "blur(14px)",
      };
  }
}

/** All variables for one mode. The sheet must already be validated (toCssText does that; direct callers are on their own). */
export function toCssVars(sheet: StyleSheet, mode: Mode): Record<string, string> {
  const r = sheet.shape.radius;
  const [sm, md, lg] = shadows(sheet.shape.shadow, mode);
  const density: Record<StyleSheet["shape"]["density"], [number, number]> = { compact: [4, 32], comfortable: [6, 38], spacious: [8, 44] };
  const [space, controlH] = density[sheet.shape.density];
  return {
    ...colorVars(sheet, mode),
    "--serif": fontValue(sheet.fonts.serif?.family, SERIF_STACK),
    // Headings use the serif slot; apps and the Studio preview read this name.
    "--gs-font-heading": fontValue(sheet.fonts.serif?.family, SERIF_STACK),
    "--sans": fontValue(sheet.fonts.sans.family, SANS_STACK),
    "--mono": fontValue(sheet.fonts.mono?.family, MONO_STACK),
    "--r-sm": px(Math.round(r * 0.6)),
    "--r-md": px(r),
    "--r-lg": px(Math.round(r * 1.45)),
    "--r-xl": px(Math.round(r * 2)),
    "--shadow-sm": sm,
    "--shadow-md": md,
    "--shadow-lg": lg,
    "--gs-space": px(space),
    "--gs-control-h": px(controlH),
    "--gs-font-size": px(sheet.fonts.baseSizePx),
    "--gs-scale": String(sheet.fonts.scaleRatio),
    ...buttonVars(sheet),
    ...windowVars(sheet),
  };
}

const MODE_KEYS = [
  "--accent", "--paper", "--ink", "--surface", "--lines", "--tint-hi", "--on-accent", "--ok", "--warn", "--bad",
  "--shadow-sm", "--shadow-md", "--shadow-lg",
];

const block = (selector: string, vars: Record<string, string>, indent = ""): string =>
  `${indent}${selector} {\n${Object.entries(vars).map(([k, v]) => `${indent}  ${k}: ${v};`).join("\n")}\n${indent}}`;

const pickModeKeys = (vars: Record<string, string>): Record<string, string> =>
  Object.fromEntries([...MODE_KEYS, ...Object.keys(vars).filter((k) => k.startsWith("--gs-extra-"))].map((k) => [k, vars[k] as string]));

// Last line of defence: nothing that could end a declaration, a rule, or the style element may be in a value.
const UNSAFE_VALUE = /[;{}<>\\]|url\s*\(|@import|expression\s*\(|\/\*/i;

export function toCssText(sheet: StyleSheet): string {
  const checked = validateStyleSheet(sheet);
  if (!checked.ok) throw new Error(`invalid style sheet: ${checked.errors.join("; ")}`);
  const s = checked.value;

  const rootVars = toCssVars(s, s.mode === "dark" ? "dark" : "light");
  const darkVars = pickModeKeys(toCssVars(s, "dark"));
  const lightVars = pickModeKeys(toCssVars(s, "light"));
  // --gs-mode lets initTheme()/toggleTheme() know the sheet's own mode without a React dependency.
  rootVars["--gs-mode"] = s.mode;
  for (const [k, v] of [...Object.entries(rootVars), ...Object.entries(darkVars), ...Object.entries(lightVars)]) {
    if (UNSAFE_VALUE.test(v)) throw new Error(`refusing to emit unsafe value for ${k}`);
  }

  const parts = [block(":root", rootVars), block('[data-theme="dark"]', darkVars)];
  // A dark sheet must still be able to switch to light (ThemeToggle), so it also carries an explicit light block.
  if (s.mode === "dark") parts.push(block('[data-theme="light"]', lightVars));
  if (s.mode === "system") {
    parts.push(`@media (prefers-color-scheme: dark) {\n${block(":root:not([data-theme])", darkVars, "  ")}\n}`);
  }
  return parts.join("\n") + "\n";
}
