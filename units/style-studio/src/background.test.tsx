// Spec: the page background is its own choice, apart from the palette (Dev.Guide.AppStyle, Kai 2026-11-20).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { checkPalette, defaultSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import { StyleStudio } from "./studio/index";
import { BACKGROUND_OPTIONS, sheetFromCatalogue, sheetFromSeed, withBackground, resolvePalette } from "./studio/model";
import { listCatalogues, loadWadaCatalogue, paletteToSheetColors } from "./catalogue/index";

afterEach(cleanup);

describe("background choice", () => {
  it("light options always include white, plus the named off-whites and tints; dark has its five", () => {
    expect(BACKGROUND_OPTIONS.light[0]!.hex).toBe("#ffffff");
    expect(BACKGROUND_OPTIONS.light.length).toBeGreaterThanOrEqual(8);
    expect(BACKGROUND_OPTIONS.dark.map((o) => o.id)).toEqual(["near-black", "dark-grey", "dark-navy", "dark-slate", "dark-warm"]);
  });

  it("changing the palette keeps the chosen background (catalogue and seed), both modes", () => {
    const pal = listCatalogues()[0]!.palettes;
    let sheet = withBackground(withBackground(defaultSheet(), "light", "#fdf0f2"), "dark", "#0e1726");
    const lightPaper = sheet.palette.paper;
    const darkPaper = sheet.dark!.paper;
    expect(lightPaper).toBe("#fdf0f2");
    for (const p of pal) {
      const next = sheetFromCatalogue(sheet, "pop", p)!;
      expect(next.palette.paper).toBe(lightPaper);
      expect(next.dark!.paper).toBe(darkPaper);
      sheet = next;
    }
    const seeded = sheetFromSeed(sheet, "#cc3366", "analogous");
    expect(seeded.palette.paper).toBe(lightPaper);
    expect(seeded.dark!.paper).toBe(darkPaper);
  });

  it("surface is a small step: darker in light, lighter in dark", () => {
    const s = withBackground(withBackground(defaultSheet(), "light", "#ffffff"), "dark", "#1c1c1e");
    expect(s.palette.surface).not.toBe("#ffffff");
    expect(resolvePalette(s, "light").surface).toBe(s.palette.surface);
    expect(s.dark!.surface).not.toBe(s.dark!.paper);
  });

  it("checkPalette passes for every catalogue palette x every background option x both modes", async () => {
    const cats = [...listCatalogues(), await loadWadaCatalogue()];
    let n = 0;
    for (const c of cats) for (const p of c.palettes) for (const mode of ["light", "dark"] as const) for (const o of BACKGROUND_OPTIONS[mode]) {
      const out = paletteToSheetColors(p, mode, o.hex);
      expect(out.paper).toBe(o.hex);
      expect(checkPalette(out).filter((r) => !r.pass), `${p.id} ${mode} ${o.id}`).toEqual([]);
      n++;
    }
    expect(n).toBeGreaterThan(348 * 13);
  });

  it("paletteToSheetColors no longer writes a palette colour into paper", () => {
    const p = { ...listCatalogues()[0]!.palettes[0]!, colors: ["#ffe9a8", "#222222", "#cc3366"] };
    expect(paletteToSheetColors(p, "light", "#ffffff").paper).toBe("#ffffff");
    expect(paletteToSheetColors(p, "dark", "#0f0f10").paper).toBe("#0f0f10");
  });

  it("the selector sits left of the mode button, follows the mode, and picking changes the sheet paper", () => {
    render(<StyleStudio />);
    const sel = screen.getByLabelText("Background colour") as HTMLSelectElement;
    const modeBtn = screen.getByTitle(/switch to/i);
    expect(sel.compareDocumentPosition(modeBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const light = Array.from(sel.options).map((o) => o.value);
    expect(light).toContain("#ffffff");
    fireEvent.change(sel, { target: { value: "#ffffff" } });
    expect((screen.getByLabelText("Background colour") as HTMLSelectElement).value).toBe("#ffffff");
    fireEvent.click(modeBtn);
    const dark = Array.from((screen.getByLabelText("Background colour") as HTMLSelectElement).options).map((o) => o.value);
    expect(dark).toContain("#0e1726");
    expect(dark).not.toContain("#ffffff");
  });

  it("an imported sheet keeps its own paper, shown as Custom", () => {
    const s = defaultSheet();
    s.palette = { ...s.palette, paper: "#fff3d6" };
    render(<StyleStudio initial={s} />);
    const sel = screen.getByLabelText("Background colour") as HTMLSelectElement;
    expect(sel.value).toBe("custom");
    expect(sel.options[0]!.textContent).toContain("#fff3d6");
  });
});
