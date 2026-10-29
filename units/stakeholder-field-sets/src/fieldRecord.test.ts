// Ported from `gilb-stakeholders` `test/fieldRecord.test.ts` at 0a261488: all 8 tests. A field that holds a record of its own is read from
// the master, not listed in code: the field's term carries `a:fieldRecordType`, naming the record's type; the type's own term publishes
// the type name to write; the record's fields are those whose `a:fieldOf` names the type or a type above it.
//
// Expected values are literals. The fixture tells the parts of the derivation apart on purpose: one field whose field term and type term
// are the same term (as `a:employment` is served), one where they differ and the field term's own `a:typeAttribute` is a different
// string, a reference field that carries `a:typeAttribute` and holds no record, and a record type whose term publishes no type name.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "./fieldSets";
import { fixtureMaster, RIG, t, CONTEXT } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";

const resolve = async (tweak?: (m: ReturnType<typeof fixtureMaster>) => void) => {
  const m = withWritableFields(withTagStandard(fixtureMaster()));
  tweak?.(m);
  return resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
};
const field = (sets: Awaited<ReturnType<typeof resolve>>, kind: string, term: string) =>
  sets.byKind[t(kind)]!.fields.find((f) => f.term === t(term))!;

describe("a field that holds a record of its own — from a:fieldRecordType", () => {
  it("gives the record's type, its type name, whether it may hold several, and its own fields", async () => {
    const sets = await resolve();
    const employment = field(sets, "Person", "Employment").record!;
    expect(employment.type).toBe(t("Employment"));
    expect(employment.typeName).toBe("t:Employment");
    expect(employment.many).toBe(true);
    expect(employment.fields.map((f) => f.term)).toEqual([t("JobTitle"), t("WorksFor")]);
    expect(employment.fields.map((f) => f.writeKey)).toEqual(["a:jobTitle", "a:org"]);
    expect(sets.complete).toBe(true);
  });

  it("reads the type name from the record type's own term, and inherits fields from above it", async () => {
    const sets = await resolve();
    const passport = field(sets, "Person", "FixturePassportField").record!;
    expect(passport.type).toBe(t("FixturePassportRecord"));
    expect(passport.typeName).toBe("t:FixturePassportRecord"); // the FIELD term says "t:FixturePassportField"
    expect(passport.many).toBe(false);
    expect(passport.fields.map((f) => f.term)).toEqual([t("FixtureDocumentNumber")]); // declared on FixtureIdentityDocument
  });

  it("a field without the fact holds no record, even a reference that carries a:typeAttribute", async () => {
    const sets = await resolve();
    expect(field(sets, "Person", "ActsOnBehalfOf").record).toBeNull();
    expect(field(sets, "Person", "Email").record).toBeNull();
    expect(field(sets, "Person", "Name").record).toBeNull();
  });

  it("the record's fields reach no stakeholder kind: they are the record's, not the person's", async () => {
    const sets = await resolve();
    const personTerms = sets.byKind[t("Person")]!.fields.map((f) => f.term);
    expect(personTerms).not.toContain(t("WorksFor"));
    expect(personTerms).not.toContain(t("JobTitle"));
    expect(personTerms).not.toContain(t("FixtureDocumentNumber"));
    // And only a person is offered the employment field.
    expect(sets.byKind[t("Organization")]!.fields.map((f) => f.term)).not.toContain(t("Employment"));
  });

  it("a record type whose term publishes no type name gives a record with none, never a guess", async () => {
    const sets = await resolve();
    const badge = field(sets, "Person", "FixtureBadgeField").record!;
    expect(badge.type).toBe(t("FixtureBadgeRecord"));
    expect(badge.typeName).toBeNull();
    // That is a fact about the master, read whole. It is not an incomplete reading.
    expect(sets.complete).toBe(true);
  });

  it("a record type that cannot be read leaves the field offered and says the reading is not whole", async () => {
    const sets = await resolve((m) => m.status.set(`${RIG}/base/t/FixturePassportRecord`, 503));
    const passport = field(sets, "Person", "FixturePassportField").record!;
    expect(passport.type).toBe(t("FixturePassportRecord"));
    expect(passport.typeName).toBeNull();
    expect(sets.complete).toBe(false);
    expect(sets.incompleteAt.some((s) => s.includes("FixturePassportRecord"))).toBe(true);
    // The other record field is still whole.
    expect(field(sets, "Person", "Employment").record!.typeName).toBe("t:Employment");
  });

  it("a field that names two record types is reported, and given no record", async () => {
    const sets = await resolve((m) =>
      m.listing([
        [
          { "@id": t("Name"), "a:predicateAttribute": "a:name", "a:label": "Name", "a:encoding": "inline-literal:text", "a:fieldOf": [{ "@id": t("Person") }] },
          {
            "@id": t("TwoTypes"),
            "a:predicateAttribute": "a:twoTypes",
            "a:label": "Two types",
            "a:fieldOf": [{ "@id": t("Person") }],
            "a:fieldRecordType": [{ "@id": t("Employment") }, { "@id": t("FixturePassportRecord") }],
          },
        ],
      ]),
    );
    expect(field(sets, "Person", "TwoTypes").record).toBeNull();
    expect(sets.unreadable).toEqual([{ term: t("TwoTypes"), reason: "names 2 record types; one was expected" }]);
    expect(sets.complete).toBe(false);
  });

  it("reads the fact under its bare spelling too", async () => {
    const sets = await resolve((m) =>
      m.listing([
        [
          { "@id": t("Name"), "a:predicateAttribute": "a:name", "a:label": "Name", "a:encoding": "inline-literal:text", "a:fieldOf": [{ "@id": t("Person") }] },
          { "@context": CONTEXT, "@id": t("Employment"), "a:predicateAttribute": "a:employment", "a:cardinality": "multi", "a:fieldOf": [{ "@id": t("Person") }], fieldRecordType: { "@id": t("Employment") } },
        ],
      ]),
    );
    expect(field(sets, "Person", "Employment").record!.typeName).toBe("t:Employment");
  });
});
