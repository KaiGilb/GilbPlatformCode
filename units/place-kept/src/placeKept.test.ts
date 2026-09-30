import { describe, expect, it } from "vitest";
import { factsSurvived } from "./placeKept";

describe("factsSurvived", () => {
  it("trims label and street, and compares place ids as a set", () => {
    expect(
      factsSurvived(
        { label: " Home ", streetLine: "  ", placeIds: ["city", "country"] },
        { label: "Home", streetLine: "", placeIds: ["country", "city", "city"] },
      ),
    ).toBe(true);
    expect(
      factsSurvived(
        { label: "Home", streetLine: "Main", placeIds: ["a"] },
        { label: "Home", streetLine: "Main", placeIds: [" a "] },
      ),
    ).toBe(false);
    expect(
      factsSurvived(
        { label: "Home", streetLine: "", placeIds: ["a"] },
        { label: "Home", streetLine: "Main", placeIds: ["a"] },
      ),
    ).toBe(false);
  });
});
