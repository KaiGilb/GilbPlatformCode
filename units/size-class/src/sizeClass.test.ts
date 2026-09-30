import { expect, test } from "vitest";
import { sizeClassFor } from "./sizeClass";

test("the three widths", () => {
  expect(sizeClassFor(599)).toBe("compact");
  expect(sizeClassFor(600)).toBe("medium");
  expect(sizeClassFor(839)).toBe("medium");
  expect(sizeClassFor(840)).toBe("expanded");
});
