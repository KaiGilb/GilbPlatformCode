import { describe, expect, it } from "vitest";
import { listCatalogues, loadWadaCatalogue, paletteToSheetColors } from "./catalogue/index";
import { checkPalette } from "@kaigilb/gilbplatformcode-style-runtime";

const HEX = /^#[0-9a-f]{6}$/i;

describe("catalogue", () => {
  it("has no wada by default", () => {
    expect(listCatalogues().map((c) => c.id)).toEqual(["pop", "classic"]);
    expect(listCatalogues().some((c) => c.id === "wada")).toBe(false);
  });
  it("loads wada lazily with 348 palettes of 2 to 4 hex colours", async () => {
    const w = await loadWadaCatalogue();
    expect(w.id).toBe("wada");
    expect(w.palettes.length).toBe(348);
    for (const p of w.palettes) {
      expect(p.colors.length).toBeGreaterThanOrEqual(2);
      expect(p.colors.length).toBeLessThanOrEqual(4);
      for (const c of p.colors) expect(c).toMatch(HEX);
    }
    expect(w.palettes[0]!.id).toBe("wada-1");
    expect(w.palettes[347]!.name).toBe("Wada No. 348");
  });
  it("pop has 24 and classic 12, all valid", () => {
    const [pop, classic] = listCatalogues();
    expect(pop!.palettes.length).toBe(24);
    expect(classic!.palettes.length).toBe(12);
    for (const p of [...pop!.palettes, ...classic!.palettes]) {
      expect(p.colors.length).toBeGreaterThanOrEqual(2);
      expect(p.colors.length).toBeLessThanOrEqual(5);
      for (const c of p.colors) expect(c).toMatch(HEX);
    }
  });
  it("paletteToSheetColors always passes the contrast checks, every palette, both modes", async () => {
    for (const c of [...listCatalogues(), await loadWadaCatalogue()])
      for (const p of c.palettes) for (const mode of ["light", "dark"] as const) {
        const out = paletteToSheetColors(p, mode);
        expect(checkPalette(out).filter((r) => !r.pass), `${p.id} ${mode}`).toEqual([]);
      }
  });
});
