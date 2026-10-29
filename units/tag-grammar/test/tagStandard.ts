// The TagStandard record and the terms beside it, as the master served them, for the fixture (not shipped).
//
// Read live on the master:
//   GET /base/e/tag-standard-full-tag-at-vault  200 application/ld+json — a FRAMED record: bare
//       keys (`segments`, `separator`, `label`), `@context` a URL string, `@type` "t:TagStandard"
//   GET /base/a/segments   200  a:predicateAttribute "a:segments"
//   GET /base/a/separator  200  a:predicateAttribute "a:separator"
//   GET /base/a/statedBy   200  a:predicateAttribute "a:statedBy", a:encoding "reference:@id"
// The record's long `justifiedBy` text is left out; nothing here reads it.
import { a, CONTEXT, ID, type FixtureMaster } from "./support";

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
