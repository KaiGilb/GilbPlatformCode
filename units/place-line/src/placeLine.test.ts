import { describe, expect, it } from "vitest";
import { placeLine } from "./placeLine";

describe("placeLine", () => {
  it("joins with a middle dot and keeps order, blanks, and spaces", () => {
    expect(placeLine([{ label: "Oslo" }, { label: "Norway" }])).toBe("Oslo \u00b7 Norway");
    expect(placeLine([{ label: "" }, { label: "Oslo" }])).toBe(" \u00b7 Oslo");
    expect(placeLine([{ label: "  Oslo  " }])).toBe("  Oslo  ");
  });

  it("is empty for no places, and has no dot for one place", () => {
    expect(placeLine([])).toBe("");
    expect(placeLine([{ label: "Oslo" }])).toBe("Oslo");
    expect(placeLine([{ label: "Oslo" }]).includes("\u00b7")).toBe(false);
  });
});
