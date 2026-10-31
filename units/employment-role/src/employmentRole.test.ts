// Ported from GilbApp `employmentRole.test.ts`, 6 cases, unchanged. (The unit's own earlier test of the two-state file is replaced by these: it pinned a different rule.)
import { describe, expect, it } from "vitest";
import { fullPlaceIri, readRole, roleWire, type RoleAttrs } from "./employmentRole";

const attrs: RoleAttrs = {
  startDate: "a:startDate",
  endDate: "a:endDate",
  ongoing: "a:ongoing",
  workLocation: "a:workLocation",
};

const oslo = "https://geo.gilb.com/base/e/osm-r-2775550";

describe("employment role wire", () => {
  it("a current role writes ongoing and no end", () => {
    const wire = roleWire(
      { start: "2019-03", end: "", current: true, placeId: oslo },
      attrs,
    );
    expect(wire.set).toEqual({
      "a:startDate": "2019-03",
      "a:ongoing": true,
      "a:workLocation": { "@id": oslo },
    });
    expect(wire.clear).toEqual(["a:endDate"]);
  });

  it("an end date is never written together with ongoing true", () => {
    const wire = roleWire(
      { start: "2019-03", end: "2023-06", current: true, placeId: "" },
      attrs,
    );
    expect(wire.set["a:endDate"]).toBe("2023-06");
    expect(wire.set["a:ongoing"]).toBeUndefined();
    expect(wire.clear).toContain("a:ongoing");
    expect(wire.clear).toContain("a:workLocation");
  });

  it("an unknown end is ongoing false, not current", () => {
    const wire = roleWire(
      { start: "2011", end: "", current: false, placeId: "base:e/osm-r-1" },
      attrs,
    );
    expect(wire.set).toMatchObject({ "a:startDate": "2011", "a:ongoing": false });
    expect(wire.clear).toEqual(expect.arrayContaining(["a:endDate", "a:workLocation"]));
  });
});

describe("employment role read", () => {
  it("only ongoing true means current; absent is not said", () => {
    expect(
      readRole({ start: "2019-03", end: undefined, ongoing: true, place: { "@id": oslo } }, "https://geo.gilb.com")
        .current,
    ).toBe(true);
    expect(
      readRole({ start: "2019-03", end: undefined, ongoing: undefined, place: undefined }, "https://geo.gilb.com")
        .current,
    ).toBe(null);
  });

  it("ongoing true with an end is not current", () => {
    const role = readRole(
      { start: "2019-03", end: "2023-06", ongoing: true, place: "base:e/osm-r-2775550" },
      "https://geo.gilb.com",
    );
    expect(role.current).toBe(false);
    expect(role.end).toBe("2023-06");
    expect(role.placeId).toBe(oslo);
  });

  it("expands a compact place id and refuses a bare name", () => {
    expect(fullPlaceIri("base:e/osm-r-2775550", "https://geo.gilb.com")).toBe(oslo);
    expect(fullPlaceIri("Oslo", "https://geo.gilb.com")).toBe("");
  });
});
