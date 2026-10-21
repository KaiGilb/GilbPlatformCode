// Agent.Tester s131 (C214-UI1 QA, 2026-10-22): gap found by mutant S7 (the placement not redone when the section's
// name changes while the menu is open). Harness copied from SectionMenu.closeBelow.test.tsx.
// Spec: C214-UI1 item 1 — the section button is the most prominent control: closed it is the accent outline and
// tint (Kai: "like this when it is not open"), open it is stronger, so the two can be told apart; aria-expanded
// and a visible focus ring.
// Spec: C214-UI1 item 2 — Close in the panel's top row, directly below the button, so one short move down closes
// it; Esc and the dimmed edge still close; focus returns to the button; one Close only.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CLOSE_MIN_WIDTH, HOVER_CLICK_GRACE_MS, SectionMenu } from "./SectionMenu";
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

describe("s131: Close follows the button when the section changes while the menu is open", () => {
  // Spec: C214-UI1 item 2 — Close stays straight below the button and at least as wide as it; the button's width
  // follows the section's name, so a new section while open (the host's openAt, or a route change) must re-place Close.
  test("a longer section name while open widens Close to the new button width", async () => {
    const api = { go: vi.fn() };
    const { rerender } = render(<SectionMenu sections={SECTIONS} current="notes" api={api} sizeClass="expanded" layers={{ scrim: 100, panel: 101 }} />);
    await openByClick();
    expect(px(closeBtn(), "width")).toBe("160px");
    boxes.trigger = { x: 200, y: 4, width: 230, height: 48 };
    rerender(<SectionMenu sections={SECTIONS} current="files" api={api} sizeClass="expanded" layers={{ scrim: 100, panel: 101 }} />);
    await frame();
    expect(isOpen()).toBe(true);
    expect(px(closeBtn(), "width")).toBe("230px");
    expect(px(closeBtn(), "left")).toBe("152px");
  });
});
