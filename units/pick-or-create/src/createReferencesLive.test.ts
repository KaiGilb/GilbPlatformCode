// Everything the write-time reference check uses to admit a write is read live, within the write call.
//
// EVERYTHING the write-time reference check uses to ADMIT a write is read live from the master within that write call: the
// carrier's stakeholder kind and its field set for the predicate, the role relation's reference end/group type, the
// `a:playableBy` and other predicate keys it uses for live reads, the role kinds. Nothing from a stored or kept set may admit OR
// refuse. Within ONE write call the live reads may be shared (one live reading for a 412 retry inside the same addReference call,
// and for K targets in one create). Display reads stay cached. The live count is kept as low as possible.
// `createKept.test.ts` poisons the store towards ADMITTING. This file covers the other way (a kept set that would REFUSE what the
// live master admits), the live master refusing what the kept reading admits, the sharing within one call, and the write-time
// request counts. Every expected value is a LITERAL. Fixture: fixtureMaster + withTagStandard + withWritableFields +
// withReferenceTerms.
import { describe, it, expect, beforeEach } from "vitest";
import { masterSource, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { createRecord, CreateRefusedError, readPickerVocabulary, type Picker } from "./pickOrCreate";
import { addReference, checkReference, readReferenceVocabulary, ReferenceRefusedError, ReferenceUnknownError, type ReferencePicker } from "@kaigilb/gilbplatformcode-holder-reference";
import { createStakeholderKindReader, createTypeTreeReader, forgetStakeholderKindReaders } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import type { VocabularyStore } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import type { TermDoc } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { fixtureMaster, RIG, t } from "../test/support";
import { withReferenceTerms } from "../test/fixtureReference";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { fixturePlatform, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";

type M = ReturnType<typeof fixtureMaster>;
const VAULT = "https://ann.example.test/vault";
const HOLDER = `${VAULT_HOST}/base/e/ann-self-card`;
const AGENT = "https://id.example.test/base/p/m3k-r5-agent";
const referenceMaster = () => withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));

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
  const reading = await readPickerVocabulary(master, fieldSets, {});
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
  const picker: ReferencePicker & Picker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master };
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
    if (err instanceof ReferenceRefusedError || err instanceof CreateRefusedError) return `refused:${err.reason}`;
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

beforeEach(() => forgetStakeholderKindReaders());

describe("the carrier's kind and its field are read live", () => {
  it("the live master no longer offers a:actsOnBehalfOf on Person, the kept reading still does: refused, 0 writes", async () => {
    const { picker, p, w } = await page({ m2: undeclare("a:actsOnBehalfOf", "Person") });
    const person = Object.values(picker.reading.fieldSets.byKind).find((k) => k.name === "Person")!;
    expect(person.fields.some((f) => f.readKeys.includes("a:actsOnBehalfOf"))).toBe(true); // the kept reading offers it
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: w.acme }))).toBe("refused:carrier-type-not-admitted");
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:actsOnBehalfOf", target: w.acme }))).toBe("refused:carrier-type-not-admitted");
    expect(
      await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:actsOnBehalfOf": { "@id": w.acme } } })),
    ).toBe("refused:carrier-type-not-admitted");
    expect(writes(p)).toBe(0);
  });
});

// All four field terms are read in each call, +3 on the counts of a check that read fewer.
describe("one write call reads each live set once", () => {
  it("a create with a:memberOf of 2 groups: the second target sends 0 more requests to the master (15 in all)", async () => {
    const one = await page();
    const n1 = one.masterSent();
    expect(
      await reason(createRecord(one.picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:memberOf": { "@id": one.w.owners } } })),
    ).toBe("admitted");
    const two = await page();
    const n2 = two.masterSent();
    expect(
      await reason(
        createRecord(two.picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:memberOf": [{ "@id": two.w.owners }, { "@id": two.w.board }] } }),
      ),
    ).toBe("admitted");
    expect(one.masterSent() - n1).toBe(15);
    expect(two.masterSent() - n2).toBe(15);
  });
});
