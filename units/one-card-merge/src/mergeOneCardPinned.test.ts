// Pins the edges of every export of the merge that the ported tests leave open. A fake card, no network, no clock.
import { describe, expect, it } from "vitest";
import * as unit from "./index";
import { addressLine, compareRuleOf, mergeOneCard, normalizeForCompare, sameAddress, slotLabel, SLOT_PURPOSES, type OneCardField } from "./index";
import { parseOnlineCard } from "@kaigilb/gilbplatformcode-online-card";

const field = (slug: string, label: string | null, many: boolean, writeKey: string | null = `a:${slug}`): OneCardField => ({
  term: `https://master.example/base/t/${slug}`,
  label,
  readKeys: [`a:${slug}`, slug],
  writeKey,
  many,
});
const EMAIL = field("email", "Email", true);
const TITLE = field("title", "Title", false);
const SKILL = field("skill", "Skill", true);
const ORDER = [EMAIL, TITLE, SKILL];
const P = "https://ann.example.test/";
const card = (fields: { field: string; value: string; rung: string }[], extra: Record<string, unknown> = {}) =>
  parseOnlineCard(P, { fields: fields.map((f) => ({ principal: P, ...f })), ...extra });

describe("one-card-merge exports", () => {
  it("exports the merge, the compare, the address and the label functions and the purposes table", () => {
    expect(Object.keys(unit).sort()).toEqual(["SLOT_PURPOSES", "addressLine", "compareRuleOf", "mergeOneCard", "normalizeForCompare", "sameAddress", "slotLabel", "theirAddressLine", "theirAddressesOf"]);
  });
});

