import { describe, expect, it } from "vitest";
import type { OnlineCardField } from "@kaigilb/gilbplatformcode-online-card";
import { theirAddressesOf, theirAddressLine, sameAddress, addressLine, type AddressSpellings } from "./index";

const S: AddressSpellings = {
  label: "a:placeClaimLabel",
  streetLine: "a:streetLine",
  addressLine1: "a:addressLine1",
  addressLine2: "a:addressLine2",
  postalCode: "a:postalCode",
  claimPlace: "a:claimPlace",
};
const f = (predicate: string, value: string, extra: Partial<OnlineCardField> = {}): OnlineCardField => ({
  predicate,
  value,
  rung: "public",
  sourceEntity: `src-${predicate}-${value}`,
  ...extra,
});
const label = (value: string, id: string, rung = "public") => f(S.label, value, { sourceEntity: id, rung });
const part = (p: string, value: string, composite?: string, rung = "public") => f(p, value, composite === undefined ? { rung } : { composite, rung });

describe("theirAddressesOf", () => {
  it("M1 Kai's home", () => {
    const r = theirAddressesOf(
      [label("home", "E1"), part(S.streetLine, "Gladvollveien 38c", "E1"), part(S.claimPlace, "oslo", "E1"), part(S.claimPlace, "norway", "E1")],
      S,
    );
    expect(r.addresses).toEqual([
      { composite: "E1", label: "home", street: "Gladvollveien 38c", line1: null, line2: null, postalCode: null, placeIds: ["oslo", "norway"], rungs: ["public"], partPredicates: [S.label, S.streetLine, S.claimPlace] },
    ]);
    expect(r.loose).toEqual([]);
  });

  it("M2 two composites stay two addresses", () => {
    const r = theirAddressesOf(
      [label("home", "E1"), part(S.streetLine, "Work street 1", "E2"), part(S.claimPlace, "oslo", "E1"), label("work", "E2"), part(S.streetLine, "Home street 2", "E1"), part(S.claimPlace, "bergen", "E2")],
      S,
    );
    expect(r.addresses.map((a) => [a.composite, a.label, a.street, a.placeIds])).toEqual([
      ["E1", "home", "Home street 2", ["oslo"]],
      ["E2", "work", "Work street 1", ["bergen"]],
      ]);
  });

  it("M2b order is by first appearance of any field", () => {
    const r = theirAddressesOf([part(S.streetLine, "W", "E2"), label("home", "E1"), label("work", "E2")], S);
    expect(r.addresses.map((a) => a.composite)).toEqual(["E2", "E1"]);
  });

  it("M3 a part with no composite is loose, not joined, even with exactly one label", () => {
    const loose = part(S.streetLine, "Nowhere 1");
    const r = theirAddressesOf([label("home", "E1"), loose], S);
    expect(r.addresses).toHaveLength(1);
    expect(r.addresses[0]!.street).toBeNull();
    expect(r.loose).toEqual([loose]);
  });

  it("M3b a label row with no sourceEntity is loose", () => {
    const l = f(S.label, "home", { sourceEntity: null });
    const r = theirAddressesOf([l], S);
    expect(r.addresses).toEqual([]);
    expect(r.loose).toEqual([l]);
  });

  it("M3c never joins by a sourceEntity prefix", () => {
    const r = theirAddressesOf([label("home", "https://v/e/1"), part(S.streetLine, "X", undefined)], S);
    expect(r.addresses[0]!.street).toBeNull();
    const r2 = theirAddressesOf([label("home", "https://v/e/1"), f(S.streetLine, "X", { sourceEntity: "https://v/e/1/part" })], S);
    expect(r2.addresses[0]!.street).toBeNull();
    expect(r2.loose).toHaveLength(1);
  });

  it("M4 a part whose label was not served forms its own address with label null", () => {
    const r = theirAddressesOf([label("home", "E1"), part(S.streetLine, "Secret 9", "E2")], S);
    expect(r.addresses.map((a) => [a.composite, a.label, a.street])).toEqual([["E1", "home", null], ["E2", null, "Secret 9"]]);
  });

  it("M5 non-address fields are ignored", () => {
    const r = theirAddressesOf([f("a:email", "a@b.test"), f("a:givenName", "Ann", { composite: "E1" })], S);
    expect(r).toEqual({ addresses: [], loose: [] });
  });

  it("M6 rungs are the distinct rungs of the parts, first-seen order", () => {
    const r = theirAddressesOf([label("home", "E1", "friends"), part(S.streetLine, "S", "E1", "public"), part(S.claimPlace, "n", "E1", "friends"), part(S.postalCode, "0000", "E1", "family")], S);
    expect(r.addresses[0]!.rungs).toEqual(["friends", "public", "family"]);
    expect(r.addresses[0]!.postalCode).toBe("0000");
  });

  it("M7 a second street row in the same address is ignored (first kept)", () => {
    const r = theirAddressesOf([label("home", "E1"), part(S.streetLine, "First 1", "E1"), part(S.streetLine, "Second 2", "E1", "family")], S);
    expect(r.addresses[0]!.street).toBe("First 1");
    expect(r.addresses[0]!.rungs).toEqual(["public"]);
    expect(r.addresses[0]!.partPredicates).toEqual([S.label, S.streetLine]);
  });

  it("M7b lines 1 and 2, and no duplicate place ids", () => {
    const r = theirAddressesOf([part(S.addressLine1, "L1", "E1"), part(S.addressLine2, "L2", "E1"), part(S.claimPlace, "oslo", "E1"), part(S.claimPlace, "oslo", "E1", "family")], S);
    expect(r.addresses[0]).toMatchObject({ line1: "L1", line2: "L2", placeIds: ["oslo"] });
  });
});

describe("theirAddressLine", () => {
  it("M8 compares through sameAddress with an OwnAddress built from the same honestly comparable parts", () => {
    const [a] = theirAddressesOf([label("home", "E1"), part(S.streetLine, "Gladvollveien 38c", "E1"), part(S.addressLine2, "Apt 2", "E1"), part(S.postalCode, "0854", "E1"), part(S.claimPlace, "oslo", "E1")], S).addresses;
    // Place ids are NOT names: only street, lines and postal code are comparable here. The line is exactly those, in addressLine's order.
    expect(theirAddressLine(a!)).toBe("Gladvollveien 38c, Apt 2, 0854");
    const own = { street: " gladvollveien 38C ", line2: "apt 2", postalCode: "0854" };
    expect(sameAddress(theirAddressLine(a!), own)).toBe(true);
    expect(theirAddressLine(a!)).toBe(addressLine({ street: "Gladvollveien 38c", line2: "Apt 2", postalCode: "0854" }));
    expect(sameAddress(theirAddressLine(a!), { street: "Other 1", line2: "Apt 2", postalCode: "0854" })).toBe(false);
  });

  it("M8b an address with nothing comparable gives an empty line (never the same as anything)", () => {
    const [a] = theirAddressesOf([label("home", "E1"), part(S.claimPlace, "oslo", "E1")], S).addresses;
    expect(theirAddressLine(a!)).toBe("");
    expect(sameAddress(theirAddressLine(a!), theirAddressLine(a!))).toBe(false);
  });
});
