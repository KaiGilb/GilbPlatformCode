// Test-only. The catalogue rows of GilbApp's double (the live shapes of Oslo, New York, Manchester, the three-hop Deepcity ...), at this platform's catalogue host.
// (the same host as `fakePlaceStore.GEO_HOST`; written out here so the two files do not import each other)
const GEO = "https://geo.platform.example.test/base/e";
export const A_ROWS: Record<string, unknown> = {
  [`${GEO}/no`]: { "@id": `${GEO}/no`, "@type": "t:Country", label: "Norway" },
  [`${GEO}/oslo`]: { "@id": `${GEO}/oslo`, "@type": "t:Municipality", label: "Oslo", memberOf: `${GEO}/no` },
  [`${GEO}/us`]: { "@id": `${GEO}/us`, "@type": "t:Country", label: "United States" },
  [`${GEO}/uk`]: { "@id": `${GEO}/uk`, "@type": "t:Country", label: "United Kingdom" },
  // s8 card look (Kai 2026-10-16: "Oslo / Oslo / Oslo kommune / Oslo Township … need to show what Oslo, the
  // city in Norway or some town in USA"): the four live rows a search for "Oslo" returns, in the live shape
  // (GilbGeo, read 2026-10-16): the municipality and the administrative area both in Norway, a point row with
  // NO `memberOf`, and a township in the United States.
  [`${GEO}/oslo-admin`]: { "@id": `${GEO}/oslo-admin`, "@type": "t:GeoAdminArea", label: "Oslo", memberOf: `${GEO}/no` },
  [`${GEO}/oslo-kommune`]: { "@id": `${GEO}/oslo-kommune`, "@type": "t:Municipality", label: "Oslo kommune" },
  [`${GEO}/oslo-township`]: { "@id": `${GEO}/oslo-township`, "@type": "t:Municipality", label: "Oslo Township", memberOf: { "@id": "base:e/us" } },
  // s8 city fix: the live shapes of Bergen, Stockholm, Springfield and London (GilbGeo, read 2026-10-16 through the public search and
  // row GETs; `memberOf` is the one declared parent, as a string). Bergen and Stockholm are held as MUNICIPALITIES (as Oslo is);
  // London and Springfield also as CITIES; Stockholm's county is an administrative area. Only the five types the ontology serves.
  [`${GEO}/se`]: { "@id": `${GEO}/se`, "@type": "t:Country", label: "Sweden" },
  [`${GEO}/de`]: { "@id": `${GEO}/de`, "@type": "t:Country", label: "Germany" },
  [`${GEO}/bergen`]: { "@id": `${GEO}/bergen`, "@type": "t:Municipality", label: "Bergen", memberOf: `${GEO}/no` },
  [`${GEO}/bergen-ruegen`]: { "@id": `${GEO}/bergen-ruegen`, "@type": "t:Municipality", label: "Bergen auf Rügen", memberOf: `${GEO}/de` },
  [`${GEO}/bergen-town-of`]: { "@id": `${GEO}/bergen-town-of`, "@type": "t:Municipality", label: "Town of Bergen", memberOf: `${GEO}/us` },
  [`${GEO}/stockholm-muni`]: { "@id": `${GEO}/stockholm-muni`, "@type": "t:Municipality", label: "Stockholm Municipality", memberOf: `${GEO}/se` },
  [`${GEO}/stockholm-county`]: { "@id": `${GEO}/stockholm-county`, "@type": "t:GeoAdminArea", label: "Stockholm County", memberOf: `${GEO}/se` },
  [`${GEO}/london`]: { "@id": `${GEO}/london`, "@type": "t:City", label: "London", memberOf: `${GEO}/uk` },
  [`${GEO}/springfield-city`]: { "@id": `${GEO}/springfield-city`, "@type": "t:City", label: "Springfield", memberOf: `${GEO}/us` },
  [`${GEO}/springfield-town`]: { "@id": `${GEO}/springfield-town`, "@type": "t:Town", label: "Springfield", memberOf: `${GEO}/us` },
  [`${GEO}/springfield-township`]: { "@id": `${GEO}/springfield-township`, "@type": "t:Municipality", label: "Springfield Township", memberOf: `${GEO}/us` },
  // 🔴 New York is held ONLY as an administrative area — the measured live shape, and the row
  //    whose pick in the City box produced VATester NEW-1.
  [`${GEO}/ny-admin`]: {
    "@id": `${GEO}/ny-admin`, "@type": "t:GeoAdminArea", label: "New York", memberOf: `${GEO}/us`,
  },
  // A settlement-grain competitor, so the City box offers a MIXED list and the "lands here /
  // lands elsewhere" distinction has a control rather than being true of every row.
  [`${GEO}/york-city`]: {
    "@id": `${GEO}/york-city`, "@type": "t:City", label: "York", memberOf: `${GEO}/us`,
  },
  // Three levels, so "one hop" and "the walk to Country" give DIFFERENT answers (MX8).
  [`${GEO}/manchester`]: {
    "@id": `${GEO}/manchester`, "@type": "t:City", label: "Manchester", memberOf: `${GEO}/uk-region`,
  },
  [`${GEO}/uk-region`]: {
    "@id": `${GEO}/uk-region`, "@type": "t:GeoAdminArea", label: "Greater Manchester", memberOf: `${GEO}/uk`,
  },
  // 🔴 A row the search index returns under the City grain whose type this client CANNOT read —
  //    `@type` is absent, so `bareTypeName` yields "" and `rungOf` has no entry. It is a real
  //    live shape (`GeoGrainMap.unclassified` exists because of it) and it is the case where the
  //    honest answer is "we do not know which field this goes in".
  //
  // ⛔ THE TYPE IS OMITTED RATHER THAN FAKED, DELIBERATELY. This fixture first carried
  //    `"@type": "t:Hamlet"`, which BVedanta's typing gate FAILed at `bc4ad82` (exit 1, 75 gated
  //    terms, 1 un-adjudicated) — a term string minted by a test with no BVGATE_01 handoff, and
  //    worse, `Hamlet` is OSM's real `place=hamlet` class and the natural sixth child of
  //    `t/GeoRegion`, so this module's own architecture predicts it becoming classifiable.
  //    An absent type mints ⛔ NOTHING and exercises the same branch.
  [`${GEO}/puzzling`]: {
    "@id": `${GEO}/puzzling`, label: "Puzzling", memberOf: `${GEO}/us`,
  },
  // 🔴 THREE hops, so the deepest is NOT warmed by the option row's `immediateParent` call and
  //    can still be failed at click time — which is exactly where VATester measured the 502.
  [`${GEO}/deepcity`]: {
    "@id": `${GEO}/deepcity`, "@type": "t:City", label: "Deepcity", memberOf: `${GEO}/deep-region`,
  },
  // s8 card look: the option row now names TWO containers (Deep Region, Deeper Region), so the country is the FOURTH
  // hop and is still not warmed by the row: the click-time walk is where the 502 must land (the guard's whole point).
  [`${GEO}/deep-region`]: {
    "@id": `${GEO}/deep-region`, "@type": "t:GeoAdminArea", label: "Deep Region", memberOf: `${GEO}/deeper-region`,
  },
  [`${GEO}/deeper-region`]: {
    "@id": `${GEO}/deeper-region`, "@type": "t:GeoAdminArea", label: "Deeper Region", memberOf: `${GEO}/deep-country`,
  },
  [`${GEO}/deep-country`]: {
    "@id": `${GEO}/deep-country`, "@type": "t:Country", label: "Deepland",
  },
};