describe("mergeOneCard: edges", () => {
  it("returns no groups, no marks and no header identity for no card and an empty own side", () => {
    expect(mergeOneCard({ online: null, own: {}, fieldOrder: ORDER })).toEqual({
      header: { name: null, nameSource: "none", photo: null, photoSource: "none", linked: false },
      groups: [],
      marks: false,
    });
  });

  it("shows their skills under the card route's own key `skills` when the skill predicate is empty or null", () => {
    const online = card([], { skills: [{ skillUri: "https://master.example/base/e/s1", rung: "public" }] });
    for (const skillPredicate of ["", null, undefined]) {
      const out = mergeOneCard({ online, own: {}, fieldOrder: ORDER, skillPredicate });
      expect(out.groups.map((g) => [g.field, g.known, g.term, g.label, g.many])).toEqual([["skills", false, null, null, true]]);
    }
  });

  it("matches their skills with the held skill claims when the predicate is named", () => {
    const online = card([], { skills: [{ skillUri: "https://master.example/base/e/s1", rung: "public", note: "deep" }] });
    const out = mergeOneCard({
      online,
      own: { heldClaims: [{ predicate: "a:skill", value: "https://master.example/base/e/s1", note: "mine", entity: "c1" }] },
      fieldOrder: ORDER,
      skillPredicate: "a:skill",
    });
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0]!.rows).toEqual([
      expect.objectContaining({ source: "theirs", sameAsTheirs: true, notes: ["deep"], ownNotes: ["mine"], claims: ["c1"] }),
    ]);
  });

  it("reads fact values as strings, references by their IRI, numbers and booleans as text, and drops blanks and other values", () => {
    const facts = {
      email: ["a@x.example", { "@id": "mailto:b@x.example" }, { "@value": 7 }, { "@value": true }, { "@value": "" }, 3, false, null, {}, "  ", { "@value": Infinity }, [], NaN],
    };
    const out = mergeOneCard({ online: null, own: { facts }, fieldOrder: ORDER });
    expect(out.groups[0]!.rows.map((r) => r.value)).toEqual(["a@x.example", "mailto:b@x.example", "7", "true", "3", "false"]);
  });

  it("does not draw a fact that no field of the set reads", () => {
    const out = mergeOneCard({ online: null, own: { facts: { type: "t:Person", sameAs: { "@id": "https://x.example/" } } }, fieldOrder: ORDER });
    expect(out.groups).toEqual([]);
  });

  it("ignores a held claim with no predicate, a blank value or a non-string value", () => {
    const own = { heldClaims: [{ predicate: "", value: "x" }, { predicate: "a:email", value: "  " }, { predicate: "a:email", value: 5 as unknown as string }] };
    expect(mergeOneCard({ online: null, own, fieldOrder: ORDER }).groups).toEqual([]);
  });

  it("identifies two fields that write one predicate by their terms", () => {
    const a = field("alpha", "Alpha", false, "a:same");
    const b = field("beta", "Beta", false, "a:same");
    const out = mergeOneCard({
      online: null,
      own: { facts: { alpha: "1", beta: "2" } },
      fieldOrder: [a, b],
    });
    expect(out.groups.map((g) => g.field)).toEqual(["a:same", b.term]);
  });

  it("falls back to the first a: read key, then the first read key, when a field has no write key", () => {
    const withA: OneCardField = { term: "t1", label: null, readKeys: ["x", "a:x"], writeKey: null, many: false };
    const bare: OneCardField = { term: "t2", label: null, readKeys: ["y"], writeKey: null, many: false };
    const out = mergeOneCard({ online: null, own: { facts: { x: "1", y: "2" } }, fieldOrder: [withA, bare] });
    expect(out.groups.map((g) => g.field)).toEqual(["a:x", "y"]);
  });

  it("puts a served predicate the set does not know after the known groups, as several values, in the order first met", () => {
    const online = card([
      { field: "a:zeta", value: "z", rung: "public" },
      { field: "a:title", value: "T", rung: "public" },
      { field: "a:eta", value: "e", rung: "public" },
      { field: "zeta", value: "z2", rung: "public" },
    ]);
    const out = mergeOneCard({ online, own: {}, fieldOrder: ORDER });
    expect(out.groups.map((g) => [g.field, g.known, g.many, g.term, g.label, g.rows.length])).toEqual([
      ["a:title", true, false, TITLE.term, "Title", 1],
      ["a:zeta", false, true, null, null, 2],
      ["a:eta", false, true, null, null, 1],
    ]);
  });

  it("marks theirs read-only and yours editable, and gives only theirs a rung", () => {
    const out = mergeOneCard({ online: card([{ field: "a:title", value: "A", rung: "public" }]), own: { facts: { title: "B" } }, fieldOrder: ORDER });
    const rows = out.groups[0]!.rows;
    expect(rows.map((r) => [r.source, r.editable, r.rung ?? null])).toEqual([["theirs", false, "public"], ["yours", true, null]]);
    expect(out.groups[0]!.bothKept).toBe(true);
  });

  it("does not say both are kept when only yours has a second value", () => {
    const out = mergeOneCard({ online: null, own: { facts: { title: ["A", "B"] } }, fieldOrder: ORDER });
    expect(out.groups[0]!.bothKept).toBe(false);
  });

  it("takes the photo of the record when theirs is blank, and none when both are blank", () => {
    const online = card([], { photoUrl: "   " });
    expect(mergeOneCard({ online, own: { photo: "/mine.jpg" }, fieldOrder: ORDER }).header).toMatchObject({ photo: "/mine.jpg", photoSource: "yours" });
    expect(mergeOneCard({ online, own: { photo: " " }, fieldOrder: ORDER }).header).toMatchObject({ photo: null, photoSource: "none" });
  });

  it("trims the record's own name and treats a blank one as none", () => {
    expect(mergeOneCard({ online: null, own: { name: "  Ben Lund " }, fieldOrder: ORDER }).header).toMatchObject({ name: "Ben Lund", nameSource: "yours" });
    expect(mergeOneCard({ online: null, own: { name: "   " }, fieldOrder: ORDER }).header).toMatchObject({ name: null, nameSource: "none" });
  });

  it("reads an address of the holder only under the named field, as its line, with its entity and label", () => {
    const out = mergeOneCard({
      online: null,
      own: { addresses: [{ street: " Storgata 1 ", city: "Oslo", entity: "e1", slot: "address-home", kind: "address" }, {}] },
      fieldOrder: ORDER,
      addressPredicate: "a:postalAddress",
    });
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0]).toMatchObject({ field: "a:postalAddress", known: false });
    expect(out.groups[0]!.rows).toEqual([{ field: "a:postalAddress", value: "Storgata 1, Oslo", source: "yours", editable: true, label: "Home", labels: ["Home"], claims: ["e1"] }]);
  });

  it("does not change the rung words of a row when the caller passes its own words", () => {
    const out = mergeOneCard({ online: card([{ field: "a:title", value: "A", rung: "r1" }]), own: {}, fieldOrder: ORDER, rungWords: (r) => `<${r}>` });
    expect(out.groups[0]!.rows[0]).toMatchObject({ rung: "r1", rungWords: "<r1>" });
  });
});

