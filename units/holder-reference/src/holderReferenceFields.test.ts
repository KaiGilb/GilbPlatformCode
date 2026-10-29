// The page's reading picks neither the field's rule nor the size of the vault list read.
//
//   - The saved reading's guess must not choose the rule. At write time all four reference-field terms are read live (in parallel,
//     shared within the call) and the rule is decided from them; a key spelled by two of them is refused (not known which rule).
//     At most +3 requests per write call.
//   - A 500 on one guessed term no longer decides; only the live terms decide; a needed term that fails gives "not known yet".
//   - The extra type names added from the saved reading to the typed list read are validated (well-formed type names only) and
//     capped so the request never exceeds the platform's limit (at most 100 distinct); if the cap would drop a name the live check
//     needs, it is read in pages rather than dropped.
// This file covers the refusal's own reason, every order of the reading, a needed term that fails, the request count being the same
// whatever the reading, and the list read's names and pages. Every expected value is a LITERAL. Fixture: fixtureMaster +
// withTagStandard + withWritableFields + withReferenceTerms, with the real platform's type-token rules (GilbPlatform
// src/lws/records.ts) in front of the fixture platform.
import { describe, it, expect, beforeEach } from "vitest";
import { masterSource, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { readReferenceReading } from "../test/readingOf";
import { addReference, checkReference, readReferenceVocabulary, ReferenceRefusedError, ReferenceUnknownError, type ReferencePicker } from "./holderReference";
import { createStakeholderKindReader, createTypeTreeReader, forgetStakeholderKindReaders } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import type { VocabularyStore } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { fixtureMaster, RIG, t, CONTEXT } from "../test/support";
import { withReferenceTerms } from "../test/fixtureReference";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { fixturePlatform, type FixturePlatform } from "../test/fixturePlatform";

type M = ReturnType<typeof fixtureMaster>;
const VAULT = "https://ann.example.test/vault";
const AGENT = "https://id.example.test/base/p/fields-agent";
const referenceMaster = () => withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
const ref = (iri: string) => ({ "@id": iri });
const TYPE_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

function memoryStore(): VocabularyStore {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}
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

/** The real platform's typed-list rules in front of the fixture: a malformed type, or more than 100 distinct, is a 400. */
function realTypeRules(p: FixturePlatform) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (/\/lws\/vault\/[^/]+\/records$/.test(u.pathname)) {
      const names = [...new Set(u.searchParams.getAll("type"))];
      if (names.some((n) => !TYPE_TOKEN.test(n)) || names.length > 100) return new Response(JSON.stringify({ error: "bad type filter" }), { status: 400 });
    }
    return p.fetch(url as never, init);
  };
}

async function page(opts: { m1?: (m: M) => void; m2?: (m: M) => void; poison?: (r: any) => void; seed?: (p: FixturePlatform) => Record<string, string> } = {}) {
  const m1 = referenceMaster();
  opts.m1?.(m1);
  const reading = await pageOver(masterSource({ vedaOrigin: RIG, fetchImpl: m1.fetch }), memoryStore());
  opts.poison?.(reading);
  const m2 = referenceMaster();
  opts.m2?.(m2);
  const master = masterSource({ vedaOrigin: RIG, fetchImpl: m2.fetch });
  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT);
  const picker: ReferencePicker = { platform: { origin: p.origin, fetch: realTypeRules(p) as never }, reading, master };
  const w = {
    ben: p.seed(VAULT, "t:Person", { "a:name": "Ben" }),
    acme: p.seed(VAULT, "t:Organization", { "a:name": "Acme AS" }),
    owners: p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" }),
    ...(opts.seed?.(p) ?? {}),
  };
  return { picker, p, w, m2, masterSent: () => m2.requested.length };
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
/** The typed-list reads the platform was sent, each as its distinct type names. */
const listReads = (p: FixturePlatform) =>
  p.requests.filter((r) => r.method === "GET" && /\/lws\/vault\/[^/]+\/records\?/.test(r.url)).map((r) => [...new Set(new URL(r.url).searchParams.getAll("type"))]);

/** The live master spells the key a:memberOf under a/actsOnBehalfOf's own term too. */
const twoFieldsOneKey = (m: M) => {
  const url = `${RIG}/base/a/actsOnBehalfOf`;
  m.docs.set(url, { ...(m.docs.get(url) as object), "a:predicateAttribute": "a:memberOf" });
};
/** The reading names the field with `rule` first, and lists the key a:memberOf among its spellings. */
const first = (rule: string) => (r: any) => {
  const f = r.references.fields.find((x: any) => x.rule === rule);
  f.spelling = { ...f.spelling, readKeys: [...f.spelling.readKeys, "a:memberOf"] };
  r.references.fields = [f, ...r.references.fields.filter((x: any) => x !== f)];
};
const RULES = ["membership", "party", "held-party", "contact-term"];
const noReading = (r: any) => {
  r.references = undefined;
};

beforeEach(() => forgetStakeholderKindReaders());

