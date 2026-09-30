import { expect, test } from "vitest";
import { dragWidth, keyWidth } from "./paneMath";

test("dragging right grows the left pane and shrinks the right pane", () => {
  expect(dragWidth("left", 200, 40)).toBe(240);
  expect(dragWidth("right", 200, 40)).toBe(160);
});

test("the keyboard steps by 12, or 32 with shift", () => {
  expect(keyWidth("left", 200, "ArrowRight", false)).toBe(212);
  expect(keyWidth("right", 200, "ArrowRight", true)).toBe(168);
});
