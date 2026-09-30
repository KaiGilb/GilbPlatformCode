import { expect, test } from "vitest";
import { LAYER, pickerIsTop } from "./layers";

test("the picker is strictly above every other layer", () => {
  expect(pickerIsTop()).toBe(true);
  for (const [name, value] of Object.entries(LAYER)) {
    if (name === "picker") continue;
    expect(value).toBeLessThan(LAYER.picker);
  }
});

test("a photo dialog does not cover a menu opened from it", () => {
  expect(LAYER.picker).toBeGreaterThan(LAYER.dialog);
  expect(LAYER.picker).toBeGreaterThan(LAYER.sheet);
});
