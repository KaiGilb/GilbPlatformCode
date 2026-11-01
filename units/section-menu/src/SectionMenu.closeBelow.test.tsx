// GilbApp C214-UI1 (Kai 2026-10-21): the button is the header's main control, and Close sits straight below it.
// Spec: C214-UI1 item 1 — the section button is the most prominent control: closed it is the accent outline and
// tint (Kai: "like this when it is not open"), open it is stronger, so the two can be told apart; aria-expanded
// and a visible focus ring.
// Spec: C214-UI1 item 2 — Close in the panel's top row, directly below the button, so one short move down closes
// it; Esc and the dimmed edge still close; focus returns to the button; one Close only.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CLOSE_MIN_WIDTH, HOVER_CLICK_GRACE_MS, HOVER_OPEN_DELAY_MS, SectionMenu } from "./SectionMenu";
import type { MenuSection } from "./menuList";

type Id = "notes" | "files";
interface Api { go(id: Id): void }
const SECTIONS: MenuSection<Id, Api>[] = [
  { id: "notes", icon: "records", label: "Notes", description: "N", go: (a) => a.go("notes"), options: [] },
  { id: "files", icon: "files", label: "Files", description: "F", go: (a) => a.go("files"), options: [] },
];

// jsdom has no PointerEvent; the shim the other files use, so `pointerType` reaches the handler.
if (typeof window.PointerEvent === "undefined") {
  class P extends MouseEvent { pointerType: string; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerType = i.pointerType ?? ""; } }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = P;
}

const trigger = () => screen.getByTestId("section-menu-trigger");
const panel = () => screen.getByTestId("section-menu-panel");
const closeBtn = () => screen.getByTestId("section-menu-close");
const isOpen = () => panel().getAttribute("data-open") === "true";
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

/** The boxes jsdom cannot lay out: the button, the panel's top row and the "Go to" heading. */
let boxes: { trigger: DOMRectInit; row: DOMRectInit; heading: DOMRectInit };
function rect(r: DOMRectInit): DOMRect {
  const { x = 0, y = 0, width = 0, height = 0 } = r;
  return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height, toJSON: () => ({}) } as DOMRect;
}
beforeEach(() => {
  boxes = { trigger: { x: 200, y: 4, width: 160, height: 48 }, row: { x: 48, y: 80, width: 1200, height: 48 }, heading: { x: 48, y: 92, width: 60, height: 20 } };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute("data-testid") === "section-menu-trigger") return rect(boxes.trigger);
    if (this.getAttribute("data-testid") === "section-menu-top-row") return rect(boxes.row);
    if (this.parentElement?.getAttribute("data-testid") === "section-menu-top-row" && this.tagName === "SPAN") return rect(boxes.heading);
    return rect({});
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderMenu() {
  return render(<SectionMenu sections={SECTIONS} current="notes" api={{ go: vi.fn() }} sizeClass="expanded" layers={{ scrim: 100, panel: 101 }} />);
}
async function openByClick() {
  await userEvent.click(trigger());
  await frame();
}
const px = (el: HTMLElement, prop: "left" | "width") => el.style[prop];
const heading = () => screen.getByTestId("section-menu-top-row").querySelector("span")!;

describe("Close sits straight below the section button", () => {
  test("its left edge is under the button's left edge and it is as wide as the button", async () => {
    renderMenu();
    await openByClick();
    // trigger.left 200 − row.left 48 = 152
    expect(px(closeBtn(), "left")).toBe("152px");
    expect(px(closeBtn(), "width")).toBe("160px");
    // "Go to" fits before it (60 + 16 <= 152), so it stays at the row's start.
    expect(heading().style.left).toBe("0px");
  });

  test("a narrow (icon-only) button still gets a Close of at least the minimum width", async () => {
    boxes.trigger = { x: 200, y: 4, width: 60, height: 48 };
    renderMenu();
    await openByClick();
    expect(px(closeBtn(), "width")).toBe(`${CLOSE_MIN_WIDTH}px`);
    expect(px(closeBtn(), "left")).toBe("152px");
  });

  test("it is kept inside the row: a button past the row's right edge, and one left of the row's start", async () => {
    boxes.trigger = { x: 1300, y: 4, width: 160, height: 48 };
    renderMenu();
    await openByClick();
    expect(px(closeBtn(), "left")).toBe(`${1200 - 160}px`);
    cleanup();
    boxes.trigger = { x: 10, y: 4, width: 160, height: 48 };
    renderMenu();
    await openByClick();
    expect(px(closeBtn(), "left")).toBe("0px");
  });

  test("when Close is at the row's start, \"Go to\" follows it instead of lying under it", async () => {
    boxes.trigger = { x: 60, y: 4, width: 160, height: 48 };
    renderMenu();
    await openByClick();
    expect(px(closeBtn(), "left")).toBe("12px");
    expect(heading().style.left).toBe(`${12 + 160 + 16}px`);
  });

  test("a resize while open places it again", async () => {
    renderMenu();
    await openByClick();
    expect(px(closeBtn(), "left")).toBe("152px");
    boxes.trigger = { x: 300, y: 4, width: 160, height: 48 };
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(px(closeBtn(), "left")).toBe("252px");
  });

  test("the panel has one Close only (no second one at the far right)", async () => {
    renderMenu();
    await openByClick();
    const named = Array.from(panel().querySelectorAll("button")).filter((b) => /close/i.test(b.textContent ?? ""));
    expect(named).toEqual([closeBtn()]);
    expect(closeBtn().className).not.toContain("ml-auto");
  });
});

describe("the menu opens by the button and closes by Close, Esc and the dimmed edge; focus returns", () => {
  test("Close", async () => {
    renderMenu();
    await openByClick();
    expect(isOpen()).toBe(true);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(closeBtn());
    expect(isOpen()).toBe(false);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());
  });

  test("Esc", async () => {
    renderMenu();
    await openByClick();
    await userEvent.keyboard("{Escape}");
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
  });

  test("the dimmed edge (a click outside the panel)", async () => {
    renderMenu();
    await openByClick();
    fireEvent.click(screen.getByTestId("section-menu-scrim"));
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
  });

  test("after a hover-open, Close closes at once (the click grace is the button's only)", async () => {
    const before = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes("hover: hover"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    renderMenu();
    fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
    await act(() => new Promise<void>((r) => setTimeout(r, HOVER_OPEN_DELAY_MS + 30)));
    expect(isOpen()).toBe(true);
    await frame();
    // Well inside the grace window that keeps a hover-open menu open on the button's own click.
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + HOVER_CLICK_GRACE_MS / 4);
    fireEvent.click(closeBtn());
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
    window.matchMedia = before;
  });
});

