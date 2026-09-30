import { describe, expect, it } from "vitest";
import { migrationRefusalReason, placeFieldsVisibleTo } from "./placeGate";

const nameable = (tier: string) => tier === "public" || tier === "private";

describe("placeFieldsVisibleTo", () => {
  const street = { tier: "public", slot: "street" };
  const city = { tier: "private", slot: "city" };
  const foreign = { tier: "t:NotInThisBuild", slot: "country" };

  it("returns nothing for an empty viewer, and drops a tier the host cannot name", () => {
    expect(placeFieldsVisibleTo([street, city], [], nameable)).toEqual([]);
    expect(placeFieldsVisibleTo([foreign], ["public", "t:NotInThisBuild"], nameable)).toEqual([]);
  });

  it("keeps an exact tier, in order, and does not trim", () => {
    const kept = placeFieldsVisibleTo([city, street, { tier: " public", slot: "region" }], ["public"], nameable);
    expect(kept).toEqual([street]);
    expect(kept[0]).toBe(street);
  });
});

describe("migrationRefusalReason", () => {
  it("names already-decomposed before the other two reasons", () => {
    expect(
      migrationRefusalReason({ rawTier: "", hasLegacyFields: false, alreadyDecomposed: true }),
    ).toBe("already-decomposed");
  });

  it("names nothing-to-migrate before an unreadable rung", () => {
    expect(
      migrationRefusalReason({ rawTier: "   ", hasLegacyFields: false, alreadyDecomposed: false }),
    ).toBe("nothing-to-migrate");
  });

  it("refuses a blank rung only when there is something to migrate, and lets a real rung through", () => {
    expect(
      migrationRefusalReason({ rawTier: "", hasLegacyFields: true, alreadyDecomposed: false }),
    ).toBe("unreadable-rung");
    expect(
      migrationRefusalReason({ rawTier: "  ", hasLegacyFields: true, alreadyDecomposed: false }),
    ).toBe("unreadable-rung");
    expect(
      migrationRefusalReason({ rawTier: "  public  ", hasLegacyFields: true, alreadyDecomposed: false }),
    ).toBeNull();
  });
});
