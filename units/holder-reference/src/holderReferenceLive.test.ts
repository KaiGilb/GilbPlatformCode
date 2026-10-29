// Everything the write-time reference check uses to admit a write is read live, within the write call.
//
// EVERYTHING the write-time reference check uses to ADMIT a write is read live from the master within that write call: the
// carrier's stakeholder kind and its field set for the predicate, the role relation's reference end/group type, the `a:playableBy`
// and other predicate keys it uses for live reads, the role kinds. Nothing from a stored or kept set may admit OR refuse. Within
// ONE write call the live reads may be shared (one live reading for a 412 retry inside the same addReference call, and for K
// targets in one create) - that counts as live. Display reads stay cached. The live count is kept as low as possible.
// This file covers a kept set that would REFUSE what the live master admits, the live master refusing what the kept reading
// admits, the sharing within one call, and the write-time request counts (the poisoning of the store towards ADMITTING is in
// `holderReferenceKept.test.ts`). Every expected value is a LITERAL. Fixture: fixtureMaster + withTagStandard +
// withWritableFields + withReferenceTerms.
import { describe, it, expect, beforeEach } from "vitest";
import { masterSource, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { readReferenceReading } from "../test/readingOf";
import { addReference, checkReference, readReferenceVocabulary, ReferenceRefusedError, ReferenceUnknownError, writeRoleRecord, type ReferencePicker } from "./holderReference";
import { createStakeholderKindReader, createTypeTreeReader, forgetStakeholderKindReaders } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import type { VocabularyStore } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import type { TermDoc } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { fixtureMaster, RIG, t, CONTEXT } from "../test/support";
import { withReferenceTerms, LIVE_PLAYERS } from "../test/fixtureReference";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { fixturePlatform, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";

type M = ReturnType<typeof fixtureMaster>;
const VAULT = "https://ann.example.test/vault";
const HOLDER = `${VAULT_HOST}/base/e/kai-self-card`;
const AGENT = "https://id.example.test/base/p/live-agent";
const referenceMaster = () => withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
const ref = (iri: string) => ({ "@id": iri });

function memoryStore(): VocabularyStore {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

/** A page as an app builds it: the kind set through the cached reader, field sets from it, the reference reading. */
async function pageOver(master: VocabularySource, store: VocabularyStore) {
  const common = { source: master, origin: RIG, store, defer: () => {} };
  const kinds = new Map<string, ReturnType<typeof createStakeholderKindReader>>();
  const readers = {
    kindReaderFor: (roleTerm: string) => kinds.get(roleTerm) ?? (kinds.set(roleTerm, createStakeholderKindReader({ ...common, roleTerm })), kinds.get(roleTerm)!),
    typeTreeReaderFor: (rootTerm: string) => createTypeTreeReader({ ...common, rootTerm }),
  };
  const kindSet = await readers.kindReaderFor("t/Stakeholder").get();
  const fieldSets = await resolveFieldSets(master, { kindSet });
  const references = await readReferenceVocabulary(master, fieldSets, readers);
  const reading = await readReferenceReading(master, fieldSets, {});
  return { ...reading, references };
}

/** The page's reading is made on m1 (the kept one); the picker's master is m2, live. */
async function page(opts: { m1?: (m: M) => void; m2?: (m: M) => void } = {}) {
  const m1 = referenceMaster();
  opts.m1?.(m1);
  const reading = await pageOver(masterSource({ vedaOrigin: RIG, fetchImpl: m1.fetch }), memoryStore());
  const m2 = referenceMaster();
  opts.m2?.(m2);
  const master = masterSource({ vedaOrigin: RIG, fetchImpl: m2.fetch });
  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT);
  const picker: ReferencePicker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master };
  const w = {
    ben: p.seed(VAULT, "t:Person", { "a:name": "Ben" }),
    acme: p.seed(VAULT, "t:Organization", { "a:name": "Acme AS" }),
    owners: p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" }),
    board: p.seed(VAULT, "t:PartyGroup", { "a:name": "Board" }),
  };
  const masterSent = () => m2.requested.length;
  return { picker, p, w, m2, masterSent };
}

const writes = (p: FixturePlatform) => p.requests.filter((r) => r.method !== "GET").length;
async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ReferenceRefusedError) return `refused:${err.reason}`;
    if (err instanceof ReferenceUnknownError) return "unknown";
    return `error:${(err as Error).name}: ${(err as Error).message}`;
  }
  return "admitted";
}

