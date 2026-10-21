// GilbApp C214-UI1 round 2 (Agent.Tester s131 D1): the open button's label reads at 4.5:1 or more on ANY accent a
// theme allows (GilbApp's Custom theme lets a person pick any accent), while the preset themes keep their look.
// Spec: C214-UI1 item 1 — "contrast ≥ 4.5:1 ... in every section and theme (Light, Dark, Custom)".
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { contrast, mixSrgb, OPEN_TEXT_MIN_CONTRAST, openColors, parseCssColor, type Rgb } from "./openColors";
import { SectionMenu } from "./SectionMenu";
import type { MenuSection } from "./menuList";

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// GilbApp's base themes (src/styles/tokens.css): ink and on-accent of Light, Dark and Colourblind.
const BASES = {
  light: { ink: hex("#2a2622"), onAccent: hex("#fbfaf6"), accent: hex("#a85c3b") },
  dark: { ink: hex("#e9e3da"), onAccent: hex("#191512"), accent: hex("#d68b5e") },
  cvd: { ink: hex("#20242a"), onAccent: hex("#ffffff"), accent: hex("#0072b2") },
} as const;
/** What the label is drawn on, given the choice. */
function fillOf(accent: Rgb, ink: Rgb, onAccent: Rgb) {
  const c = openColors(accent, ink, onAccent);
  const fill = c.mix > 0 ? mixSrgb(accent, c.mixToward === "ink" ? ink : onAccent, c.mix) : accent;
  return { c, ratio: contrast(fill, c.text === "ink" ? ink : onAccent) };
}

describe("openColors", () => {
  test("the preset themes keep their look: the bare accent with --on-accent (Kai: \"Yes exactly\")", () => {
    for (const [name, b] of Object.entries(BASES)) {
      const c = openColors(b.accent, b.ink, b.onAccent);
      expect({ name, text: c.text, mix: c.mix }).toEqual({ name, text: "on-accent", mix: 0 });
      expect(c.contrast).toBeGreaterThanOrEqual(OPEN_TEXT_MIN_CONTRAST);
    }
  });

  test("the Tester's two Custom accents on the Light base now read at 4.5:1 or more", () => {
    const { ink, onAccent } = BASES.light;
    const blue = fillOf(hex("#4f8fd6"), ink, onAccent); // was 3.23:1
    const yellow = fillOf(hex("#e8c547"), ink, onAccent); // was 1.61:1
    expect(blue.ratio).toBeGreaterThanOrEqual(4.5);
    expect(yellow.ratio).toBeGreaterThanOrEqual(4.5);
    expect(yellow.c.text).toBe("ink"); // a light accent takes the dark token
  });

  test("a sweep of 4,096 accents (16 steps per channel) on every base: the label is always 4.5:1 or more", () => {
    let worst = Infinity;
    const steps = Array.from({ length: 16 }, (_, i) => i * 17);
    for (const b of Object.values(BASES))
      for (const r of steps) for (const g of steps) for (const bl of steps) {
        const { ratio } = fillOf([r, g, bl], b.ink, b.onAccent);
        worst = Math.min(worst, ratio);
      }
    expect(worst).toBeGreaterThanOrEqual(OPEN_TEXT_MIN_CONTRAST);
  });

  test("a mid-tone accent where neither token reads deepens the fill toward the darker token, no further than needed", () => {
    const { ink, onAccent } = BASES.light;
    const c = openColors(hex("#4f8fd6"), ink, onAccent);
    expect(c.mix).toBeGreaterThan(0);
    expect(c.mixToward).toBe("ink");
    expect(c.text).toBe("on-accent");
    // one step less would not be enough
    expect(contrast(mixSrgb(hex("#4f8fd6"), ink, c.mix - 5), onAccent)).toBeLessThan(4.5);
  });

  test("parseCssColor reads rgb(), rgba() and color(srgb …), and refuses the rest", () => {
    expect(parseCssColor("rgb(168, 92, 59)")).toEqual([168, 92, 59]);
    expect(parseCssColor("rgba(1, 2, 3, 0.5)")).toEqual([1, 2, 3]);
    expect(parseCssColor("color(srgb 1 0.5 0)")).toEqual([255, 127.5, 0]);
    expect(parseCssColor("var(--accent)")).toBeNull();
    expect(parseCssColor("")).toBeNull();
  });
});

describe("the open button takes the chosen colours", () => {
  type Id = "notes";
  const S: MenuSection<Id, { go(id: Id): void }>[] = [{ id: "notes", icon: "records", label: "Notes", description: "N", go: (a) => a.go("notes"), options: [] }];
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  /** jsdom resolves no var(): give the probe the drawn colours of a Light base with this accent. */
  function drawnAccent(accent: string) {
    const real = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
      const cs = real(el, pseudo);
      if (el instanceof HTMLElement && el.hidden && el.closest("[data-testid='section-menu-trigger']")) {
        const [r, g, b] = hex(accent);
        return { ...cs, color: "rgb(42, 38, 34)", backgroundColor: "rgb(251, 250, 246)", borderTopColor: `rgb(${r}, ${g}, ${b})` } as CSSStyleDeclaration;
      }
      return cs;
    });
  }
  const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
  async function openMenu() {
    render(<SectionMenu sections={S} current="notes" api={{ go: vi.fn() }} sizeClass="expanded" layers={{ scrim: 1, panel: 2 }} />);
    await userEvent.click(screen.getByTestId("section-menu-trigger"));
    await frame();
    return screen.getByTestId("section-menu-trigger");
  }

  test("the preset accent: --on-accent on the bare accent, as Kai approved", async () => {
    drawnAccent("#a85c3b");
    const t = await openMenu();
    expect(t.getAttribute("data-open-text")).toBe("on-accent");
    expect(t.className).toContain("text-[var(--on-accent)]");
    expect(t.style.backgroundColor).toBe("");
  });

  test("a pale Custom accent: the label, icon and chevron take --ink", async () => {
    drawnAccent("#e8c547");
    const t = await openMenu();
    expect(t.getAttribute("data-open-text")).toBe("ink");
    expect(t.className).toContain("text-[var(--ink)]");
    expect(screen.getByTestId("section-menu-trigger-icon").className).toContain("text-[var(--ink)]");
    expect(screen.getByTestId("section-menu-trigger-chevron").getAttribute("class")).toContain("text-[var(--ink)]");
  });

  test("a mid-tone Custom accent: the fill is the accent mixed toward --ink, in tokens", async () => {
    drawnAccent("#4f8fd6");
    const t = await openMenu();
    expect(t.getAttribute("data-open-text")).toBe("on-accent");
    expect(t.getAttribute("style")).toMatch(/color-mix\(in srgb, var\(--accent\) \d+%, var\(--ink\) \d+%\)/);
  });

  test("the phone button keeps 0.1.0's width: tighter padding and gap below sm, the desktop look from sm", () => {
    render(<SectionMenu sections={S} current="notes" api={{ go: vi.fn() }} sizeClass="compact" layers={{ scrim: 1, panel: 2 }} />);
    const c = screen.getByTestId("section-menu-trigger").className;
    for (const k of ["pl-2", "pr-1.5", "gap-1.5", "sm:pl-3", "sm:pr-2.5", "sm:gap-2.5"]) expect(c.split(/\s+/)).toContain(k);
  });
});
