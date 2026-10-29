// Shared set-up of the tests (not shipped). Ported from `gilb-stakeholders` `test/fixtureTag.ts` at 0a261488.
// The TagStandard record and the terms beside it, as the master served them, for the fixture; and field declarations with the encodings a
// create needs.
//
// The record was read live on 2026-09-30:
//   GET /base/e/tag-standard-full-tag-at-vault  200 application/ld+json — a FRAMED record: bare
//       keys (`segments`, `separator`, `label`), `@context` a URL string, `@type` "t:TagStandard"
//   GET /base/a/segments   200  a:predicateAttribute "a:segments"
//   GET /base/a/separator  200  a:predicateAttribute "a:separator"
//   GET /base/a/statedBy   200  a:predicateAttribute "a:statedBy", a:encoding "reference:@id"
// The record's long `justifiedBy` text is left out; nothing here reads it.
import { a, CONTEXT, ID, t, type FixtureMaster } from "./support";

export const TAG_STANDARD = `${ID}/base/e/tag-standard-full-tag-at-vault`;

/** The record exactly as served (minus `justifiedBy`). */
export const servedTagStandard = () => ({
  "@context": `${ID}/base/context.jsonld`,
  "@id": TAG_STANDARD,
  "@type": "t:TagStandard",
  authoredBy: { "@id": "base:p/veda-system" },
  label: "Full tag @tag@vault",
  segments: [
    { cardinality: "?", label: "lead", pattern: "^$", position: 0 },
    { label: "tag", pattern: "[^@]+", position: 1 },
    { label: "vault-name", pattern: "[a-z0-9]+", position: 2 },
  ],
  separator: "@",
});

/** Add the record and its terms to a fixture master. `record` replaces the served record. */
export function withTagStandard(m: FixtureMaster, record: unknown = servedTagStandard()): FixtureMaster {
  m.put("e/tag-standard-full-tag-at-vault", record);
  for (const slug of ["segments", "separator", "statedBy"]) {
    m.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
  }
  return m;
}

const ref = (iri: string) => ({ "@id": iri });

/**
 * Field declarations with the encodings a create needs, in the served listing shape.
 * ILLUSTRATIVE: the shape is the master's, the set is not a claim about what it holds. The
 * kinds get different fields on purpose, so a create that offered every field to every kind, or
 * wrote under a made-up key, gives a different answer.
 */
