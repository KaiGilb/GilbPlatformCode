import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StyleStudio } from "./studio/index";
import { paletteFromSeed, checkPalette } from "@kaigilb/gilbplatformcode-style-runtime";
import { paletteToSheetColors, popPalettes } from "./catalogue/index";
import { validateStyleSheet, type StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import { validSheet } from "./fixtures";

afterEach(cleanup);

const preview = () => screen.getByTestId("gs-preview");
const accent = () => preview().style.getPropertyValue("--accent");
const tab = (name: string) => screen.getByRole("tab", { name });
const jsonFile = (obj: unknown, name = "style.tokens.json") => new File([JSON.stringify(obj)], name, { type: "application/json" });
const importInput = () => document.querySelector('input[type="file"][accept*="json"]') as HTMLInputElement;

async function importSheet(obj: unknown) {
  fireEvent.click(tab("Save & export"));
  fireEvent.change(importInput(), { target: { files: [jsonFile(obj)] } });
}

describe("tabs", () => {
  it("renders all 8 tabs with tablist roles", () => {
    render(<StyleStudio />);
    expect(screen.getByRole("tablist")).toBeTruthy();
    const names = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(names).toEqual(["Palettes", "One colour", "From website", "Fonts", "Buttons", "Windows", "Logo", "Save & export"]);
    expect(screen.getByRole("tabpanel")).toBeTruthy();
  });

  it("moves with ArrowRight and ArrowLeft", () => {
    render(<StyleStudio />);
    fireEvent.keyDown(tab("Palettes"), { key: "ArrowRight" });
    expect(tab("One colour").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("One colour"));
    fireEvent.keyDown(tab("One colour"), { key: "ArrowLeft" });
    expect(tab("Palettes").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tab("Palettes"), { key: "ArrowLeft" });
    expect(tab("Save & export").getAttribute("aria-selected")).toBe("true");
  });
});

describe("palettes", () => {
  it("choosing a pop palette sets --accent from that palette", () => {
    render(<StyleStudio />);
    const before = accent();
    fireEvent.click(screen.getByRole("option", { name: /Hot Coral/ }));
    const pal = popPalettes.find((p) => p.name === "Hot Coral")!;
    expect(accent()).toBe(paletteToSheetColors(pal, "light").accent);
    expect(accent()).not.toBe(before);
  });

  it("arrow keys preview instantly without committing", () => {
    render(<StyleStudio />);
    const before = accent();
    const list = screen.getByRole("listbox", { name: "Palettes" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(accent()).toBe(paletteToSheetColors(popPalettes[1]!, "light").accent);
    fireEvent.blur(list);
    expect(accent()).toBe(before);
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(accent()).toBe(paletteToSheetColors(popPalettes[2]!, "light").accent);
  });

  it("Wada group is present by default (loaded lazily) with its credit, and hidden with includeWada={false}", async () => {
    const { unmount } = render(<StyleStudio includeWada={false} />);
    expect(screen.queryByText("Wada")).toBeNull();
    expect(screen.queryByText(/Sanzo Wada/)).toBeNull();
    unmount();
    render(<StyleStudio />);
    expect(screen.getByText("Loading Wada palettes…")).toBeTruthy();
    expect(await screen.findByText("Wada")).toBeTruthy();
    expect(screen.getByText("after Sanzo Wada, A Dictionary of Color Combinations (1933–34); data mattdesl/dictionary-of-colour-combinations (MIT)")).toBeTruthy();
  });
});

describe("one colour", () => {
  it("hex + triadic gives the engine's accent and a palette that passes every check", () => {
    render(<StyleStudio />);
    fireEvent.click(tab("One colour"));
    fireEvent.change(screen.getByLabelText("Hex colour"), { target: { value: "#e11d48" } });
    fireEvent.click(screen.getByRole("radio", { name: "triadic" }));
    const expected = paletteFromSeed("#e11d48", { mode: "light", harmony: "triadic" });
    expect(accent()).toBe(expected.accent);
    expect(checkPalette(expected).every((r) => r.pass)).toBe(true);
    fireEvent.click(tab("Save & export"));
    expect(screen.queryByText(/FAIL/)).toBeNull();
    expect((screen.getByTestId("gs-save") as HTMLButtonElement).disabled).toBe(false);
  });

  it("ignores a hex that is not a colour", () => {
    render(<StyleStudio />);
    const before = accent();
    fireEvent.click(tab("One colour"));
    fireEvent.change(screen.getByLabelText("Hex colour"), { target: { value: "#zzz" } });
    expect(accent()).toBe(before);
    expect(screen.getByText(/Enter a colour/)).toBeTruthy();
  });
});

describe("from website", () => {
  it("says Not connected without extractFromUrl", () => {
    render(<StyleStudio />);
    fireEvent.click(tab("From website"));
    expect(screen.getByText("Not connected")).toBeTruthy();
  });

  it("rejects a hostile value, gates on the rights box, and builds the palette from the good ones", async () => {
    const extract = vi.fn(async () => ({ colors: ["red;}body{x", "#0b6e4f", "#f7f3e8"], fonts: ["Inter", "x;y"] }));
    render(<StyleStudio extractFromUrl={extract} />);
    fireEvent.click(tab("From website"));
    const use = screen.getByRole("button", { name: "Use these" }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Website address"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Read styles" }));
    await screen.findAllByText(/Rejected:/);
    expect(screen.getByText("red;}body{x")).toBeTruthy();
    expect(use.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/I have the right to use this brand/));
    expect(use.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Use #f7f3e8 as accent" }));
    fireEvent.click(screen.getByRole("radio", { name: "paper" }));
    fireEvent.click(screen.getByRole("button", { name: "Use #f7f3e8 as paper" }));
    fireEvent.click(use);
    const style = preview().getAttribute("style") ?? "";
    expect(style).not.toContain("body{x");
    expect(style).not.toContain("red;");
    fireEvent.click(tab("Save & export"));
    expect(screen.queryByText(/FAIL/)).toBeNull();
  });

  it("refuses an address that does not start with https://", async () => {
    const extract = vi.fn(async () => ({ colors: [], fonts: [] }));
    render(<StyleStudio extractFromUrl={extract} />);
    fireEvent.click(tab("From website"));
    fireEvent.change(screen.getByLabelText("Website address"), { target: { value: "http://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Read styles" }));
    expect(screen.getByText(/must start with https/)).toBeTruthy();
    expect(extract).not.toHaveBeenCalled();
  });
});

describe("import and save", () => {
  it("an import with palette.accent url(x) shows errors and changes nothing", async () => {
    render(<StyleStudio />);
    const before = accent();
    const bad = validSheet();
    (bad.palette as { accent: string }).accent = "url(x)";
    await importSheet(bad);
    await waitFor(() => expect(screen.getAllByText(/palette\.accent/).length).toBeGreaterThan(0));
    expect(accent()).toBe(before);
  });

  it("invalid JSON is reported", async () => {
    render(<StyleStudio />);
    fireEvent.click(tab("Save & export"));
    fireEvent.change(importInput(), { target: { files: [new File(["{nope"], "x.json", { type: "application/json" })] } });
    expect(await screen.findByText(/not valid JSON/)).toBeTruthy();
  });

  it("a valid import applies", async () => {
    render(<StyleStudio />);
    const sheet = validSheet();
    await importSheet(sheet);
    await screen.findByText("Imported.");
    expect(accent()).toBe(sheet.palette.accent);
  });

  it("Save calls onSave exactly once with a sheet validateStyleSheet accepts", async () => {
    const onSave = vi.fn<(s: StyleSheet) => void>();
    render(<StyleStudio onSave={onSave} />);
    fireEvent.click(tab("Save & export"));
    const save = screen.getByTestId("gs-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await screen.findByText("Saved");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(validateStyleSheet(onSave.mock.calls[0]![0]).ok).toBe(true);
  });

  it("shows Failed when onSave rejects", async () => {
    render(<StyleStudio onSave={() => Promise.reject(new Error("no"))} />);
    fireEvent.click(tab("Save & export"));
    fireEvent.click(screen.getByTestId("gs-save"));
    await screen.findByText("Failed");
  });

  it("Save is disabled when an imported palette has ink == paper", async () => {
    const onSave = vi.fn();
    render(<StyleStudio onSave={onSave} />);
    const bad = validSheet();
    bad.palette = { ...bad.palette, ink: bad.palette.paper };
    await importSheet(bad);
    await screen.findByText("Imported.");
    expect(screen.getAllByText(/FAIL/).length).toBeGreaterThan(0);
    const save = screen.getByTestId("gs-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("downloads style.tokens.json", () => {
    const blobs: Blob[] = [];
    const create = vi.fn((b: Blob) => (blobs.push(b), "blob:x"));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<StyleStudio />);
    fireEvent.click(tab("Save & export"));
    fireEvent.click(screen.getByRole("button", { name: "Download style.tokens.json" }));
    expect(click).toHaveBeenCalled();
    expect(blobs[0]!.type).toBe("application/json");
    click.mockRestore();
  });
});

describe("isolation", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    document.body.removeAttribute("style");
  });

  it("never styles document.documentElement or body, however much you click", async () => {
    render(<StyleStudio includeWada extractFromUrl={async () => ({ colors: ["#0b6e4f"], fonts: [] })} />);
    fireEvent.click(screen.getByRole("option", { name: /Neon Citrus/ }));
    fireEvent.click(tab("One colour"));
    fireEvent.change(screen.getByLabelText("Hex colour"), { target: { value: "#11aa55" } });
    fireEvent.click(tab("Fonts"));
    fireEvent.click(tab("Buttons"));
    fireEvent.click(screen.getByRole("button", { name: "Button style pill" }));
    fireEvent.click(tab("Windows"));
    fireEvent.click(screen.getByRole("button", { name: "Window style glass" }));
    fireEvent.click(tab("Save & export"));
    fireEvent.click(within(screen.getByRole("group", { name: "Colour mode" })).getByRole("button", { name: "Dark" }));
    expect(document.documentElement.getAttribute("style")).toBeNull();
    expect(document.body.getAttribute("style")).toBeNull();
    expect(document.getElementById("gilb-style")).toBeNull();
    expect(preview().getAttribute("style")).toContain("--accent");
  });
});
