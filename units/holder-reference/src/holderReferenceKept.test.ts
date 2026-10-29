// The WRITE-TIME reference check reads its sets live from the master.
//
// The write-time reference check (the function that admits or refuses a reference before anything is sent) must use a set read
// live from the master in that check (an in-flight read may be shared; a stored or kept set may NOT stand in; master unreachable
// gives ReferenceUnknownError, 'not known yet', nothing sent). DISPLAY reads (readReferenceVocabulary feeding pickers, field sets,
// the list) may keep using the cached readers.
// Tests: a write-time check never uses a stored or kept set (poison the store with a set that admits a kind the live master
// doesn't, and the check refuses); master down at write gives ReferenceUnknownError and 0 writes; pickers stay warm at 6 requests.
// Every expected count is a LITERAL. Fixture: fixtureMaster + withTagStandard + withWritableFields + withReferenceTerms.
import { describe, it, expect, beforeEach } from "vitest";
import { masterSource, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets, type StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import {
  addReference,
  checkReference,
  readReferenceVocabulary,
  ReferenceRefusedError,
  ReferenceUnknownError,
  writeRoleRecord,
  type ReferencePicker,
} from "./holderReference";
import { createStakeholderKindReader, createTypeTreeReader, forgetStakeholderKindReaders, type StakeholderKindSet, type TypeTree } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import type { VocabularyStore } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { fixtureMaster, RIG, t, a } from "../test/support";
import { withReferenceTerms } from "../test/fixtureReference";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { fixturePlatform, type FixturePlatform } from "../test/fixturePlatform";

type M = ReturnType<typeof fixtureMaster>;
type Fetch = (u: string, init?: RequestInit) => Promise<Response>;

const VAULT = "https://ann.example.test/vault";
const AGENT = "https://id.example.test/base/p/0b6c9a52-agent";
const KIND_KEY = (role: string) => `gilb-stakeholders.kind-set.v1:${RIG}|${role}`;
const TREE_KEY = `gilb-stakeholders.type-tree.v1:${RIG}|t/ContactPoint`;

const referenceMaster = () => withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
const children = (urls: string[]) => urls.filter((u) => u.endsWith("/children")).length;

function memoryStore(): VocabularyStore & { data: Map<string, string>; reads: number; writes: number } {
  const data = new Map<string, string>();
  const s = {
    data,
    reads: 0,
    writes: 0,
    getItem: (k: string) => (s.reads++, data.get(k) ?? null),
    setItem: (k: string, v: string) => void (s.writes++, data.set(k, v)),
  };
  return s;
}

/** The readers a page would use, over one store and one master (as a page builds them). */
function pageReaders(source: VocabularySource, store: VocabularyStore) {
  const kinds = new Map<string, ReturnType<typeof createStakeholderKindReader>>();
  const trees = new Map<string, ReturnType<typeof createTypeTreeReader>>();
  const common = { source, origin: RIG, store, defer: () => {} };
  return {
    kindReaderFor: (roleTerm: string) => {
      let r = kinds.get(roleTerm);
      if (!r) kinds.set(roleTerm, (r = createStakeholderKindReader({ ...common, roleTerm })));
      return r;
    },
    typeTreeReaderFor: (rootTerm: string) => {
      let r = trees.get(rootTerm);
      if (!r) trees.set(rootTerm, (r = createTypeTreeReader({ ...common, rootTerm })));
      return r;
    },
  };
}

/** Edit a kept entry in place: the poison. */
function poison<T>(store: ReturnType<typeof memoryStore>, key: string, edit: (set: T) => void) {
  const raw = store.data.get(key);
  if (!raw) throw new Error(`nothing kept under ${key}`);
  const kept = JSON.parse(raw) as { set: T };
  edit(kept.set);
  store.data.set(key, JSON.stringify(kept));
}

/** A kind added to a kept kind set, as a real entry would carry it. */
function addKind(set: StakeholderKindSet, name: string) {
  set.types.push({ term: t(name), name, label: null, isMember: false, parents: [set.members[0]!], members: [set.members[0]!] });
  set.names.push(name);
}

/**
 * A page that read its sets once (a first session, filling the store), then a second session over the same store, its reading
 * answered from what is kept there. `edit` poisons the store between the two. The picker's master is live (the fixture), through
 * `masterFetch`, which a test may turn off.
 */
async function warmPage(edit?: (store: ReturnType<typeof memoryStore>) => void) {
  const store = memoryStore();
  const m1 = referenceMaster();
  const s1 = masterSource({ vedaOrigin: RIG, fetchImpl: m1.fetch });
  const fieldSets: StakeholderFieldSets = await resolveFieldSets(s1);
  await readReferenceVocabulary(s1, fieldSets, pageReaders(s1, store));
  edit?.(store);

  const m: M = referenceMaster();
  let masterUp = true;
  const masterFetch: Fetch = async (u, init) => {
    if (!masterUp) throw new TypeError("Failed to fetch");
    return m.fetch(u, init);
  };
  const master = masterSource({ vedaOrigin: RIG, fetchImpl: masterFetch });
  const n0 = m.requested.length;
  const references = await readReferenceVocabulary(master, fieldSets, pageReaders(master, store));
  const displayRequests = m.requested.length - n0;

  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT);
  const picker: ReferencePicker = { platform: { origin: p.origin, fetch: p.fetch }, reading: { fieldSets, references }, master };
  const w = {
    ben: p.seed(VAULT, "t:Person", { "a:name": "Ben", "a:email": "ben@example.test" }),
    acme: p.seed(VAULT, "t:Organization", { "a:name": "Acme AS" }),
    owners: p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" }),
    systems: p.seed(VAULT, "t:SoftwareSystemGroup", { "a:name": "Our systems" }),
    project: p.seed(VAULT, "t:Project", { "a:name": "Project X" }),
  };
  return { store, m, p, picker, w, displayRequests, masterDown: () => void (masterUp = false) };
}

