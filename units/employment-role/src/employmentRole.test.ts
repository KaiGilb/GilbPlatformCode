import { describe, expect, it } from "vitest";
import { fullPlaceIri, readRole, roleMonth, roleWire } from "./employmentRole";

const attrs = {
  startDate: "a:startDate",
  endDate: "a:endDate",
  ongoing: "a:ongoing",
  workLocation: "a:workLocation",
};

const oslo = "https://example.test/base/e/osm-r-2775550";

describe("roleMonth", () => {
  it("keeps a year or a zero-padded month, and rejects a full date", () => {
    expect(roleMonth("2011")).toBe("2011");
    expect(roleMonth("2019-03")).toBe("2019-03");
    expect(roleMonth("2019-3")).toBe("");
    expect(roleMonth("2019-03-01")).toBe("");
    expect(roleMonth("2019-13")).toBe("");
    expect(roleMonth(2019)).toBe("");
  });
});

describe("roleWire", () => {
  it("a current role writes ongoing and clears the end", () => {
    const wire = roleWire({ start: "2019-03", end: "", current: true, placeId: oslo }, attrs);
    expect(wire.set).toEqual({
      "a:startDate": "2019-03",
      "a:ongoing": true,
      "a:workLocation": { "@id": oslo },
    });
    expect(wire.clear).toEqual(["a:endDate"]);
  });

  it("an end date is never written together with ongoing true", () => {
    const wire = roleWire({ start: "2019-03", end: "2023-06", current: true, placeId: "" }, attrs);
    expect(wire.set["a:endDate"]).toBe("2023-06");
    expect(wire.set["a:ongoing"]).toBeUndefined();
    expect(wire.clear).toContain("a:ongoing");
    expect(wire.clear).toContain("a:workLocation");
  });

  it("does not expand a compact place on the write", () => {
    const wire = roleWire(
      { start: "2011", end: "", current: false, placeId: "base:e/osm-r-1" },
      attrs,
    );
    expect(wire.set).toMatchObject({ "a:startDate": "2011", "a:ongoing": false });
    expect(wire.clear).toEqual(expect.arrayContaining(["a:endDate", "a:workLocation"]));
  });
});

describe("readRole", () => {
  it("only boolean ongoing true, and only with no readable end, means current", () => {
    expect(
      readRole({ start: "2019-03", end: undefined, ongoing: true, place: { "@id": oslo } }, "https://example.test")
        .current,
    ).toBe(true);
    expect(
      readRole({ start: "2019-03", end: undefined, ongoing: "true", place: undefined }, "https://example.test")
        .current,
    ).toBe(false);
  });

  it("ongoing true with an end is not current, and a compact place expands", () => {
    const role = readRole(
      { start: "2019-03", end: "2023-06", ongoing: true, place: "base:e/osm-r-2775550" },
      "https://example.test/",
    );
    expect(role.current).toBe(false);
    expect(role.end).toBe("2023-06");
    expect(role.placeId).toBe(oslo);
  });

  it("refuses a bare place name", () => {
    expect(fullPlaceIri("Oslo", "https://example.test")).toBe("");
    expect(fullPlaceIri(" https://example.test/base/e/x", "https://example.test")).toBe("");
  });
});
