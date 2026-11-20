// 0.2.7: each column scrolls by itself (wider than a phone), and on opening the sections' area is moved just
// enough to show the section you are in. Measured before the fix (GilbApp scripts/measure-section-menu.mjs,
// WebKit and Chromium, 2026-11-20): at an imitated Safari page zoom of 150, 175 and 200 % on a 1512 x 945 window,
// the current section (Standards) lay below the panel's visible area on opening.
// Spec: Rule_Code_default-menu RuleDefmenuSectionMenu — "A header button shows where you are. A large panel opens
// ... with the main sections on the left and the hovered section's options on the right ... On a phone it is one column."
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SectionMenu, revealInSectionsArea, type SectionMenuProps } from "./SectionMenu";
import { placesFor, visibleSections, type MenuOption, type MenuSection } from "./menuList";

type Id = "home" | "notes" | "files" | "admin";
interface Api { go(id: Id): void }

const SECTIONS: MenuSection<Id, Api>[] = (["home", "notes", "files", "admin"] as const).map((id) => ({
  id,
  icon: "records",
  label: id[0]!.toUpperCase() + id.slice(1),
  description: `The ${id} section.`,
  go: (a: Api) => a.go(id),
  options: [{ id: `${id}.one`, icon: "plus", label: "One", description: "An option.", run: (a: Api) => a.go(id) }],
  also: ["help"],
}));
const PLACES: MenuOption<Api>[] = [{ id: "help", icon: "help", label: "Help", description: "Ask.", run: (a) => a.go("home") }];

function renderMenu(over: Partial<SectionMenuProps<Id, Api>> = {}) {
  const props: SectionMenuProps<Id, Api> = {
    sections: visibleSections(SECTIONS, {}),
    current: "admin",
    api: { go: vi.fn() },
    sizeClass: "expanded",
    places: (s) => placesFor(s, PLACES),
    layers: { scrim: 100, panel: 101 },
    ...over,
  };
  return render(<SectionMenu {...props} />);
}

const panel = () => screen.getByTestId("section-menu-panel");
const row = (id: Id) => panel().querySelector<HTMLElement>(`[data-section="${id}"]`)!;
const sectionsArea = () => panel().querySelector<HTMLElement>("[data-sections-scroll]")!;
/** Lets the open effect's requestAnimationFrame run. */
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

/** Gives `el` a layout (jsdom has none) and a scrollTop that records every write. */
function lay(el: HTMLElement, top: number, bottom: number) {
  el.getBoundingClientRect = () => rect(top, bottom);
}
function scrollable(el: HTMLElement, start = 0) {
  let value = start;
  const writes: number[] = [];
  Object.defineProperty(el, "scrollTop", { configurable: true, get: () => value, set: (v: number) => { value = v; writes.push(v); } });
  return { writes, get value() { return value; } };
}