describe("the section button: the header's main control, closed and open told apart", () => {
  test("closed: the accent outline and tint, the icon in accent, the chevron pointing down", () => {
    renderMenu();
    const t = trigger();
    expect(t.getAttribute("data-state")).toBe("closed");
    expect(t.className).toContain("border-2");
    expect(t.className).toContain("border-[var(--accent)]");
    expect(t.className).toContain("bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]");
    expect(t.className).toContain("text-[var(--ink)]");
    expect(t.className).not.toContain("bg-[var(--accent)]");
    expect(screen.getByTestId("section-menu-trigger-icon").className).toContain("text-[var(--accent)]");
    expect(screen.getByTestId("section-menu-trigger-chevron").getAttribute("class")).not.toContain("rotate-180");
    // A hover is a stronger tint, so pointing at it answers.
    expect(t.className).toContain("hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)]");
  });

  test("open: the full accent with on-accent text, the chevron turned up", async () => {
    renderMenu();
    await openByClick();
    const t = trigger();
    expect(t.getAttribute("data-state")).toBe("open");
    expect(t.className).toContain("bg-[var(--accent)]");
    expect(t.className).toContain("text-[var(--on-accent)]");
    expect(screen.getByTestId("section-menu-trigger-icon").className).toContain("text-[var(--on-accent)]");
    expect(screen.getByTestId("section-menu-trigger-chevron").getAttribute("class")).toContain("rotate-180");
  });

  test("it is larger than a 44 px control and draws a visible keyboard focus ring", () => {
    renderMenu();
    const c = trigger().className;
    expect(c).toContain("h-12");
    expect(c).toContain("text-[16px]");
    expect(c).toContain("focus-visible:ring-[3px]");
    expect(c).toContain("focus-visible:ring-[var(--accent)]");
    expect(c).toContain("focus-visible:ring-offset-2");
  });
});
