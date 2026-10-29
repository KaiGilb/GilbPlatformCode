// COPIED UNCHANGED from units/stakeholder-card-hosts-gilbplatform/test/writableFields.ts (a unit's test fake cannot be imported by path: its bare imports
// resolve from the unit's folder, which has no node_modules here). If the unit's copy changes, copy it again.
// Test-only. The package fixture's writable fields (`withWritableFields` of `fixtureTag.ts`), adjudicated for the create tests:
//  - the 11 names that are neither placed nor refused on the master (t/FixtureC214PassportField, t/FixtureC214PassportRecord,
//    t/FixtureC214IdentityDocument, t/FixtureC214DocumentNumber, t/FixtureC214BadgeField, t/FixtureC214BadgeRecord, a:fixtureC214Passport,
//    a:fixtureC214Badge, a:fixtureC214DocumentNumber, a:fixtureC214Telephone, a:fixtureC214TimeZoneAlt) are dropped. The `fixtureTag.ts` of this
//    unit already leaves them out, so this part of the app's helper finds nothing to drop here and is kept as it is;
//  - a spelling list (`<adjudicated>|<alternative>`) keeps its first spelling alone, with any retired notation dropped (the alternatives are the
//    un-placed ones). This is the part that changes the fixture here.
// Like the in-repo `withoutUnplaced` helpers, it rewrites the served listing.
import { fixtureMaster, ID, RIG } from "./support";
import { withWritableFields } from "./fixtureTag";

type Master = ReturnType<typeof fixtureMaster>;

const DROPPED = new Set(["FixtureC214PassportField", "FixtureC214DocumentNumber", "FixtureC214BadgeField"].map((n) => `${ID}/base/t/${n}`));

export function withWritableFieldsAdjudicated(m: Master): Master {
  withWritableFields(m);
  const pages: Record<string, unknown>[][] = [];
  for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
    const page = m.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(
      page["@graph"]
        .filter((n) => !DROPPED.has(n["@id"] as string))
        .map((n) => {
          // A spelling list (`<adjudicated>|<alternative>`): its first spelling alone, the
          // alternative and any retired notation dropped (the alternatives are the un-placed ones).
          const spellings = String(n["a:predicateAttribute"] ?? "").split("|");
          if (spellings.length < 2) return n;
          const { "a:deprecatedNotation": _retired, ...rest } = n;
          return { ...rest, "a:predicateAttribute": spellings[0] };
        }),
    );
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  m.listing(pages as never);
  for (const name of ["FixtureC214PassportRecord", "FixtureC214IdentityDocument", "FixtureC214BadgeRecord"]) m.docs.delete(`${RIG}/base/t/${name}`);
  return m;
}