const writes = (p: FixturePlatform) => p.requests.filter((r) => r.method !== "GET").length;

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ReferenceRefusedError) return err.reason;
    if (err instanceof ReferenceUnknownError) return "unknown";
    throw err;
  }
  return "resolved";
}

beforeEach(() => forgetStakeholderKindReaders());

describe("the display reading still answers from the kept sets", () => {
  it("a second session's reference reading: 6 requests, 0 children listings (the warm count)", async () => {
    const { m, displayRequests } = await warmPage();
    expect(displayRequests).toBe(6);
    expect(children(m.requested)).toBe(0);
  });
});

describe("a write-time check never uses a stored or kept set", () => {
  it("party: the kept t/PartyMemberOf set admits Project, the live master does not → refused", async () => {
    const { picker, p, w } = await warmPage((s) => poison<StakeholderKindSet>(s, KIND_KEY("t/PartyMemberOf"), (set) => addKind(set, "Project")));
    // The display reading did answer from the poisoned store.
    expect(picker.reading.references!.party.names).toContain("Project");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: w.project }))).toBe("type-not-admitted");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:heldParty", carrierType: "HeldPartyFieldClaim", target: w.project }))).toBe("type-not-admitted");
    // The live set still admits what the master admits.
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: w.acme }))).toBe("resolved");
    expect(writes(p)).toBe(0);
  });

  it("membership: the kept t/SoftwareSystemMemberOf set admits Person, the live master does not → refused, and no role record is written", async () => {
    const { picker, p, w } = await warmPage((s) => poison<StakeholderKindSet>(s, KIND_KEY("t/SoftwareSystemMemberOf"), (set) => addKind(set, "Person")));
    const kept = picker.reading.references!.relations.find((r) => r.name === "SoftwareSystemMemberOf")!;
    expect(kept.playerNames).toContain("Person");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.systems }))).toBe("type-not-admitted");
    expect(await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.systems }))).toBe("type-not-admitted");
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.systems }))).toBe("type-not-admitted");
    expect(writes(p)).toBe(0);
    // The live set admits what the master admits.
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("resolved");
  });

  it("contact: the kept t/ContactPoint tree lost Email; the live master has it → the preferred channel is admitted", async () => {
    const { picker } = await warmPage((s) =>
      poison<TypeTree>(s, TREE_KEY, (tree) => void (tree.terms = tree.terms.filter((x) => !x.endsWith("/t/Email")))),
    );
    expect(picker.reading.references!.contactTypes.terms.some((x) => x.endsWith("/t/Email"))).toBe(false);
    expect(
      await reason(checkReference(picker, { vaultId: VAULT, field: "a:preferredChannel", carrierType: "Person", carrierFacts: { "a:email": "ben@example.test" }, target: a("email") })),
    ).toBe("resolved");
  });

  it("a live listing that is not complete at write time: not known yet, with nothing sent, though the kept set is whole", async () => {
    const { picker, p, w, m } = await warmPage();
    expect(picker.reading.references!.complete).toBe(true);
    m.children("Person", [{ name: "Passenger" }], false);
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: w.acme }))).toBe("unknown");
    expect(await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.owners }))).toBe("unknown");
    expect(writes(p)).toBe(0);
  });

  it("the check reads and writes nothing in the store", async () => {
    const { picker, store, w } = await warmPage();
    const [r0, w0] = [store.reads, store.writes];
    await checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners });
    await checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: w.acme });
    expect([store.reads, store.writes]).toEqual([r0, w0]);
  });
});

