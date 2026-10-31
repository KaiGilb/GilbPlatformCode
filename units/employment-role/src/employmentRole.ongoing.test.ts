// Ported from GilbApp `employmentRole.ongoing.c214.test.ts`, 3 cases, unchanged. (The unit's own earlier test of the two-state file is replaced by these: it pinned a different rule.)
import { describe, expect, it } from "vitest";
import { readRole, roleWire, type RoleAttrs } from "./employmentRole";

const attrs: RoleAttrs = {
  startDate: "a:startDate",
  endDate: "a:endDate",
  ongoing: "a:ongoing",
  workLocation: "a:workLocation",
};

const oslo = "https://geo.gilb.com/base/e/osm-r-2775550";

describe("employment role ongoing, three states", () => {
  it("readRole keeps unsaid, current, ended, and a contradicted end apart", () => {
    const read = (ongoing: unknown, end: unknown) =>
      readRole({ start: "", end, ongoing, place: undefined }, "https://geo.gilb.com").current;
    expect(read(undefined, "")).toBe(null);
    expect(read(true, "")).toBe(true);
    expect(read(false, "")).toBe(false);
    expect(read(true, "2024-05")).toBe(false);
  });

  it("a place edit that never said current does not write ongoing", () => {
    const wire = roleWire(
      { start: "2019-03", end: "", current: null, placeId: oslo },
      attrs,
    );
    expect(wire.set).not.toHaveProperty("a:ongoing");
    expect(wire.clear).not.toContain("a:ongoing");
    expect(wire.set["a:workLocation"]).toEqual({ "@id": oslo });
  });

  it("true, false, and an end still write ongoing the way they did", () => {
    const current = roleWire(
      { start: "2019-03", end: "", current: true, placeId: oslo },
      attrs,
    );
    expect(current.set).toEqual({
      "a:startDate": "2019-03",
      "a:ongoing": true,
      "a:workLocation": { "@id": oslo },
    });
    expect(current.clear).toEqual(["a:endDate"]);

    const ended = roleWire(
      { start: "2011", end: "", current: false, placeId: "base:e/osm-r-1" },
      attrs,
    );
    expect(ended.set).toMatchObject({ "a:startDate": "2011", "a:ongoing": false });
    expect(ended.clear).toEqual(expect.arrayContaining(["a:endDate", "a:workLocation"]));

    const closed = roleWire(
      { start: "2019-03", end: "2023-06", current: true, placeId: "" },
      attrs,
    );
    expect(closed.set["a:endDate"]).toBe("2023-06");
    expect(closed.set["a:ongoing"]).toBeUndefined();
    expect(closed.clear).toContain("a:ongoing");
    expect(closed.clear).toContain("a:workLocation");
  });
});