describe("compareRuleOf", () => {
  it("reads email, phone and address by the bare form of any spelling, email first, else text", () => {
    expect(compareRuleOf(["a:email"])).toBe("email");
    expect(compareRuleOf(["a:phone", "email"])).toBe("email");
    expect(compareRuleOf(["a:phone"])).toBe("phone");
    expect(compareRuleOf(["a:postalAddress"])).toBe("address");
    expect(compareRuleOf(["a:title"])).toBe("text");
    expect(compareRuleOf([])).toBe("text");
  });
});

describe("normalizeForCompare", () => {
  it("trims text and keeps its case; lowers an email; collapses an address", () => {
    expect(normalizeForCompare("text", "  Ab ")).toBe("Ab");
    expect(normalizeForCompare("email", " A@X.Test ")).toBe("a@x.test");
    expect(normalizeForCompare("address", " Storgata  1 ;  Oslo ")).toBe("storgata 1 oslo");
    expect(normalizeForCompare("phone", "tel:+47 900")).toBe("+47900");
    expect(normalizeForCompare("phone", "n/a")).toBe("");
  });
});

describe("addressLine and sameAddress", () => {
  it("joins the non-empty parts in the address order, trimmed", () => {
    expect(addressLine({ country: "Norway", city: " Oslo ", street: "S 1", postalCode: "0155", line1: "a", line2: "b", region: "R" })).toBe("S 1, a, b, 0155, Oslo, R, Norway");
    expect(addressLine({ street: "  ", city: null })).toBe("");
  });
  it("is never the same for an address with nothing in it, and compares a string with a structure by the line", () => {
    expect(sameAddress({}, {})).toBe(false);
    expect(sameAddress("", {})).toBe(false);
    expect(sameAddress({ street: "S 1", city: "Oslo" }, "s 1 oslo")).toBe(true);
    expect(sameAddress({ street: "S 1", city: "Oslo" }, { street: "s 1", city: "OSLO", region: "" })).toBe(true);
    expect(sameAddress({ street: "S 1", city: "Oslo" }, { street: "S 1", city: "Bergen" })).toBe(false);
  });
});

describe("slotLabel and SLOT_PURPOSES", () => {
  it("gives no label for a non-string slot or a slot of another kind", () => {
    expect(slotLabel(undefined)).toBeNull();
    expect(slotLabel(null, "email")).toBeNull();
    expect(slotLabel("phone-mobile")).toBeNull();
    expect(slotLabel("phone-mobile", "")).toBeNull();
    expect(slotLabel("phone-mobile", "email")).toBeNull();
    expect(slotLabel(" phone-mobile ", "phone")).toBe("Mobile");
    expect(slotLabel("email-constructor", "email")).toBeNull();
  });
  it("holds exactly the five purposes, frozen", () => {
    expect(SLOT_PURPOSES).toEqual({ work: "Work", private: "Private", personal: "Personal", home: "Home", mobile: "Mobile" });
  });
});
