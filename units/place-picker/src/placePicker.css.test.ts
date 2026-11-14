// @vitest-environment node
// New. The stable classes `pp-*` the component carries beside its Tailwind ones, and the stylesheet that styles them for an app without Tailwind.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const tsx = read("PlacePicker.tsx");
const css = read("placePicker.css");
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The `pp-` class names the component writes (in a className string or in an expression inside one); comment lines are left out. */
function classesUsed(src: string): string[] {
  const code = src.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
  return [...new Set(code.match(/\bpp-[a-z]+(?:-{1,2}[a-z]+)*/g) ?? [])];
}

describe("the stylesheet and the classes", () => {
  const used = classesUsed(tsx);
  it("the component carries the stable classes", () => {
    for (const c of ["pp-root", "pp-label", "pp-input", "pp-listbox", "pp-option", "pp-option--active", "pp-note", "pp-error", "pp-value"]) expect(used).toContain(c);
  });
  it.each(used)("%s is in the stylesheet", (c) => {
    expect(noComments).toMatch(new RegExp(`\\.${c}(?![A-Za-z0-9_-])`));
  });
  it("the stylesheet styles no class the component does not use", () => {
    const styled = new Set([...noComments.matchAll(/\.(pp-[a-z-]+)/g)].map((m) => m[1]!));
    for (const c of styled) expect(used, c).toContain(c);
  });
  it("the component imports its own stylesheet, and the package exports it", () => {
    expect(tsx).toMatch(/import "\.\/placePicker\.css";/);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { exports: Record<string, string> };
    expect(pkg.exports["./placePicker.css"]).toBe("./src/placePicker.css");
  });
  it("every rule is wrapped in :where() (no specificity of its own), pulls nothing in, and keeps 44px targets and a visible focus", () => {
    const rules = noComments.replace(/@media[^{]*\{/g, "").split("}").map((r) => r.trim()).filter(Boolean);
    for (const r of rules) expect(r.startsWith(":where("), r).toBe(true);
    expect(noComments).not.toMatch(/@import|url\(/);
    expect(noComments).toMatch(/\.pp-option\)\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(noComments).toMatch(/\.pp-input\)\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(noComments).toMatch(/\.pp-value\)\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(noComments).toMatch(/focus-visible[^{]*\{[^}]*outline/);
  });
  it("it reads the style-runtime tokens, each with a fallback", () => {
    for (const t of ["--ink", "--surface", "--lines", "--bad"]) expect(noComments).toMatch(new RegExp(`var\\(${t},`));
  });
});
