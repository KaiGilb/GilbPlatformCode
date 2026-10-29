// An address equal to theirs is ONE row, theirs, "You have the same on your card", as for every other kind.
//
// The compare: a structured address is compared field by field after trim and NFC, case-insensitive, ignoring empty parts;
// an address handed as one string (the platform's card route serves `a:postalAddress` as one string) is compared normalised: trim,
// NFC, collapsed whitespace, case-insensitive. The holder's addresses are held claims (`t:PlaceClaim`), handed to the merge as
// `own.addresses` with the field they belong to (`addressPredicate`).
import { describe, expect, it } from "vitest";
import {
  addressLine,
  compareRuleOf,
  mergeOneCard,
  normalizeForCompare,
  sameAddress,
  type OneCardField,
  type OwnAddress,
} from "./index";
import { parseOnlineCard } from "@kaigilb/gilbplatformcode-online-card";

const field = (slug: string, label: string, many: boolean): OneCardField => ({
  term: `https://master.example/base/t/${slug}`,
  label,
  readKeys: [`a:${slug}`, slug],
  writeKey: `a:${slug}`,
  many,
});
const EMAIL = field("email", "Email", true);
const ADDRESS = field("postalAddress", "Postal Address", true);
const ORDER = [EMAIL, ADDRESS];
const P = "https://ann.example.test/";
const theirs = (...values: string[]) =>
  parseOnlineCard(P, {
    fields: [
      { principal: P, field: "a:email", value: "ann@example.test", rung: "public" },
      ...values.map((value) => ({ principal: P, field: "a:postalAddress", value, rung: "t:PersonalFirstDegreeGrantee", slot: "address-home", kind: "address" })),
    ],
  });
const merge = (online: ReturnType<typeof theirs> | null, addresses: OwnAddress[], addressPredicate: string | null = "a:postalAddress") =>
  mergeOneCard({ online, own: { addresses }, fieldOrder: ORDER, addressPredicate });
const addrGroup = (out: ReturnType<typeof mergeOneCard>) => out.groups.find((g) => g.field === "a:postalAddress");

describe("addresses in the one card's merge", () => {
  describe("the compare", () => {
    it("an address field compares as an address", () => {
      expect(compareRuleOf(["a:postalAddress", "postalAddress"])).toBe("address");
      expect(compareRuleOf(["a:postalAddress"])).toBe("address");
    });

    it("one string: trimmed, NFC, whitespace collapsed, case-insensitive; a comma is a separator like a space", () => {
      expect(normalizeForCompare("address", "  Storgata 1,\n0155   OSLO ,  Norway ")).toBe("storgata 1 0155 oslo norway");
      // NFC: "Å" as A + combining ring above is the same letter
      expect(normalizeForCompare("address", "A\u030Alesund")).toBe("ålesund");
      expect(normalizeForCompare("address", "Ålesund".normalize("NFD"))).toBe(normalizeForCompare("address", "ÅLESUND"));
      expect(normalizeForCompare("address", " , ")).toBe("");
    });

    it("a structured address reads as one line in the address order, its empty parts left out", () => {
      expect(addressLine({ street: "Storgata 1", line1: " ", postalCode: "0155", city: "Oslo", country: "Norway" })).toBe("Storgata 1, 0155, Oslo, Norway");
      expect(addressLine({ line2: "c/o Hansen", region: "Viken" })).toBe("c/o Hansen, Viken");
      expect(addressLine({})).toBe("");
    });

    it("two structured addresses: field by field after trim and NFC, case-insensitive; an empty part equals an absent one", () => {
      expect(sameAddress({ street: "Storgata 1", city: "Oslo", region: "" }, { street: " storgata 1 ", city: "OSLO" })).toBe(true);
      expect(sameAddress({ street: "Storgata 1", city: "Oslo" }, { street: "Storgata 2", city: "Oslo" })).toBe(false);
      // a part one has and the other does not is a difference
      expect(sameAddress({ street: "Storgata 1", city: "Oslo" }, { street: "Storgata 1", city: "Oslo", country: "Norway" })).toBe(false);
    });

    it("a structured address and one string: the line, normalised, against the string, normalised", () => {
      expect(sameAddress({ street: "Storgata 1", postalCode: "0155", city: "Oslo", country: "Norway" }, "Storgata 1, 0155 Oslo, Norway")).toBe(true);
      expect(sameAddress("storgata 1 0155 oslo norway", { street: "Storgata 1", postalCode: "0155", city: "Oslo", country: "Norway" })).toBe(true);
      expect(sameAddress({ street: "Storgata 1", city: "Oslo" }, "Storgata 1, 0155 Oslo, Norway")).toBe(false);
      expect(sameAddress("", "")).toBe(false);
    });
  });

  describe("the merge", () => {
    // Design §4: both, equal values (normalized) -> one row, theirs, "You have the same on your card".
    it("an own address EQUAL to theirs (typed whole into the street, as on the rig) is ONE row of theirs that says so", () => {
      const out = merge(theirs("Storgata 1, 0155 Oslo, Norway"), [{ street: "Storgata 1, 0155 Oslo, Norway", entity: "https://h.example/e/a1" }]);
      const g = addrGroup(out)!;
      expect(g.rows).toHaveLength(1);
      expect(g.rows[0]).toMatchObject({ source: "theirs", value: "Storgata 1, 0155 Oslo, Norway", sameAsTheirs: true, claims: ["https://h.example/e/a1"] });
    });

    it("an own address EQUAL to theirs part by part (street, postal code, city, country) is ONE row too", () => {
      const out = merge(theirs("Storgata 1, 0155 Oslo, Norway"), [{ street: "storgata 1", postalCode: "0155", city: "OSLO", country: "Norway", entity: "https://h.example/e/a2" }]);
      const g = addrGroup(out)!;
      expect(g.rows.map((r) => [r.source, r.sameAsTheirs ?? false])).toEqual([["theirs", true]]);
      expect(g.rows[0]!.claims).toEqual(["https://h.example/e/a2"]);
    });

    // Design §4: both, different values -> both rows, theirs first.
    it("an own address DIFFERENT from theirs: both rows, theirs first, yours as its line with its claim", () => {
      const out = merge(theirs("Storgata 1, 0155 Oslo, Norway"), [{ street: "Bakkegata 4", city: "Bergen", entity: "https://h.example/e/a3" }]);
      const g = addrGroup(out)!;
      expect(g.rows.map((r) => [r.source, r.value])).toEqual([
        ["theirs", "Storgata 1, 0155 Oslo, Norway"],
        ["yours", "Bakkegata 4, Bergen"],
      ]);
      expect(g.rows[1]!.claims).toEqual(["https://h.example/e/a3"]);
      expect(g.rows[0]!.sameAsTheirs).toBeUndefined();
    });

    it("several addresses are matched value by value, never by position", () => {
      const out = merge(theirs("Storgata 1, Oslo", "Hytteveien 2, Geilo"), [
        { street: "Elsewhere 9", entity: "https://h.example/e/x" },
        { street: "hytteveien 2", city: "geilo", entity: "https://h.example/e/y" },
      ]);
      const g = addrGroup(out)!;
      expect(g.rows.map((r) => [r.source, r.value, r.sameAsTheirs ?? false])).toEqual([
        ["theirs", "Storgata 1, Oslo", false],
        ["theirs", "Hytteveien 2, Geilo", true],
        ["yours", "Elsewhere 9", false],
      ]);
    });

    it("an own address with no part is no row; an address only of yours is one row of yours", () => {
      const out = merge(null, [{ street: "  ", entity: "https://h.example/e/blank" }, { city: "Oslo", entity: "https://h.example/e/o" }]);
      expect(addrGroup(out)!.rows.map((r) => [r.source, r.value])).toEqual([["yours", "Oslo"]]);
    });

    it("two own addresses that are equal are one row of yours carrying both claims", () => {
      const out = merge(null, [{ street: "Storgata 1", city: "Oslo", entity: "https://h.example/e/1" }, { street: "STORGATA 1, oslo", entity: "https://h.example/e/2" }]);
      const rows = addrGroup(out)!.rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.claims).toEqual(["https://h.example/e/1", "https://h.example/e/2"]);
    });

    it("their twins equal as addresses at one rung are one row", () => {
      const out = merge(theirs("Storgata 1, Oslo", "storgata 1 ,  OSLO"), []);
      expect(addrGroup(out)!.rows).toHaveLength(1);
    });

    // Additive: an app that names no address field gets the merge it had.
    it("without an address field named, own addresses are not read and the rest of the card is unchanged", () => {
      const withA = merge(theirs("Storgata 1, Oslo"), [{ street: "Storgata 1", city: "Oslo", entity: "https://h.example/e/z" }], null);
      const without = mergeOneCard({ online: theirs("Storgata 1, Oslo"), own: {}, fieldOrder: ORDER });
      expect(withA).toEqual(without);
    });
  });
});

