// @vitest-environment node
// The shipped example sheet is valid, and turns into CSS. An example that no longer validates is a broken starting point.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkPalette, toCssText, validateStyleSheet } from "./index";

const raw = JSON.parse(readFileSync(fileURLToPath(new URL("../examples/style.tokens.json", import.meta.url)), "utf8"));

describe("examples/style.tokens.json", () => {
  it("passes validateStyleSheet", () => {
    const r = validateStyleSheet(raw);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });
  it("turns into CSS custom properties", () => {
    const r = validateStyleSheet(raw);
    if (!r.ok) throw new Error("invalid");
    expect(toCssText(r.value)).toContain("--accent");
  });
  it("meets the contrast rules", () => {
    const r = validateStyleSheet(raw);
    if (!r.ok) throw new Error("invalid");
    const p = r.value.palette as Parameters<typeof checkPalette>[0];
    const bad = checkPalette(p).filter((row) => !row.pass);
    expect(bad).toEqual([]);
    expect(checkPalette({ ...p, ...(r.value.dark as object) }).filter((row) => !row.pass)).toEqual([]);
  });
});
