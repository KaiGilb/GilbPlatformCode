import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StyleStudio, ThemeToggle } from "./index";
import { applyStyleSheet, initTheme, toggleTheme, toCssText, validateStyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import { FONT_CATALOGUE, FONT_PAIRINGS, findFont, isFontLoaded, loadFontFamily } from "./studio/fonts";
import { FONT_LOADERS } from "./studio/fonts.generated";
import { validSheet } from "./fixtures";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.getElementById("gilb-style")?.remove();
});
const tab = (name: string) => screen.getByRole("tab", { name });
const preview = () => screen.getByTestId("gs-preview");
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe("Wada default", () => {
  it("is on without a prop and off with includeWada={false}", async () => {
    render(<StyleStudio includeWada={false} />);
    expect(screen.queryByText("Wada")).toBeNull();
    cleanup();
    render(<StyleStudio />);
    expect(await screen.findByText("Wada")).toBeTruthy();
  });
});

describe("preview light/dark toggle", () => {
  it("one click flips the preview, aria-pressed and the title", () => {
    render(<StyleStudio />);
    const group = screen.getByText("Live preview").parentElement!;
    const btn = within(group).getByRole("button", { name: "Light" });
    expect(screen.queryByLabelText("Preview mode")).toBeNull();
    expect(preview().getAttribute("data-theme")).toBe("light");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.getAttribute("title")).toBe("Switch to dark");
    fireEvent.click(btn);
    expect(preview().getAttribute("data-theme")).toBe("dark");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("title")).toBe("Switch to light");
    expect(btn.textContent).toBe("Dark");
    fireEvent.click(btn);
    expect(preview().getAttribute("data-theme")).toBe("light");
  });
  it("is a native button, reachable by keyboard (Enter and Space activate native buttons)", () => {
    render(<StyleStudio />);
    const btn = screen.getByRole("button", { name: "Light" }) as HTMLButtonElement;
    btn.focus();
    expect(document.activeElement).toBe(btn);
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.type).toBe("button");
    expect(btn.tabIndex).toBe(0);
  });
  it("the saved default mode is a three-way button group", () => {
    render(<StyleStudio />);
    fireEvent.click(tab("Save & export"));
    const g = screen.getByRole("group", { name: "Colour mode" });
    const names = within(g).getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["Light", "Dark", "Follow the system"]);
    fireEvent.click(within(g).getByRole("button", { name: "Follow the system" }));
    expect(within(g).getByRole("button", { name: "Follow the system" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(g).getByRole("button", { name: "Light" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("toggleTheme / initTheme / ThemeToggle", () => {
  it("toggleTheme flips data-theme, stores it, and initTheme restores it", () => {
    const st = mem();
    expect(toggleTheme(document, st)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(st.m.get("gilb-style:theme")).toBe("dark");
    expect(toggleTheme(document, st)).toBe("light");
    toggleTheme(document, st);
    document.documentElement.removeAttribute("data-theme");
    expect(initTheme(document, st)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
  it("without a stored choice initTheme uses the sheet's mode, and a dark sheet can switch to light", () => {
    const s = validSheet();
    s.mode = "dark";
    applyStyleSheet(s);
    const st = mem();
    expect(initTheme(document, st)).toBe("dark");
    expect(toCssText(validateStyleSheet(s).ok ? (s as never) : s)).toContain('[data-theme="light"]');
    expect(toggleTheme(document, st)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
  it("system mode follows prefers-color-scheme and sets no attribute until the user chooses", () => {
    const s = validSheet();
    s.mode = "system";
    applyStyleSheet(s);
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as never;
    try {
      expect(initTheme(document, mem())).toBe("dark");
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
      expect(toggleTheme(document, mem())).toBe("light");
    } finally {
      window.matchMedia = orig;
    }
  });
  it("survives a storage that throws", () => {
    const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(() => toggleTheme(document, bad)).not.toThrow();
    expect(initTheme(document, bad)).toBeTypeOf("string");
  });
  it("<ThemeToggle /> flips on click, persists, and restores on the next mount", () => {
    const st = mem();
    const first = render(<ThemeToggle storage={st} />);
    const btn = screen.getByRole("button", { name: "Light" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(st.m.get("gilb-style:theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
    first.unmount();
    document.documentElement.removeAttribute("data-theme");
    render(<ThemeToggle storage={st} />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" })).toBeTruthy();
  });
});

describe("font catalogue", () => {
  it("has 48 schema-safe open-licence fonts, each with a lazy loader", () => {
    expect(FONT_CATALOGUE.length).toBe(48);
    expect(new Set(FONT_CATALOGUE.map((f) => f.family)).size).toBe(48);
    for (const f of FONT_CATALOGUE) {
      expect(["OFL-1.1", "Apache-2.0"]).toContain(f.license);
      expect(FONT_LOADERS[f.family], f.family).toBeTypeOf("function");
      const s = validSheet();
      s.fonts.sans = { family: f.family, source: "bundled" };
      expect(validateStyleSheet(s).ok, f.family).toBe(true);
    }
    const count = (c: string) => FONT_CATALOGUE.filter((f) => f.category === c).length;
    expect([count("sans"), count("mono"), count("handwriting")]).toEqual([16, 6, 4]);
  });
  it("has 8 pairings made only of catalogue fonts", () => {
    expect(FONT_PAIRINGS.length).toBe(8);
    for (const p of FONT_PAIRINGS) for (const n of [p.heading, p.body, p.code]) expect(findFont(n), `${p.name}: ${n}`).toBeTruthy();
  });
  it("loads nothing for the default sheet, and a font only when asked", async () => {
    render(<StyleStudio />);
    expect(FONT_CATALOGUE.some((f) => isFontLoaded(f.family))).toBe(false);
    expect(document.head.querySelectorAll("link, style").length).toBe(0);
    await loadFontFamily("Caveat");
    expect(isFontLoaded("Caveat")).toBe(true);
    expect(isFontLoaded("Kalam")).toBe(false);
  });
});

describe("Fonts tab", () => {
  const rows = () => Array.from(document.querySelectorAll<HTMLElement>(".gs-fontrow"));
  it("searches, filters by category, and renders each row in its own font", () => {
    render(<StyleStudio />);
    fireEvent.click(tab("Fonts"));
    expect(rows().length).toBe(1 + 48); // Body slot, All: System Sans plus every catalogue font
    fireEvent.change(screen.getByLabelText("Search fonts"), { target: { value: "fraun" } });
    expect(rows().map((r) => r.dataset.font)).toEqual(["Fraunces"]);
    expect(rows()[0]!.style.fontFamily).toContain("Fraunces");
    fireEvent.change(screen.getByLabelText("Search fonts"), { target: { value: "" } });
    const g = screen.getByRole("group", { name: "Font category" });
    fireEvent.click(within(g).getByRole("button", { name: "Handwriting" }));
    expect(rows().map((r) => r.dataset.font)).toEqual(["Caveat", "Kalam", "Patrick Hand", "Shadows Into Light"]);
  });
  it("picks per slot: Body, Headings (any category), Code (mono only)", () => {
    render(<StyleStudio />);
    fireEvent.click(tab("Fonts"));
    const slots = screen.getByRole("group", { name: "Choose a font for" });
    fireEvent.click(within(slots).getByRole("button", { name: /Headings/ }));
    fireEvent.click(rows().find((r) => r.dataset.font === "Bebas Neue")!);
    expect(preview().style.getPropertyValue("--serif")).toMatch(/^"Bebas Neue"/);
    expect(preview().style.getPropertyValue("--gs-font-heading")).toMatch(/^"Bebas Neue"/);
    fireEvent.click(within(slots).getByRole("button", { name: /Code/ }));
    expect(rows().every((r) => findFont(r.dataset.font!)?.category === "mono" || r.dataset.font === "System Mono")).toBe(true);
    fireEvent.click(rows().find((r) => r.dataset.font === "Fira Code")!);
    expect(preview().style.getPropertyValue("--mono")).toMatch(/^"Fira Code"/);
    fireEvent.click(within(slots).getByRole("button", { name: /Body/ }));
    fireEvent.click(rows().find((r) => r.dataset.font === "Outfit")!);
    expect(preview().style.getPropertyValue("--sans")).toMatch(/^"Outfit"/);
  });
  it("a pairing sets all three slots; hovering a row loads its file", async () => {
    render(<StyleStudio />);
    fireEvent.click(tab("Fonts"));
    fireEvent.click(screen.getByRole("button", { name: "Apply pairing Editorial" }));
    const v = (n: string) => preview().style.getPropertyValue(n);
    expect([v("--serif"), v("--sans"), v("--mono")].map((x) => x.split(",")[0])).toEqual(['"Fraunces"', '"Inter"', '"JetBrains Mono"']);
    expect(rows().length).toBeGreaterThan(10);
    const row = rows().find((r) => r.dataset.font === "Syne")!;
    expect(isFontLoaded("Syne")).toBe(false);
    act(() => { fireEvent.mouseEnter(row); });
    await waitFor(() => expect(isFontLoaded("Syne")).toBe(true));
  });
  it("the preview headings use the heading font", async () => {
    const css = (await import("node:fs")).readFileSync("src/studio/studio.css", "utf8");
    for (const sel of [".gp-h1", ".gp-h2", ".gp-app"]) expect(css.split("\n").find((l) => l.includes(`${sel} {`))).toContain("var(--gs-font-heading");
  });
});