export function withWritableFields(m: FixtureMaster): FixtureMaster {
  m.listing([
    [
      {
        "@id": t("Name"),
        "a:predicateAttribute": "a:name",
        "a:label": "Name",
        "a:encoding": "inline-literal:text",
        "a:fieldOf": ["Person", "Organization", "PartyGroup", "SoftwareSystem", "SoftwareSystemGroup"].map((n) => ref(t(n))),
      },
      {
        "@id": t("Email"),
        "a:predicateAttribute": "a:email",
        "a:label": "Email",
        "a:encoding": "inline-literal:text",
        "a:fieldOf": [ref(t("Person")), ref(t("Organization"))],
      },
      {
        // May hold several values: its term declares it multi. The other text fields here
        // declare nothing, and so hold one.
        "a:cardinality": "multi",
        "@id": t("Phone"),
        // Two spellings, one retired: the writer must write the survivor only.
        "a:predicateAttribute": "a:phone|a:fixtureTelephone",
        "a:deprecatedNotation": "a:fixtureTelephone",
        "a:label": "Phone",
        "a:encoding": "inline-literal:text",
        "a:fieldOf": [ref(t("Person"))],
      },
    ],
    [
      {
        // A reference to an EXISTING record the writer picks. Like 28 served reference terms
        // it carries a:typeAttribute, which names the relation this term defines, not a record to make.
        "@id": t("ActsOnBehalfOf"),
        "a:predicateAttribute": "a:actsOnBehalfOf",
        "a:label": "acts on behalf of",
        // The bare token, as the master serves this term.
        "a:encoding": "reference",
        "a:typeAttribute": "t:ActsOnBehalfOf",
        "a:fieldOf": [ref(t("Person")), ref(t("Organization"))],
      },
      {
        // No encoding declared: offered, and not writable by a create that will not guess.
        "@id": t("PlanguageLevel"),
        "a:predicateAttribute": "a:level",
        "a:label": "Level",
        "a:fieldOf": ["Person", "Organization", "PartyGroup", "PartyMemberOf", "SoftwareSystem"].map((n) => ref(t(n))),
      },
      {
        // Two current spellings and none retired: the term names no one spelling to write.
        "@id": t("TimeZone"),
        "a:predicateAttribute": "a:timeZone|a:fixtureTimeZoneAlt",
        "a:label": "Time zone",
        "a:encoding": "inline-literal:text",
        "a:fieldOf": [ref(t("Person"))],
      },
    ],
    [
      // A field that holds a record of its own, AS SERVED (GET /base/a/employment): the field term and the type term are one term here, so the
      // record type it names is itself.
      {
        "@id": t("Employment"),
        "a:predicateAttribute": "a:employment",
        "a:label": "Employment",
        "a:encoding": "reference-edge:@id",
        "a:cardinality": "multi",
        "a:typeAttribute": "t:Employment",
        "a:typeUri": t("Employment"),
        "a:fieldOf": [ref(t("Person"))],
        "a:fieldRecordType": ref(t("Employment")),
      },
      {
        // As served (GET /base/a/org): text, a field of the employment record. Its own
        // a:typeAttribute names the relation it defines, NOT what its value points at.
        "@id": t("WorksFor"),
        "a:predicateAttribute": "a:org",
        "a:label": "works-for",
        "a:encoding": "inline-literal:text",
        "a:typeAttribute": "t:WorksFor",
        "a:fieldOf": [ref(t("Employment"))],
      },
      {
        "@id": t("JobTitle"),
        "a:predicateAttribute": "a:jobTitle",
        "a:label": "Job title",
        "a:encoding": "inline-literal:text",
        "a:fieldOf": [ref(t("Employment"))],
      },
      // ILLUSTRATIVE, to tell the derivation's parts apart: a record field whose FIELD term and
      // TYPE term differ, which holds one record, and whose field term's own a:typeAttribute is
      // not the record's type name.
      {
        "@id": t("FixturePassportField"),
        "a:predicateAttribute": "a:fixturePassport",
        "a:label": "Passport",
        "a:encoding": "reference:@id",
        "a:cardinality": "single",
        "a:typeAttribute": "t:FixturePassportField",
        "a:fieldOf": [ref(t("Person"))],
        "a:fieldRecordType": ref(t("FixturePassportRecord")),
      },
      {
        // Declared on a type ABOVE the record type: the record inherits it.
        "@id": t("FixtureDocumentNumber"),
        "a:predicateAttribute": "a:fixtureDocumentNumber",
        "a:label": "Document number",
        "a:encoding": "inline-literal:text",
        "a:fieldOf": [ref(t("FixtureIdentityDocument"))],
      },
      {
        // A record field whose type's own term publishes no type name: offered, not writable.
        "@id": t("FixtureBadgeField"),
        "a:predicateAttribute": "a:fixtureBadge",
        "a:label": "Badge",
        "a:encoding": "reference:@id",
        "a:fieldOf": [ref(t("Person"))],
        "a:fieldRecordType": ref(t("FixtureBadgeRecord")),
      },
    ],
  ]);
  // The record types' own terms. The type name a writer stamps is read from HERE.
  m.put("t/Employment", { "@context": CONTEXT, "@id": t("Employment"), "a:label": "Employment", "a:typeAttribute": "t:Employment", "a:subTypeOf": ref(t("WorksFor")) });
  m.put("t/FixturePassportRecord", { "@context": CONTEXT, "@id": t("FixturePassportRecord"), "a:label": "Passport", "a:typeAttribute": "t:FixturePassportRecord", "a:subTypeOf": ref(t("FixtureIdentityDocument")) });
  m.put("t/FixtureIdentityDocument", { "@context": CONTEXT, "@id": t("FixtureIdentityDocument"), "a:label": "Identity document", "a:subTypeOf": ref(t("Information")) });
  m.put("t/FixtureBadgeRecord", { "@context": CONTEXT, "@id": t("FixtureBadgeRecord"), "a:label": "Badge" });
  return m;
}
