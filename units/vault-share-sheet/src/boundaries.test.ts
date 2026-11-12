// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const importsOf = (src: string) => [...src.matchAll(/(?:from|import)\s+"([^"]+)"/g)].map((m) => m[1]!);

describe("what imports what", () => {
  it("./model imports nothing from react or the dialog unit, and no other file of this unit", () => {
    const specs = importsOf(read("model.ts"));
    expect(specs.sort()).toEqual([
      "@kaigilb/gilbplatformcode-base-origin",
      "@kaigilb/gilbplatformcode-principal-row",
      "@kaigilb/gilbplatformcode-vault-access",
      "@kaigilb/gilbplatformcode-vault-address",
    ]);
    expect(specs.some((s) => /react|modal-sheet/.test(s))).toBe(false);
  });

  it("the sheet is built on modal-sheet and imports its own stylesheet", () => {
    const src = read("VaultShareSheet.tsx");
    expect(importsOf(src)).toContain("@kaigilb/gilbplatformcode-modal-sheet");
    expect(importsOf(src)).toContain("./vaultShareSheet.css");
    expect(src).not.toMatch(/role="dialog"/);
    expect(src).not.toMatch(/window\.confirm|\bconfirm\(/);
  });

  it("the stylesheet pulls nothing in", () => {
    expect(read("vaultShareSheet.css").replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/@import|url\(/);
  });
});
