import { describe, expect, test } from "vitest";
import { nextFocusIndex } from "./focusTrap";

const list = ["a", "b", "c"] as const;

describe("nextFocusIndex", () => {
  test("Tab moves forward and wraps from the last item to the first", () => {
    expect(nextFocusIndex(list, 0, false)).toBe(1);
    expect(nextFocusIndex(list, 1, false)).toBe(2);
    expect(nextFocusIndex(list, 2, false)).toBe(0);
  });

  test("Shift+Tab moves backward and wraps from the first item to the last", () => {
    expect(nextFocusIndex(list, 2, true)).toBe(1);
    expect(nextFocusIndex(list, 1, true)).toBe(0);
    expect(nextFocusIndex(list, 0, true)).toBe(2);
  });

  test("focus outside the list is pulled to the first item, with or without Shift", () => {
    expect(nextFocusIndex(list, -1, false)).toBe(0);
    expect(nextFocusIndex(list, -1, true)).toBe(0);
    expect(nextFocusIndex(list, 9, false)).toBe(0);
  });

  test("a single item stays on itself", () => {
    expect(nextFocusIndex(["only"], 0, false)).toBe(0);
    expect(nextFocusIndex(["only"], 0, true)).toBe(0);
  });

  test("an empty list has nowhere to go", () => {
    expect(nextFocusIndex([], 0, false)).toBe(-1);
    expect(nextFocusIndex([], -1, true)).toBe(-1);
  });
});
