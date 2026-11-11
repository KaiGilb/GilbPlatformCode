import { describe, expect, it } from "vitest";
import { validateStyleSheet } from "./schema";
import { validSheet } from "./fixtures";

const clone = () => JSON.parse(JSON.stringify(validSheet())) as Record<string, any>;

describe("validateStyleSheet", () => {
  it("accepts a valid full sheet", () => {
    const r = validateStyleSheet(validSheet());
    expect(r.ok).toBe(true);
  });

  it("accepts every colour form", () => {
    for (const c of ["#abc", "#aabbcc", "#aabbccdd", "rgb(1,2,3)", "rgba(1, 2, 3, 0.5)", "rgb(1 2 3 / 50%)", "oklch(0.5 0.1 200)", "oklch(50% 0.1 200 / 0.4)", "hsl(200, 50%, 40%)", "hsl(200 50% 40%)"]) {
      const s = clone();
      s.palette.accent = c;
      expect(validateStyleSheet(s).ok, c).toBe(true);
    }
  });

  const hostile: [string, (s: Record<string, any>) => void][] = [
    ["colour breakout", (s) => (s.palette.accent = "red;}body{display:none")],
    ["colour url()", (s) => (s.palette.paper = "url(https://x)")],
    ["colour expression()", (s) => (s.palette.ink = "expression(alert(1))")],
    ["colour style-close", (s) => (s.palette.surface = "</style><script>")],
    ["colour named keyword", (s) => (s.palette.lines = "red")],
    ["colour @import", (s) => (s.palette.ok = "@import 'x'")],
    ["colour comment", (s) => (s.palette.warn = "#fff/* */")],
    ["colour backslash escape", (s) => (s.palette.bad = "\\3c script")],
    ["colour rgb with var()", (s) => (s.palette.onAccent = "rgb(var(--x), 1, 2)")],
    ["colour hex trailing junk", (s) => (s.dark.accent = "#fff; x")],
    ["logo javascript:", (s) => (s.logo.primary = "javascript:alert(1)")],
    ["logo svg data", (s) => (s.logo.mark = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")],
    ["logo http", (s) => (s.logo.primary = "http://example.com/a.png")],
    ["logo quote break", (s) => (s.logo.primary = 'https://x.com/a.png"onload="x')],
    ["font quote", (s) => (s.fonts.sans.family = 'Inter"')],
    ["font semicolon-brace", (s) => (s.fonts.sans.family = "Arial;}")],
    ["font @import", (s) => (s.fonts.serif.family = "@import url(x)")],
    ["font too long", (s) => (s.fonts.sans.family = "a".repeat(61))],
    ["unknown top key", (s) => (s.evil = 1)],
    ["unknown palette key", (s) => (s.palette.evil = "#fff")],
    ["radius 999", (s) => (s.shape.radius = 999)],
    ["baseSizePx 100", (s) => (s.fonts.baseSizePx = 100)],
    ["name with brace", (s) => (s.name = "x{y}")],
    ["bad enum", (s) => (s.button = "neon")],
    ["wrong version", (s) => (s.version = 2)],
  ];
  for (const [label, mutate] of hostile) {
    it(`rejects: ${label}`, () => {
      const s = clone();
      mutate(s);
      const r = validateStyleSheet(s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.every((e) => e.startsWith("$"))).toBe(true);
    });
  }

  it("returns all errors with field paths", () => {
    const s = clone();
    s.palette.accent = "red;}";
    s.shape.radius = 999;
    s.fonts.baseSizePx = 100;
    const r = validateStyleSheet(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.startsWith("$.palette.accent"))).toBe(true);
      expect(r.errors.some((e) => e.startsWith("$.shape.radius"))).toBe(true);
      expect(r.errors.some((e) => e.startsWith("$.fonts.baseSizePx"))).toBe(true);
    }
  });

  it("rejects non-objects", () => {
    for (const v of [null, 1, "x", [], undefined]) expect(validateStyleSheet(v).ok).toBe(false);
  });
});
