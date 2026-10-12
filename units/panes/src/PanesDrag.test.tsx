// @vitest-environment jsdom
// The drag: it follows the pointer, and every way a drag can end removes its window listeners.
import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Panes, type PaneLayout } from "./Panes";

afterEach(cleanup);

function setup() {
  const widths: number[] = [];
  const layout: PaneLayout = {
    leftW: 300,
    rightW: 376,
    leftCollapsed: false,
    rightCollapsed: false,
    setLeftW: (w) => widths.push(w),
    setRightW: () => {},
  };
  const view = render(<Panes layout={layout} left="L" center="C" right="R" />);
  const divider = screen.getByRole("separator", { name: "Resize selection panel" });
  return { widths, divider, view };
}

// jsdom has no PointerEvent, so pointer events are sent as MouseEvents carrying clientX.
const down = (el: Element, x: number) => fireEvent(el, new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: x }));
const move = (x: number) => window.dispatchEvent(new MouseEvent("pointermove", { clientX: x }));

test("a drag follows the pointer until pointerup, then stops", () => {
  const { widths, divider } = setup();
  down(divider, 100);
  move(140);
  expect(widths).toEqual([340]);
  window.dispatchEvent(new Event("pointerup"));
  move(200);
  expect(widths).toEqual([340]);
});

test("pointercancel ends the drag too", () => {
  const { widths, divider } = setup();
  down(divider, 100);
  window.dispatchEvent(new Event("pointercancel"));
  move(140);
  expect(widths).toEqual([]);
});

test("unmounting mid-drag removes the window listeners", () => {
  const { widths, divider, view } = setup();
  down(divider, 100);
  view.unmount();
  move(140);
  expect(widths).toEqual([]);
});

test("the dividers do not let a touch drag scroll the page", () => {
  setup();
  for (const d of screen.getAllByRole("separator")) expect(d.style.touchAction).toBe("none");
});
