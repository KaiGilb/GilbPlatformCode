import { describe, expect, it } from "vitest";
import { placeFieldKind } from "./placeFieldKind";

describe("placeFieldKind", () => {
  it("refuses both and neither, and does not trim", () => {
    expect(placeFieldKind("Road", "place-1")).toBeNull();
    expect(placeFieldKind("", null)).toBeNull();
    expect(placeFieldKind("", "place-1")).toBe("place");
    expect(placeFieldKind("Road", null)).toBe("street");
    expect(placeFieldKind(" ", null)).toBe("street");
    expect(placeFieldKind(" ", "place-1")).toBeNull();
    expect(placeFieldKind("", "")).toBe("place");
  });
});
