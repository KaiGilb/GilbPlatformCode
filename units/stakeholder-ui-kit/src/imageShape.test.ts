// The image shape rule: people/contacts as circles, everything else as squares, decided by the type in the data, never by a name.
import { describe, expect, test } from "vitest";
import { imageShapeOf } from "./index";

describe("imageShapeOf", () => {
  test("a person type is a circle, in each spelling a record carries", () => {
    expect(imageShapeOf("t:Person")).toBe("circle");
    expect(imageShapeOf("Person")).toBe("circle");
    expect(imageShapeOf("https://example.test/base/t/Person")).toBe("circle");
  });

  test("everything else is a rounded square", () => {
    for (const t of ["t:Organization", "t:Project", "t:Company", "t:System", "t:PersonaNote", "https://example.test/base/t/Organization"]) {
      expect(imageShapeOf(t)).toBe("rounded-square");
    }
  });

  test("an unknown or missing type is a rounded square (it claims no person)", () => {
    expect(imageShapeOf(null)).toBe("rounded-square");
    expect(imageShapeOf(undefined)).toBe("rounded-square");
    expect(imageShapeOf("")).toBe("rounded-square");
  });

  test("a name that looks like a person is not a type", () => {
    expect(imageShapeOf("Tom Gilb")).toBe("rounded-square");
    expect(imageShapeOf("person")).toBe("rounded-square");
  });
});
