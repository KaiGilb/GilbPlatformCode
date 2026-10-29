// The master as the reference check reads it, refreshed from the live master.
//
// The fixture served no `a:playableBy` on the role relations; it is a copy and has to be refreshed from the master. This layer does that, on top of
// `fixtureMaster` + `withTagStandard` + `withWritableFields`, whose 2026-09-30 pins the older
// tests keep. Read live, read-only, at 2026-10-02T09:11:51Z–09:11:57Z
// (`GET https://ontology.platform.example.test/base/<path>`, `Accept: application/ld+json`, each 200):
//   t/Stakeholder            a:playableBy, 9 refs: the 7 of 09-30 + ObjectGroup, ObjectMemberOf
//   t/PartyMemberOf          a:playableBy Person, Organization, PartyGroup, AiAgent;
//                            a:endpoint reference end t/PartyGroup; a:typeAttribute t:PartyMemberOf
//   t/SoftwareSystemMemberOf a:playableBy SoftwareSystem; reference end t/SoftwareSystemGroup
//   t/ObjectMemberOf         a:playableBy Person, Organization, PartyGroup, SoftwareSystem,
//                            Project, Standard; reference end t/ObjectGroup
//   t/SoftwareSystemGroup    a:subTypeOf t/ObjectGroup
//   a/endpoint               a:predicateAttribute a:endpoint
//   a/memberOf               a:memberOf, reference:@id, multi, a:fieldOf Person, Organization, PartyGroup
//   a/heldParty              a:heldParty, reference-edge:@id, single
//   a/actsOnBehalfOf         a:actsOnBehalfOf, reference, multi, a:fieldOf Person, Organization
//   a/preferredChannel       a:preferredChannel, reference:@id, single, a:fieldOf Person, Organization
//   a/email                  @id a/email, a:typeUri t/Email, a:subTypeOf t/ElectronicContactPoint
//   t/ContactPoint/children  ElectronicContactPoint, PhysicalContactPoint (complete)
// The documents are trimmed to the facts the check reads. ⚠ ILLUSTRATIVE, ⛔ not measured: the
// children of Electronic/Physical Contact Point beyond Email (Phone, Postal Address), the
// children of Standard (Process) and the is-a chains above Project, Standard and Object Group.
import type { TermDoc } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { CONTEXT, RIG, t, a, type FixtureMaster } from "./support";

const ref = (iri: string) => ({ "@id": iri });

/** The nine players `t/Stakeholder` served at 2026-10-02T09:11:51Z, in served order. */
export const LIVE_PLAYERS = [
  "Person",
  "Organization",
  "PartyGroup",
  "PartyMemberOf",
  "SoftwareSystem",
  "SoftwareSystemGroup",
  "SoftwareSystemMemberOf",
  "ObjectGroup",
  "ObjectMemberOf",
];

const endpoint = (subject: string, reference: string) => [
  { "a:card": "1", "a:role": "subject", "a:order": 0, "a:directed": true, "a:endpointType": ref(t(subject)) },
  { "a:card": "1", "a:role": "reference", "a:order": 1, "a:directed": true, "a:endpointType": ref(t(reference)) },
];

/** The role relations as served: players, reference end, write type, parent. */
export const ROLE_RELATIONS: Record<string, { players: string[]; subject: string; group: string }> = {
  PartyMemberOf: { players: ["Person", "Organization", "PartyGroup", "AiAgent"], subject: "Substance", group: "PartyGroup" },
  SoftwareSystemMemberOf: { players: ["SoftwareSystem"], subject: "SoftwareSystem", group: "SoftwareSystemGroup" },
  ObjectMemberOf: { players: ["Person", "Organization", "PartyGroup", "SoftwareSystem", "Project", "Standard"], subject: "Thing", group: "ObjectGroup" },
};

