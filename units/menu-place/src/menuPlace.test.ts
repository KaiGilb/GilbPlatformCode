import { expect, test } from "vitest";
import { placeMenu } from "./menuPlace";

const band = { top: 8, bottom: 800, width: 400 };
const anchor = { left: 300, right: 360, top: 100, bottom: 132 };

test("a short menu opens below the anchor", () => {
  const placed = placeMenu({ anchor, menuHeight: 180, band });
  expect(placed.top).toBe(138);
  expect(placed.maxHeight).toBe(180);
});

test("a menu that does not fit below opens above", () => {
  const low = { ...anchor, top: 700, bottom: 732 };
  const placed = placeMenu({ anchor: low, menuHeight: 180, band });
  expect(placed.top).toBe(700 - 6 - 180);
});

test("a menu taller than the band is clamped", () => {
  const placed = placeMenu({ anchor, menuHeight: 5000, band });
  expect(placed.maxHeight).toBe(band.bottom - band.top);
});