/** The master's listing pages, to edit a declaration in place. */
function listingPages(m: M): TermDoc[][] {
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

/** The live master drops `typeName` from the a:fieldOf of every declaration spelled `predicateAttribute`. */
const undeclare = (predicateAttribute: string, typeName: string) => (m: M) => {
  const pages = listingPages(m);
  for (const page of pages)
    for (const node of page)
      if (node["a:predicateAttribute"] === predicateAttribute) {
        const on = node["a:fieldOf"];
        node["a:fieldOf"] = (Array.isArray(on) ? on : [on]).filter((x) => (x as { "@id": string })["@id"] !== t(typeName));
      }
  m.listing(pages);
};

/** The live master gains a role relation TeamMemberOf (Person plays it, its reference end is Team). */
const addTeamRelation = (m: M) => {
  m.put("t/Stakeholder", { "@context": CONTEXT, "@id": t("Stakeholder"), "a:label": "Stakeholder", "a:playableBy": [...LIVE_PLAYERS, "TeamMemberOf"].map((n) => ref(t(n))), "a:subTypeOf": ref(t("Type")) });
  m.put("t/TeamMemberOf", {
    "@context": CONTEXT,
    "@id": t("TeamMemberOf"),
    "a:label": "TeamMemberOf",
    "a:typeAttribute": "t:TeamMemberOf",
    "a:playableBy": [ref(t("Person"))],
    "a:endpoint": [
      { "a:role": "subject", "a:endpointType": ref(t("Person")) },
      { "a:role": "reference", "a:endpointType": ref(t("Team")) },
    ],
    "a:subTypeOf": ref(t("MemberOf")),
  });
  m.put("t/Team", { "@context": CONTEXT, "@id": t("Team"), "a:label": "Team", "a:subTypeOf": ref(t("Information")) });
  m.children("TeamMemberOf", []);
  m.children("Team", []);
};

/** The live master gains a kind Employee under Person. */
const addEmployee = (m: M) => {
  m.children("Person", [{ name: "Passenger", label: "Passenger" }, { name: "Employee", label: "Employee" }]);
  m.children("Employee", []);
  m.put("t/Employee", { "@context": CONTEXT, "@id": t("Employee"), "a:label": "Employee", "a:subTypeOf": ref(t("Person")) });
};

beforeEach(() => forgetStakeholderKindReaders());

describe("the carrier's kind and its field are read live", () => {
  it("a kept reading that would REFUSE (Person's field set and kind gone, the reading not whole) does not: the live master admits", async () => {
    const { picker, p, w } = await page();
    const fs = picker.reading.fieldSets;
    const byKind = Object.fromEntries(Object.entries(fs.byKind).filter(([, k]) => k.name !== "Person"));
    const kinds = { ...fs.kinds, types: fs.kinds.types.filter((k) => k.name !== "Person") };
    picker.reading.fieldSets = { ...fs, byKind, kinds, complete: false, incompleteAt: ["kept: poisoned"] };
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: w.acme }))).toBe("admitted");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("admitted");
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:actsOnBehalfOf", target: w.acme }))).toBe("admitted");
    expect(writes(p)).toBe(1);
  });
  it("a carrier of a kind the kept reading does not know (Employee, new under Person on the master): admitted, 1 PATCH", async () => {
    const { picker, p, w } = await page({ m2: addEmployee });
    expect(picker.reading.fieldSets.kinds.types.some((k) => k.name === "Employee")).toBe(false);
    const ann = p.seed(VAULT, "t:Employee", { "a:name": "Ann" });
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: ann, field: "a:actsOnBehalfOf", target: w.acme }))).toBe("admitted");
    expect(writes(p)).toBe(1);
  });
});