describe("the four field terms are read live, and a key two of them spell is refused", () => {
  it("two fields spell a:memberOf live: a:memberOf Person→Owners is refused field-ambiguous, 0 writes, whatever the reading names first", async () => {
    for (const poison of [undefined, noReading, ...RULES.map(first)]) {
      const { picker, p, w } = await page({ m1: twoFieldsOneKey, m2: twoFieldsOneKey, poison });
      expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("refused:field-ambiguous");
      expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.owners }))).toBe("refused:field-ambiguous");
      expect(writes(p)).toBe(0);
    }
  });
  it("the live master alone spells the key twice (the reading honest, from a master that did not): refused field-ambiguous", async () => {
    const { picker, w } = await page({ m2: twoFieldsOneKey });
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("refused:field-ambiguous");
  });
  it("one write call reads each of the four field terms once, and the same terms and count whatever the reading names first", async () => {
    const counts: number[] = [];
    for (const poison of [undefined, noReading, ...RULES.map(first)]) {
      const x = await page({ poison });
      const n0 = x.masterSent();
      expect(await reason(addReference(x.picker, { vaultId: VAULT, agent: AGENT, carrier: x.w.ben, field: "a:memberOf", target: x.w.owners }))).toBe("admitted");
      for (const slug of ["memberOf", "actsOnBehalfOf", "heldParty", "preferredChannel"]) expect(x.m2.count(`/base/a/${slug}`)).toBe(1);
      counts.push(x.masterSent() - n0);
    }
    expect(counts).toEqual([15, 15, 15, 15, 15, 15]);
  });
});

describe("only the live terms decide; a needed term that fails is 'not known yet'", () => {
  it("a/memberOf answers 500: a:memberOf Person→Owners is not known yet, 0 writes, whatever the reading names first", async () => {
    for (const poison of [undefined, ...RULES.map(first)]) {
      const { picker, p, w } = await page({ m2: (m) => m.status.set(`${RIG}/base/a/memberOf`, 500), poison });
      expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("unknown");
      expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.owners }))).toBe("unknown");
      expect(writes(p)).toBe(0);
    }
  });
  it("a key no answering term spells while one term answers 500: not known yet; with all four answering: not-a-reference-field", async () => {
    const down = await page({ m2: (m) => m.status.set(`${RIG}/base/a/heldParty`, 500) });
    expect(await reason(checkReference(down.picker, { vaultId: VAULT, field: "a:bogusField", carrierType: "Person", target: down.w.owners }))).toBe("unknown");
    const up = await page();
    expect(await reason(checkReference(up.picker, { vaultId: VAULT, field: "a:bogusField", carrierType: "Person", target: up.w.owners }))).toBe("refused:not-a-reference-field");
  });
});

/** The live master (and the page's) gains `n` kinds under Organization, so the kinds of t/PartyMemberOf number more than 100. */
const manyOrganizationKinds = (n: number) => (m: M) => {
  const kids = Array.from({ length: n }, (_, i) => ({ name: `Org${i}`, label: `Org ${i}` }));
  m.children("Organization", kids);
  for (const k of kids) {
    m.children(k.name, []);
    m.put(`t/${k.name}`, { "@context": CONTEXT, "@id": t(k.name), "a:label": k.label, "a:subTypeOf": ref(t("Organization")) });
  }
};

describe("the vault list read names well-formed types only, at most 100 a request, in pages when the live check needs more", () => {
  it("the reading adds a malformed name (x:y) and 101 extra names: admitted, and every list read sends well-formed names, at most 100", async () => {
    const poison = (r: any) => {
      const person = r.fieldSets.kinds.types.find((x: any) => x.name === "Person");
      for (const n of ["x:y", ...Array.from({ length: 101 }, (_, i) => `Bogus${i}`)]) r.fieldSets.kinds.types.push({ ...person, name: n, term: t(n) });
    };
    const { picker, p, w } = await page({ poison });
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: w.acme }))).toBe("admitted");
    expect(await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.owners }))).toBe("admitted");
    expect(writes(p)).toBe(1);
    const reads = listReads(p);
    expect(reads.length).toBeGreaterThan(0);
    for (const names of reads) {
      expect(names.length).toBeLessThanOrEqual(100);
      expect(names.filter((n) => !TYPE_TOKEN.test(n))).toEqual([]);
    }
    expect(reads.flat()).not.toContain("x:y");
  });
  it("the live check admits 120 kinds: a target of the last one is found by reading in pages of at most 100, never by dropping a name", async () => {
    const { picker, p, w } = await page({
      m1: manyOrganizationKinds(120),
      m2: manyOrganizationKinds(120),
      seed: (pl) => ({ last: pl.seed(VAULT, "t:Org119", { "a:name": "Org 119 AS" }) }),
    });
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: (w as any).last }))).toBe("admitted");
    const reads = listReads(p);
    for (const names of reads) expect(names.length).toBeLessThanOrEqual(100);
    expect(reads.flat()).toContain("Org119");
    expect(reads.length).toBe(2);
  });
});