function currentListing(m: FixtureMaster): TermDoc[][] {
  const pages: TermDoc[][] = [];
  let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`;
  while (url) {
    const page = m.docs.get(url) as { "@graph": TermDoc[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(page["@graph"]);
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  return pages;
}

export function withReferenceTerms(m: FixtureMaster): FixtureMaster {
  m.put("t/Stakeholder", {
    "@context": CONTEXT,
    "@id": t("Stakeholder"),
    "a:label": "Stakeholder",
    "a:playableBy": LIVE_PLAYERS.map((n) => ref(t(n))),
    "a:subTypeOf": ref(t("Type")),
  });

  for (const [name, r] of Object.entries(ROLE_RELATIONS)) {
    m.put(`t/${name}`, {
      "@context": CONTEXT,
      "@id": t(name),
      "a:label": name,
      "a:encoding": "reified:role-plane",
      "a:nodeKind": "relation",
      "a:typeAttribute": `t:${name}`,
      "a:playableBy": r.players.map((n) => ref(t(n))),
      "a:endpoint": endpoint(r.subject, r.group),
      "a:subTypeOf": ref(t("MemberOf")),
    });
    m.children(name, []);
  }

  // Types the new kinds walk through, with the served shape.
  const up: Record<string, { label: string; parent: string }> = {
    ObjectGroup: { label: "Object Group", parent: "Information" },
    SoftwareSystemGroup: { label: "Software System Group", parent: "ObjectGroup" },
    Project: { label: "Project", parent: "Intent" },
    Intent: { label: "Intent", parent: "Thing" },
    Standard: { label: "Standard", parent: "Definition" },
    Definition: { label: "Definition", parent: "Thing" },
    Process: { label: "Process", parent: "Standard" },
  };
  for (const [name, { label, parent }] of Object.entries(up)) {
    m.put(`t/${name}`, { "@context": CONTEXT, "@id": t(name), "a:label": label, "a:subTypeOf": ref(t(parent)) });
  }
  m.put("t/Thing", { "@context": CONTEXT, "@id": t("Thing"), "a:label": "Thing" });
  m.children("ObjectGroup", [{ name: "SoftwareSystemGroup", label: "Software System Group" }]);
  m.children("SoftwareSystemGroup", []);
  m.children("Project", []);
  m.children("Standard", [{ name: "Process", label: "Process" }]);
  m.children("Process", []);
  m.children("Organization", []);
  m.children("PartyGroup", []);

  // The contact-point types.
  m.children("ContactPoint", [
    { name: "ElectronicContactPoint", label: "Electronic Contact Point" },
    { name: "PhysicalContactPoint", label: "Physical Contact Point" },
  ]);
  m.children("ElectronicContactPoint", [{ name: "Email", label: "Email" }, { name: "Phone", label: "Phone" }]);
  m.children("PhysicalContactPoint", [{ name: "PostalAddress", label: "Postal Address" }]);
  for (const n of ["Email", "Phone", "PostalAddress"]) m.children(n, []);

  // The predicates, each at its own address.
  m.put("a/endpoint", { "@context": CONTEXT, "@id": a("endpoint"), "a:predicateAttribute": "a:endpoint", "a:encoding": "inline-literal:json" });
  const predicate = (slug: string, encoding: string, cardinality: string) =>
    m.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}`, "a:encoding": encoding, "a:cardinality": cardinality });
  predicate("memberOf", "reference:@id", "multi");
  predicate("heldParty", "reference-edge:@id", "single");
  predicate("actsOnBehalfOf", "reference", "multi");
  predicate("preferredChannel", "reference:@id", "single");
  // An attribute term at its own route answers with its a/ address and names the type it defines.
  m.put("a/email", {
    "@context": CONTEXT,
    "@id": a("email"),
    "a:predicateAttribute": "a:email",
    "a:typeUri": t("Email"),
    "a:subTypeOf": ref(t("ElectronicContactPoint")),
  });
  m.put("a/name", { "@context": CONTEXT, "@id": a("name"), "a:predicateAttribute": "a:name", "a:typeUri": t("Name") });

  // The field declarations for the reference fields, as listing nodes (the t/ form).
  const pages = currentListing(m);
  pages.push([
    {
      "@id": t("MemberOf"),
      "a:predicateAttribute": "a:memberOf",
      "a:label": "member-of",
      "a:encoding": "reference:@id",
      "a:cardinality": "multi",
      "a:fieldOf": ["Person", "Organization", "PartyGroup"].map((n) => ref(t(n))),
    },
    {
      "@id": t("PreferredContactChannel"),
      "a:predicateAttribute": "a:preferredChannel",
      "a:label": "Preferred Contact Channel",
      "a:encoding": "reference:@id",
      "a:cardinality": "single",
      "a:fieldOf": [ref(t("Person")), ref(t("Organization"))],
    },
    {
      // Approved on the master, not one of the ruled shapes: stays refused at create.
      "@id": t("Skill"),
      "a:predicateAttribute": "a:skill",
      "a:label": "Skill",
      "a:encoding": "reference-valued:@id",
      "a:fieldOf": [ref(t("Person"))],
    },
  ]);
  // The actsOnBehalfOf node of withWritableFields declares no cardinality; the master says multi.
  for (const page of pages) for (const node of page) if (node["@id"] === t("ActsOnBehalfOf")) node["a:cardinality"] = "multi";
  m.listing(pages);
  return m;
}