describe("the role relations and their ends are read live", () => {
  it("a relation the kept reading does not know (TeamMemberOf, end Team): a:memberOf Person→Team and the role record are admitted", async () => {
    const { picker, p, w } = await page({ m2: addTeamRelation });
    expect(picker.reading.references!.relations.some((r) => r.groupName === "Team")).toBe(false);
    const team = p.seed(VAULT, "t:Team", { "a:name": "Core team" });
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: team }))).toBe("admitted");
    expect(await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: team }))).toBe("admitted");
    expect(p.requests.filter((r) => r.method === "PUT").length).toBe(1);
  });
  it("a kept reading with no relations at all does not refuse: the live master's PartyMemberOf admits Person→Owners", async () => {
    const { picker, w } = await page();
    picker.reading.references = { ...picker.reading.references!, relations: [] };
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("admitted");
    expect(await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.owners }))).toBe("admitted");
  });
});

describe("the predicate spellings the live reads use are the master's", () => {
  it("the reading's a:playableBy and a:fieldOf spellings poisoned: the check still admits Person→Acme and Person→Owners", async () => {
    const { picker, w } = await page();
    const pr = picker.reading.fieldSets.kinds.predicates;
    pr.playableBy = { ...pr.playableBy, readKeys: ["a:nothingHere"] };
    pr.fieldOf = { ...pr.fieldOf, readKeys: ["a:nothingHere"] };
    pr.subTypeOf = { ...pr.subTypeOf, readKeys: ["a:nothingHere"] };
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: w.acme }))).toBe("admitted");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("admitted");
  });
  it("the reading's own spelling of the field poisoned (a:memberOf named as a:actsOnBehalfOf's): the live term decides", async () => {
    const { picker, w } = await page();
    const refs = picker.reading.references!;
    picker.reading.references = { ...refs, fields: refs.fields.map((f) => (f.rule === "party" ? { ...f, spelling: { ...f.spelling, readKeys: ["a:memberOf"], writeKey: "a:memberOf" } } : f)) };
    const ok = await checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners });
    expect(ok.field.rule).toBe("membership");
    expect(ok.writeKey).toBe("a:memberOf");
  });
});

// All four field terms are read in each call, +3 on the counts of a check that read fewer.
describe("one write call reads each live set once", () => {
  it("addReference with one 412: the retry sends 0 more requests to the master (15 in all)", async () => {
    const a1 = await page();
    const n1 = a1.masterSent();
    expect(await reason(addReference(a1.picker, { vaultId: VAULT, agent: AGENT, carrier: a1.w.ben, field: "a:memberOf", target: a1.w.owners }))).toBe("admitted");
    const once = a1.masterSent() - n1;
    const a2 = await page();
    a2.p.failNext("PATCH", "/lws/r/", 412);
    const n2 = a2.masterSent();
    expect(await reason(addReference(a2.picker, { vaultId: VAULT, agent: AGENT, carrier: a2.w.ben, field: "a:memberOf", target: a2.w.owners }))).toBe("admitted");
    expect(a2.p.requests.filter((r) => r.method === "PATCH").length).toBe(2);
    expect(once).toBe(15);
    expect(a2.masterSent() - n2).toBe(15);
  });
  it("the next call reads again: two addReference calls send 15 each", async () => {
    const x = await page();
    const n0 = x.masterSent();
    await addReference(x.picker, { vaultId: VAULT, agent: AGENT, carrier: x.w.ben, field: "a:memberOf", target: x.w.owners });
    const first = x.masterSent() - n0;
    await addReference(x.picker, { vaultId: VAULT, agent: AGENT, carrier: x.w.ben, field: "a:memberOf", target: x.w.board });
    expect(first).toBe(15);
    expect(x.masterSent() - n0).toBe(30);
  });
});
