import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import { StyleStudio } from "./studio/index";
import { sheetToRecords } from "./save/styleStore";
import { validSheet } from "./fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tab = (name: string) => screen.getByRole("tab", { name });
const type = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

/** Open Save & export, press Download, and return the JSON text the Studio would have saved to disk. */
async function exported(): Promise<string> {
  const blobs: Blob[] = [];
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => (blobs.push(b), "blob:x"), revokeObjectURL: vi.fn() }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  fireEvent.click(tab("Save & export"));
  fireEvent.click(screen.getByRole("button", { name: "Download style.tokens.json" }));
  click.mockRestore();
  return await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsText(blobs[blobs.length - 1]!);
  });
}

const startSheet = (): StyleSheet => ({ ...validSheet(), paletteSource: { kind: "seed", seed: "#a85c3b" } });

describe("Many colours tab", () => {
  it("is the tab right after One colour", () => {
    render(<StyleStudio />);
    const names = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(names.indexOf("Many colours")).toBe(names.indexOf("One colour") + 1);
  });

  // Spec: the colours entered reach the sheet byte for byte (light, dark, extras), with no repair; source becomes manual (saved as handPicked).
  it("(a) the colours entered reach the sheet exactly as typed, light and dark, with the extra colours", async () => {
    render(<StyleStudio initial={startSheet()} />);
    fireEvent.click(tab("Many colours"));
    type("Light accent", "#12ABef");
    type("Light text", "#777777");
    type("Light lines", "#CCCCCC");
    type("Light ok", "#00ff00");
    type("Light warning", "#ffff00");
    type("Light error", "#ff0000");
    type("Light text on accent", "#0a0b0c");
    type("Dark accent", "#AA11BB");
    type("Dark text", "#ededed");
    fireEvent.click(screen.getAllByRole("button", { name: /Add chart colour/ })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: /Add chart colour/ })[0]!);
    type("Light chart colour 1", "#010203");
    type("Light chart colour 2", "#F0E0D0");
    fireEvent.click(screen.getAllByRole("button", { name: /Add chart colour/ })[1]!);
    type("Dark chart colour 1", "#334455");
    const out = JSON.parse(await exported()) as StyleSheet;
    expect(out.palette).toMatchObject({ accent: "#12ABef", ink: "#777777", lines: "#CCCCCC", ok: "#00ff00", warn: "#ffff00", bad: "#ff0000", onAccent: "#0a0b0c" });
    expect(out.palette.extra).toEqual(["#010203", "#F0E0D0"]);
    expect(out.dark).toMatchObject({ accent: "#AA11BB", ink: "#ededed" });
    expect(out.dark!.extra).toEqual(["#334455"]);
    expect(out.paletteSource).toEqual({ kind: "manual" });
    // Background is not typed here: paper and surface are untouched.
    expect(out.palette.paper).toBe(startSheet().palette.paper);
    expect(out.palette.surface).toBe(startSheet().palette.surface);
  });

  it("a hex of the wrong form keeps the old value and marks the field not valid", async () => {
    render(<StyleStudio initial={startSheet()} />);
    fireEvent.click(tab("Many colours"));
    type("Light accent", "#12ab");
    expect((screen.getByLabelText("Light accent") as HTMLInputElement).getAttribute("aria-invalid")).toBe("true");
    const out = JSON.parse(await exported()) as StyleSheet;
    expect(out.palette.accent).toBe(startSheet().palette.accent);
  });

  // Spec: opening other tabs never regenerates the palette; only an act in a tab changes it.
  it("(b) Many colours -> One colour -> Palettes -> Many colours with no act leaves the sheet the same", async () => {
    render(<StyleStudio initial={startSheet()} />);
    fireEvent.click(tab("Many colours"));
    type("Light accent", "#12abef");
    type("Dark accent", "#aa11bb");
    const before = await exported();
    fireEvent.click(tab("Many colours"));
    fireEvent.click(tab("One colour"));
    fireEvent.click(tab("Palettes"));
    fireEvent.click(tab("Many colours"));
    expect((screen.getByLabelText("Light accent") as HTMLInputElement).value).toBe("#12abef");
    expect((screen.getByLabelText("Dark accent") as HTMLInputElement).value).toBe("#aa11bb");
    expect(await exported()).toBe(before);
  });

  // Spec: the existing contrast report flags a failing pair (text #777777 on paper #ffffff is 4.48:1, under the 7:1 ink rule).
  it("(c) text #777777 on paper #ffffff is flagged by the contrast report", () => {
    const s = startSheet();
    s.palette = { ...s.palette, paper: "#ffffff", surface: "#fafafa" };
    render(<StyleStudio initial={s} />);
    fireEvent.click(tab("Many colours"));
    type("Light text", "#777777");
    fireEvent.click(tab("Save & export"));
    const failing = screen.getAllByText(/FAIL/);
    expect(failing.length).toBeGreaterThan(0);
    expect(failing.some((el) => /ink\/paper/.test(el.closest("tr,li,div")?.textContent ?? ""))).toBe(true);
    expect((screen.getByTestId("gs-save") as HTMLButtonElement).disabled).toBe(true);
  });

  // Spec: a hand-picked palette makes the whole round trip (export, import, export) unchanged, and is saved to the vault as handPicked.
  it("(d) export then import gives the same palette and source, and the vault record says handPicked", async () => {
    render(<StyleStudio initial={startSheet()} />);
    fireEvent.click(tab("Many colours"));
    type("Light accent", "#12ABef");
    type("Dark ok", "#00FF00");
    fireEvent.click(screen.getAllByRole("button", { name: /Add chart colour/ })[0]!);
    type("Light chart colour 1", "#A1B2C3");
    const first = await exported();
    cleanup();
    render(<StyleStudio />);
    fireEvent.click(tab("Save & export"));
    const input = document.querySelector('input[type="file"][accept*="json"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([first], "style.tokens.json", { type: "application/json" })] } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Imported"));
    const second = await exported();
    expect(JSON.parse(second)).toEqual(JSON.parse(first));
    const back = JSON.parse(second) as StyleSheet;
    expect(back.paletteSource).toEqual({ kind: "manual" });
    expect(JSON.stringify(sheetToRecords(back).palette)).toContain("handPicked");
  });
});
