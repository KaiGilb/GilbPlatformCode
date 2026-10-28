// What the graph needs besides the lines' mount: a PointerEvent for jsdom, a size for the drawing, and a few builders.
import { fireEvent } from "@testing-library/react";
import { setLevelKey, type ValueCardData, type ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { card, level } from "./mount";

// jsdom has no PointerEvent: a pointer event is a MouseEvent that carries the pointer's fields.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "";
      this.isPrimary = init.isPrimary ?? false;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventStub;
}

export const RECT = { left: 0, top: 0, right: 640, bottom: 320, width: 640, height: 320, x: 0, y: 0, toJSON: () => ({}) };
export const slider = (c: Element, i: number) => c.querySelector(`[role=slider][data-level="${i}"]`)!;
export const sliders = () => [...document.querySelectorAll<HTMLElement>("[role=slider]")];
export const goalSlider = () => sliders().find((s) => s.getAttribute("aria-label")?.startsWith("Goal"))!;

export const keyed = (l: ValueLevel, key: string): ValueLevel => setLevelKey({ ...l, qualifier: { ...l.qualifier } }, key);

/** A Value that reads 'lower is better' with a Status and a Goal on one row. */
export const lowered = (more: Partial<ValueCardData> = {}): ValueCardData =>
  card({
    scale: { text: "", unit: "min", rate: "", context: "", direction: "lower", source: {} },
    levels: [level("Status", 9, { when: "2026-10-27" }), level("Goal", 5, { when: "2027-06-30" })],
    ...more,
  });

/** Press a marker and let go without moving: that opens its popover. */
export function openMarker(container: Element, i: number) {
  container.querySelector("svg")!.getBoundingClientRect = () => RECT;
  fireEvent.pointerDown(slider(container, i), { clientX: 100, clientY: 40, pointerId: 1 });
  fireEvent.pointerUp(slider(container, i), { clientX: 100, clientY: 40, pointerId: 1 });
}