let scrollTo: ReturnType<typeof vi.fn>;
let scrollIntoView: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollTo = vi.fn();
  scrollIntoView = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SectionMenu 0.2.7: scroll areas", () => {
  describe("columns", () => {
    test("wide: the sections, the options and the third column are three separate scroll areas in one row", () => {
      renderMenu();
      const left = sectionsArea();
      const here = screen.getByTestId("section-menu-here");
      const third = screen.getByTestId("section-menu-places").parentElement!;
      const grid = left.parentElement!;
      expect(left.contains(screen.getByTestId("section-menu-sections"))).toBe(true);
      for (const col of [left, here, third]) expect(col.className).toContain("overflow-y-auto");
      expect(new Set([left, here, third]).size).toBe(3);
      expect(left.contains(here)).toBe(false);
      expect(grid.className).toContain("grid-rows-[minmax(0,1fr)]");
      expect(grid.className).not.toContain("overflow-auto");
    });

    test("medium: the sections scroll on the left; the options and the third column share one right-hand scroll column", () => {
      renderMenu({ sizeClass: "medium" });
      const left = sectionsArea();
      const right = screen.getByTestId("section-menu-here").parentElement!;
      expect(right.className).toContain("overflow-y-auto");
      expect(right.contains(screen.getByTestId("section-menu-places"))).toBe(true);
      expect(left.className).toContain("overflow-y-auto");
      expect(left.className).not.toContain("row-span-2");
      expect(left.parentElement).toBe(right.parentElement);
      expect(left.parentElement!.className).toContain("grid-cols-2");
    });

    test("phone: still one column that scrolls as one", () => {
      renderMenu({ sizeClass: "compact" });
      const area = sectionsArea();
      expect(area.className).toContain("grid-cols-1");
      expect(area.className).toContain("overflow-auto");
      expect(area.contains(screen.getByTestId("section-menu-here"))).toBe(true);
      expect(panel().querySelectorAll(".overflow-y-auto").length).toBe(0);
    });
  });

  describe("on opening, the section you are in is shown", () => {
    test("below the visible area: only the sections' area scrolls down to it; the page does not move", async () => {
      renderMenu();
      const area = sectionsArea();
      lay(area, 100, 300);
      lay(row("admin"), 500, 560);
      const top = scrollable(area);
      fireEvent.click(screen.getByTestId("section-menu-trigger"));
      await frame();
      expect(top.value).toBe(260);
      expect(document.activeElement).toBe(row("admin"));
      expect(scrollTo).not.toHaveBeenCalled();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    test("above the visible area: it scrolls up to it", async () => {
      renderMenu();
      const area = sectionsArea();
      lay(area, 100, 300);
      lay(row("admin"), 40, 90);
      const top = scrollable(area, 200);
      fireEvent.click(screen.getByTestId("section-menu-trigger"));
      await frame();
      expect(top.value).toBe(140);
    });

    test("already visible: nothing scrolls", async () => {
      renderMenu();
      const area = sectionsArea();
      lay(area, 100, 300);
      lay(row("admin"), 150, 200);
      const top = scrollable(area, 30);
      fireEvent.click(screen.getByTestId("section-menu-trigger"));
      await frame();
      expect(top.writes).toEqual([]);
    });

    test("on a phone the one scroll area is moved the same way", async () => {
      renderMenu({ sizeClass: "compact" });
      const area = sectionsArea();
      lay(area, 100, 300);
      lay(row("admin"), 500, 560);
      const top = scrollable(area);
      fireEvent.click(screen.getByTestId("section-menu-trigger"));
      await frame();
      expect(top.value).toBe(260);
      expect(scrollTo).not.toHaveBeenCalled();
    });

    test("every opening reveals it again, after the area was scrolled away while open", async () => {
      renderMenu();
      const area = sectionsArea();
      lay(area, 100, 300);
      lay(row("admin"), 500, 560);
      const top = scrollable(area);
      fireEvent.click(screen.getByTestId("section-menu-trigger"));
      await frame();
      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(screen.getByTestId("section-menu-trigger"));
      await frame();
      expect(top.writes).toEqual([260, 520]);
    });
  });

  describe("revealInSectionsArea", () => {
    test("a row taller than the area shows from its top", () => {
      const area = document.createElement("div");
      area.setAttribute("data-sections-scroll", "");
      const r = document.createElement("button");
      area.appendChild(r);
      lay(area, 100, 200);
      lay(r, 400, 650);
      const top = scrollable(area);
      revealInSectionsArea(r);
      expect(top.value).toBe(300);
    });

    test("does nothing outside a sections area", () => {
      const r = document.createElement("button");
      lay(r, 400, 650);
      expect(() => revealInSectionsArea(r)).not.toThrow();
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });

  test.each(SECTIONS.map((s) => s.id))("current = %s: that section is drawn as the one you are in and gets the focus", async (id) => {
    renderMenu({ current: id });
    const current = panel().querySelectorAll("[data-current='true']");
    expect(current).toHaveLength(1);
    expect(current[0]!.getAttribute("data-section")).toBe(id);
    expect(current[0]!.getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByTestId("section-menu-trigger"));
    await frame();
    expect(document.activeElement).toBe(row(id));
  });
});
