import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const css = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

function block(theme: "light" | "dark"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!m[1].includes(`data-theme="${theme}"`)) continue;
    for (const d of m[2].matchAll(/--([a-z-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

const light = block("light");
const dark = { ...light, ...block("dark") };

function value(vars: Record<string, string>, name: string): string | null {
  let v = vars[name];
  for (let i = 0; v && i < 4; i++) {
    const ref = v.match(/^var\(--([a-z-]+)\)$/);
    if (!ref) break;
    v = vars[ref[1]];
  }
  return v ?? null;
}

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? n.replace(/./g, (c) => c + c) : n;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every text-on-background pair the app and the sign-in card draw (the card reads the --signin-* names).
const PAIRS: [string, string][] = [
  ["ink", "surface"], ["ink", "bg"], ["muted", "surface"], ["muted", "bg"],
  ["accent-ink", "accent"], ["accent", "surface"], ["danger", "surface"], ["danger", "bg"],
  ["signin-ink", "signin-card"], ["signin-ink", "signin-field"], ["signin-ink", "signin-sheet"],
  ["signin-muted", "signin-card"], ["signin-muted", "signin-sheet"],
  ["signin-on-brand", "signin-brand"], ["signin-brand", "signin-card"],
  ["signin-error-ink", "signin-error-bg"],
];

for (const [theme, vars] of [["light", light], ["dark", dark]] as const) {
  test(`D4: every text pair is at least 4.5:1 in ${theme} mode (sign-in card included)`, () => {
    const failures: string[] = [];
    for (const [fg, bg] of PAIRS) {
      const f = value(vars, fg), b = value(vars, bg);
      if (!f || !b) { failures.push(`${fg} on ${bg}: variable not set`); continue; }
      const r = ratio(f, b);
      if (r < 4.5) failures.push(`${fg} ${f} on ${bg} ${b}: ${r.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });
}
