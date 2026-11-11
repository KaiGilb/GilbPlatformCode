import { describe, expect, it } from "vitest";
import { toCssText, toCssVars } from "./css";
import { COLOR_PATTERNS } from "./schema";
import { validSheet } from "./fixtures";

const decls = (css: string) =>
  css.split("\n").map((l) => l.trim()).filter((l) => /^--[a-z0-9-]+: .*;$/.test(l)).map((l) => {
    const m = /^(--[a-z0-9-]+): (.*);$/.exec(l)!;
    return [m[1]!, m[2]!] as const;
  });

describe("toCssText", () => {
  const css = toCssText(validSheet());
  const all = decls(css);

  it("emits the anchors, constants and the shared vocabulary", () => {
    for (const k of ["--accent", "--paper", "--ink", "--surface", "--lines", "--tint-hi", "--on-accent", "--ok", "--warn", "--bad", "--serif", "--sans", "--mono", "--r-sm", "--r-md", "--r-lg", "--r-xl", "--shadow-sm", "--shadow-md", "--shadow-lg", "--signin-brand", "--signin-on-brand"])
      expect(css).toContain(`${k}:`);
    expect(css).not.toContain("--paper-2");
    expect(css).not.toContain("--ink-soft");
  });

  it("emits root, dark and system blocks", () => {
    expect(css).toContain(":root {");
    expect(css).toContain('[data-theme="dark"] {');
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(":root:not([data-theme])");
    const light = validSheet();
    light.mode = "light";
    expect(toCssText(light)).not.toContain("prefers-color-scheme");
  });

  it("every declaration is one name, one value, no stray separators; colour values match the validator", () => {
    expect(all.length).toBeGreaterThan(30);
    for (const [k, v] of all) {
      expect(v, k).not.toMatch(/[;{}<>\\]/);
      if (["--accent", "--paper", "--ink", "--on-accent", "--ok", "--warn", "--bad"].includes(k)) {
        expect(COLOR_PATTERNS.some((re) => re.test(v)), `${k}: ${v}`).toBe(true);
      }
    }
    // the text outside declarations is only selectors, braces and the media query
    const rest = css.split("\n").filter((l) => !/^\s*--[a-z0-9-]+: .*;$/.test(l) && l.trim() !== "");
    for (const l of rest) expect(l.trim()).toMatch(/^(:root|\[data-theme="dark"\]|@media \(prefers-color-scheme: dark\)|:root:not\(\[data-theme\]\)) \{$|^\}$/);
  });

  it("maps radius, density, fonts and pill", () => {
    const v = toCssVars({ ...validSheet(), shape: { radius: 10, shadow: "none", density: "spacious" }, button: "pill" }, "light");
    expect(v["--r-sm"]).toBe("6px");
    expect(v["--r-md"]).toBe("10px");
    expect(v["--r-lg"]).toBe("15px");
    expect(v["--r-xl"]).toBe("20px");
    expect(v["--shadow-md"]).toBe("none");
    expect(v["--gs-space"]).toBe("8px");
    expect(v["--gs-control-h"]).toBe("44px");
    expect(v["--gs-button-radius"]).toBe("999px");
    expect(v["--sans"]).toMatch(/^"Inter", ui-sans-serif/);
    expect(toCssVars({ ...validSheet(), shape: { radius: 0, shadow: "soft", density: "compact" } }, "light")["--r-xl"]).toBe("0px");
  });

  it("glass window", () => {
    const v = toCssVars({ ...validSheet(), window: "glass" }, "light");
    expect(v["--gs-window-bg"]).toContain("color-mix");
    expect(v["--gs-window-backdrop"]).toBe("blur(14px)");
  });

  it("throws on an invalid sheet", () => {
    const bad = validSheet();
    bad.palette.accent = "red;}body{display:none";
    expect(() => toCssText(bad)).toThrow(/invalid style sheet/);
    expect(() => toCssText({} as never)).toThrow();
  });

  it("a name that tries to break out is rejected, never emitted", () => {
    const bad = validSheet();
    bad.fonts.sans.family = 'x"; } body { display:none';
    expect(() => toCssText(bad)).toThrow();
  });
});
