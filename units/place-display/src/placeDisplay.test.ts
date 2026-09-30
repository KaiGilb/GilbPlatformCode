import { describe, expect, it } from "vitest";
import { RUNG_HEADING, placeDisplayFor } from "./placeDisplay";

describe("placeDisplayFor", () => {
  it("keeps the caller's heading and the raw value when nothing is resolved", () => {
    expect(placeDisplayFor("https://geo.example.test/base/e/1", "Place", null)).toEqual({
      heading: "Place",
      text: "https://geo.example.test/base/e/1",
      resolved: false,
    });
    expect(placeDisplayFor("raw", "Place", undefined).resolved).toBe(false);
  });

  it("uses the rung heading and the trimmed label", () => {
    expect(
      placeDisplayFor("raw", "Place", { label: "  Oslo  ", rung: "city" }),
    ).toEqual({ heading: "City", text: "Oslo", resolved: true });
    expect(placeDisplayFor("raw", "Place", { label: "Norge", rung: "country" }).heading).toBe(
      "Country",
    );
    expect(RUNG_HEADING.region).toBe("Region/State");
  });

  it("keeps the caller's heading when the rung is unknown, and still counts as resolved", () => {
    expect(placeDisplayFor("raw", "Place", { label: "Somewhere", rung: null })).toEqual({
      heading: "Place",
      text: "Somewhere",
      resolved: true,
    });
  });

  it("falls back to the raw value when the label trims to empty, and does not trim the value", () => {
    expect(placeDisplayFor("  raw  ", "Place", { label: "   ", rung: "region" })).toEqual({
      heading: "Region/State",
      text: "  raw  ",
      resolved: true,
    });
  });

  it("does not replace an empty unresolved heading", () => {
    expect(placeDisplayFor("raw", "", null).heading).toBe("");
  });
});
