import { expect, test } from "vitest";
import { flowToScreen, nodeFlowBounds, nodeFlowCenter, panDelta } from "./graphPoint";

test("the centre uses the measured size, then the stated size, then the fallback", () => {
  expect(nodeFlowCenter({ position: { x: 10, y: 20 }, measured: { width: 40, height: 10 } })).toEqual({
    x: 30,
    y: 25,
  });
  expect(nodeFlowBounds({ position: { x: 0, y: 0 } })).toEqual({ x: 0, y: 0, width: 160, height: 48 });
});

test("pan distance ignores zoom, and a flow point lands on the pane", () => {
  expect(panDelta({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  expect(flowToScreen({ x: 10, y: 2 }, { x: 5, y: 7, zoom: 2 })).toEqual({ x: 25, y: 11 });
});
