import { describe, expect, it } from "vitest";
import {
  boundPlaceIds,
  claimPlaceIds,
  claimStreetLine,
  isDecomposed,
  needsFieldMigration,
} from "./placeLines";

const empty = { streetLine: "", memberOf: [] as string[], fields: [] as const };

describe("boundPlaceIds", () => {
  it("keeps country, then region, then city, and drops blank and non-strings", () => {
    expect(
      boundPlaceIds({
        country: { id: "c" },
        region: { id: "" },
        city: { id: "city" },
      }),
    ).toEqual(["c", "city"]);
    expect(boundPlaceIds({ country: { id: "  " }, region: null, city: { id: 4 } })).toEqual(["  "]);
    expect(boundPlaceIds({})).toEqual([]);
  });
});

describe("claimStreetLine", () => {
  it("lets a blank street field win over the composite", () => {
    expect(
      claimStreetLine({
        ...empty,
        streetLine: "composite",
        fields: [
          { subject: "Street", streetLine: "no", placeId: null },
          { subject: "street", streetLine: "", placeId: null },
        ],
      }),
    ).toBe("");
    expect(claimStreetLine({ ...empty, streetLine: "composite" })).toBe("composite");
  });
});

describe("claimPlaceIds", () => {
  it("uses place fields when any id is present, and otherwise copies memberOf", () => {
    const memberOf = ["legacy"];
    expect(
      claimPlaceIds({
        ...empty,
        memberOf,
        fields: [
          { subject: "place", streetLine: "", placeId: null },
          { subject: "place", streetLine: "", placeId: "" },
        ],
      }),
    ).toEqual([""]);
    const copied = claimPlaceIds({ ...empty, memberOf });
    expect(copied).toEqual(["legacy"]);
    expect(copied).not.toBe(memberOf);
  });
});

describe("decomposition", () => {
  it("counts any field, and migration looks only at the composite", () => {
    expect(isDecomposed({ fields: [{ subject: "street", streetLine: "", placeId: null }] })).toBe(
      true,
    );
    expect(isDecomposed({ fields: [] })).toBe(false);
    expect(needsFieldMigration({ streetLine: "  ", memberOf: [] })).toBe(false);
    expect(needsFieldMigration({ streetLine: "", memberOf: [""] })).toBe(true);
    expect(needsFieldMigration({ streetLine: "Road", memberOf: [] })).toBe(true);
  });
});
