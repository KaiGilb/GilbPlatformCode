import { describe, expect, it } from "vitest";
import { facetErrorText } from "./facetErrors";

describe("facetErrorText", () => {
  it("joins the three fields in order and drops blanks", () => {
    expect(facetErrorText({ nameError: "name", skillError: "", placeError: "place" })).toBe(
      "name \u00b7 place",
    );
    expect(facetErrorText({ skillError: "skill" })).toBe("skill");
    expect(facetErrorText({ nameError: null, placeError: "" })).toBeNull();
    expect(facetErrorText({ placeError: " " })).toBe(" ");
  });

  it("does not read a catalogue-absent flag", () => {
    expect(
      facetErrorText({ nameError: null, placePlaneAbsent: true } as { nameError: null }),
    ).toBeNull();
  });
});