describe("master down at write → not known yet, 0 writes", () => {
  it("every rule and both writers: ReferenceUnknownError, nothing sent to the vault but its list reads", async () => {
    const { picker, p, w, masterDown } = await warmPage();
    masterDown();
    for (const [field, carrierType, target, facts] of [
      ["a:memberOf", "Person", w.owners, undefined],
      ["a:actsOnBehalfOf", "Person", w.acme, undefined],
      ["a:heldParty", "HeldPartyFieldClaim", w.acme, undefined],
      ["a:preferredChannel", "Person", a("email"), { "a:email": "ben@example.test" }],
    ] as const) {
      expect(await reason(checkReference(picker, { vaultId: VAULT, field, carrierType, target, ...(facts ? { carrierFacts: facts } : {}) }))).toBe("unknown");
    }
    expect(await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.owners }))).toBe("unknown");
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:actsOnBehalfOf", target: w.acme }))).toBe("unknown");
    expect(writes(p)).toBe(0);
  });

  it("no master on the picker: not known yet, 0 writes", async () => {
    const { picker, p, w } = await warmPage();
    delete picker.master;
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("unknown");
    expect(await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.owners }))).toBe("unknown");
    expect(writes(p)).toBe(0);
  });
});

describe("what one write-time check sends to the master", () => {
  const sentFor = async (run: (x: Awaited<ReturnType<typeof warmPage>>) => Promise<unknown>) => {
    const x = await warmPage();
    const n0 = x.m.requested.length;
    await run(x);
    return x.m.requested.slice(n0);
  };
  // The carrier's kind and field, the field's own term, the relations' ends and the spellings are read live too, and all four field
  // terms are read (+3 a check). The counts below are the live counts.
  const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "");
  it("a:actsOnBehalfOf: 2 spellings, t/Stakeholder, the four field terms, the declarations, the party role's term, 5 listings (14)", async () => {
    const sent = await sentFor(({ picker, w }) => checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: w.acme }));
    expect(sent.length).toBe(14);
    expect(children(sent)).toBe(5);
    expect(sent.map(path).filter((u) => !u.endsWith("/children"))).toEqual(
      expect.arrayContaining(["/base/a/playableBy", "/base/a/fieldOf", "/base/t/Stakeholder", "/base/a/actsOnBehalfOf", "/base/t/PartyMemberOf"]),
    );
  });
  it("a:memberOf: the relations' ends in one named read, then only the group's relation's kinds (15), ⛔ no other relation's listings", async () => {
    const sent = await sentFor(({ picker, w }) => checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }));
    expect(sent.length).toBe(15);
    expect(children(sent)).toBe(5);
    expect(sent.filter((u) => u.endsWith("/children") && (u.includes("SoftwareSystem") || u.includes("ObjectGroup") || u.includes("Project"))).length).toBe(0);
  });
  it("a:preferredChannel: 2 spellings, t/Stakeholder, the four field terms, the channel's term, the declarations, the t/ContactPoint tree (15)", async () => {
    const sent = await sentFor(({ picker }) =>
      checkReference(picker, { vaultId: VAULT, field: "a:preferredChannel", carrierType: "Person", carrierFacts: { "a:email": "ben@example.test" }, target: a("email") }),
    );
    expect(sent.length).toBe(15);
    expect(children(sent)).toBe(6);
  });
  it("a role record: t/Stakeholder, 2 spellings, the relations' ends in one named read, the group's relation's 5 listings (9)", async () => {
    const sent = await sentFor(({ picker, w }) => writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: w.ben, group: w.owners }));
    expect(sent.length).toBe(9);
  });
});