// In the one-string compare, adjacent duplicate comma-separated parts collapse after
// normalising, so a picked city that cascades a region of the same name ("Oslo, Oslo") still matches. A region that differs from the city
// stays: those addresses are different and both rows show.
describe("adjacent duplicate parts collapse in the one-string compare", () => {
  it("'Storgata 1, Oslo, Oslo, Norway' equals 'Storgata 1, Oslo, Norway' (also across case and spacing)", () => {
    expect(normalizeForCompare("address", "Storgata 1, Oslo, Oslo, Norway")).toBe(normalizeForCompare("address", "Storgata 1, Oslo, Norway"));
    expect(normalizeForCompare("address", "Storgata 1, Oslo ,  OSLO, Norway")).toBe("storgata 1 oslo norway");
    expect(sameAddress({ street: "Storgata 1", city: "Oslo", region: "Oslo", country: "Norway" }, "Storgata 1, Oslo, Norway")).toBe(true);
  });

  it("a region that differs from the city stays: 'Bergen, Vestland' is not 'Bergen'", () => {
    expect(sameAddress({ street: "Bryggen 1", city: "Bergen", region: "Vestland", country: "Norway" }, "Bryggen 1, Bergen, Norway")).toBe(false);
  });

  it("only ADJACENT duplicates collapse: 'Oslo, Norway, Oslo' keeps both", () => {
    expect(normalizeForCompare("address", "Oslo, Norway, Oslo")).toBe("oslo norway oslo");
  });

  it("in the merge: their 'Storgata 1, Oslo, Norway' and your city Oslo with region Oslo are ONE row 'same'", () => {
    const out = merge(theirs("Storgata 1, Oslo, Norway"), [{ street: "Storgata 1", city: "Oslo", region: "Oslo", country: "Norway", entity: "https://h.example/e/r" }]);
    expect(addrGroup(out)!.rows.map((r) => [r.source, r.sameAsTheirs ?? false])).toEqual([["theirs", true]]);
  });

  it("in the merge: a different region gives both rows", () => {
    const out = merge(theirs("Bryggen 1, Bergen, Norway"), [{ street: "Bryggen 1", city: "Bergen", region: "Vestland", country: "Norway", entity: "https://h.example/e/v" }]);
    expect(addrGroup(out)!.rows.map((r) => r.source)).toEqual(["theirs", "yours"]);
  });
});
