// Ported from `gilb-stakeholders` `test/fieldSetReadSpeed-22d.test.ts` at 0a261488: 16 of its 18 tests (the other two call only
// `resolveStakeholderKinds` and are in `stakeholder-kinds`). The source's longest-chain test counted real milliseconds; here the requests run on a
// logical clock (one event per start and per end, each answer held back by a fixed number of microtask turns), so no test waits on the
// wall clock. The whole field-set read, and the kinds read it rests on, fit the page's latency bands with the same answer as a
// one-request-at-a-time read. How it is pinned here:
//
//   D1  the carrier selector is asked first, right after the `a/fieldOf` term that names the spelling; a master without the selector
//       refuses after those two requests, with no kind or type read
//   D2  the type terms of every walk up are read through the opt-in listing's named read (`?status=all&type=...`), one request per level,
//       never one per term; no request names more than the door's 100
//   D3  the answer equals the answer of a read made one term at a time (a source without `terms`), and equals it on a master that
//       ignores `type` (it falls back to reading each term)
//   D4  reads that do not wait on each other are made at the same time: the longest chain of requests, each starting after the one before
//       it ended, is bounded
//   D5  a term the named read does not carry is read on its own, and fails as that read fails
//   D6  an IRI outside /base/t/<Name> is read on its own; each named read checks back
//
// The fixture master serves the named read as GilbPlatform serves it (`test/support.ts` `namedRead`).
import { describe, it, expect } from "vitest";
import { CarrierSelectorMissingError, VocabularyUnavailableError, masterSource, NAMED_READ_MAX, type TermFetch, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "./fieldSets";
import { fixtureMaster, RIG, t, a, type FixtureMaster } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";

const source = (m: FixtureMaster, fetchImpl: TermFetch = m.fetch) => masterSource({ vedaOrigin: RIG, fetchImpl });
/** The same master, read one term at a time: the source without `terms`. */
const oneAtATime = (m: FixtureMaster, fetchImpl: TermFetch = m.fetch): VocabularySource => {
  const s = source(m, fetchImpl);
  return { termIri: s.termIri, term: s.term, children: s.children, carriersOf: s.carriersOf };
};
const isNamed = (u: string) => new URL(u).searchParams.has("type");
const isSingleTerm = (u: string) => /\/base\/t\/[^/?]+$/.test(new URL(u).pathname);

/** A fetch that answers after a fixed number of microtask turns and records each request's start and end on a logical clock. */
function timed(m: FixtureMaster) {
  const log: { url: string; start: number; end: number }[] = [];
  let clock = 0;
  const f: TermFetch = async (url, init) => {
    const start = ++clock;
    for (let i = 0; i < 30; i++) await Promise.resolve();
    const res = await m.fetch(url, init);
    log.push({ url, start, end: ++clock });
    return res;
  };
  return { f, log };
}
/** The longest chain of requests in which each starts after the one before it ended. */
function longestChain(log: { start: number; end: number }[]): number {
  const sorted = [...log].sort((x, y) => x.end - y.end);
  const best: number[] = [];
  sorted.forEach((r, i) => {
    let n = 1;
    for (let j = 0; j < i; j++) if (sorted[j]!.end <= r.start && best[j]! + 1 > n) n = best[j]! + 1;
    best.push(n);
  });
  return Math.max(...best);
}

describe("D1: the selector is asked before any kind or type read", () => {
  it("reads a/fieldOf, then asks the selector, and only then reads kinds and types", async () => {
    const m = fixtureMaster();
    await resolveFieldSets(source(m));
    expect(m.requested[0]).toBe(`${RIG}/base/a/fieldOf`);
    expect(m.requested[1]).toBe(`${RIG}/base/vocab?status=all&carries=a%3AfieldOf&limit=100`);
    expect(m.requested.slice(2).some((u) => u.includes("carries="))).toBe(false);
  });

  it("a master without the selector refuses after two requests, with no kind or type read", async () => {
    const m = fixtureMaster();
    m.selector = false;
    await expect(resolveFieldSets(source(m))).rejects.toBeInstanceOf(CarrierSelectorMissingError);
    expect(m.requested).toEqual([`${RIG}/base/a/fieldOf`, `${RIG}/base/vocab?status=all&carries=a%3AfieldOf&limit=100`]);
  });
});

describe("D2: the walks up read their type terms by name, one request per level", () => {
  it("reads no type term on its own address, and names each type once", async () => {
    const m = fixtureMaster();
    await resolveFieldSets(source(m));
    expect(m.requested.filter(isSingleTerm)).toEqual([]);
    const named = m.requested.filter(isNamed).flatMap((u) => new URL(u).searchParams.getAll("type"));
    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named).size).toBe(named.length);
    // The role's term is one of them: no per-term read of it either.
    expect(named).toContain("Stakeholder");
  });

  it("asks fewer requests than one per term, level by level", async () => {
    const batched = fixtureMaster();
    await resolveFieldSets(source(batched));
    const single = fixtureMaster();
    await resolveFieldSets(oneAtATime(single));
    const typeReads = single.requested.filter(isSingleTerm).length;
    expect(batched.requested.filter(isNamed).length).toBeLessThan(typeReads / 2);
    expect(batched.requested.length).toBeLessThan(single.requested.length);
  });

  it(`no named read names more than ${NAMED_READ_MAX} types`, async () => {
    const m = fixtureMaster();
    const iris = Array.from({ length: 150 }, (_, i) => t(`Probe${i}`));
    await Promise.allSettled(source(m).terms!(iris));
    const named = m.requested.filter(isNamed);
    expect(named.length).toBe(2);
    for (const u of named) expect(new URL(u).searchParams.getAll("type").length).toBeLessThanOrEqual(NAMED_READ_MAX);
    expect(named.flatMap((u) => new URL(u).searchParams.getAll("type")).length).toBe(150);
  });
});

describe("D3: the same answer as a read made one term at a time", () => {
  it("kinds, field sets, ancestors and notes all equal", async () => {
    const batched = await resolveFieldSets(source(fixtureMaster()));
    const single = await resolveFieldSets(oneAtATime(fixtureMaster()));
    expect(batched).toEqual(single);
    expect(batched.complete).toBe(true);
    expect(batched.byKind[t("Person")]!.ancestors).toEqual(single.byKind[t("Person")]!.ancestors);
  });

  it("a kind with two is-a parents keeps its ancestors nearest first, each level in served order", async () => {
    // Person is-a Animal AND Agent; Animal is-a Organism, Agent is-a Thing (placed terms, used
    // here only for their shape). Walked one read at a time level by level:
    // Person; Animal, Agent; Organism, Thing; Substance.
    const m = fixtureMaster();
    const ctx = (m.docs.get(`${RIG}/base/t/Person`) as Record<string, unknown>)["@context"];
    m.put("t/Person", { "@context": ctx, "@id": t("Person"), "a:label": "Person", "a:subTypeOf": [{ "@id": t("Animal") }, { "@id": t("Agent") }] });
    m.put("t/Agent", { "@context": ctx, "@id": t("Agent"), "a:label": "Agent", "a:subTypeOf": { "@id": t("Thing") } });
    m.put("t/Thing", { "@context": ctx, "@id": t("Thing"), "a:label": "Thing" });
    const sets = await resolveFieldSets(source(m));
    expect(sets.byKind[t("Person")]!.ancestors).toEqual([t("Person"), t("Animal"), t("Agent"), t("Organism"), t("Thing"), t("Substance")]);
  });

  it("a master that ignores `type` gives the same answer, each term then read on its own", async () => {
    const m = fixtureMaster();
    m.namedRead = false;
    const sets = await resolveFieldSets(source(m));
    expect(sets).toEqual(await resolveFieldSets(oneAtATime(fixtureMaster())));
  });
});

describe("D4: reads that do not wait on each other are made at the same time", () => {
  it("the whole read's longest chain of requests is bounded by the walk's depth, not its size", async () => {
    const mb = fixtureMaster();
    const batched = timed(mb);
    await resolveFieldSets(source(mb, batched.f));
    const ms = fixtureMaster();
    const single = timed(ms);
    await resolveFieldSets(oneAtATime(ms, single.f));
    // a/fieldOf, the selector, the predicates with the role, the children (2 levels), and the
    // walk up (5 levels in this fixture): 10.
    expect(longestChain(batched.log)).toBeLessThanOrEqual(10);
    expect(longestChain(batched.log)).toBeLessThan(single.log.length / 2);
  });
});

describe("D5: a term the named read does not carry is read on its own", () => {
  it("an ancestor that fails fails the read, as a failed read of it did", async () => {
    const m = fixtureMaster();
    m.status.set(`${RIG}/base/t/Organism`, 500);
    await expect(resolveFieldSets(source(m))).rejects.toBeInstanceOf(VocabularyUnavailableError);
    expect(m.requested).toContain(`${RIG}/base/t/Organism`);
  });

  it("a term this master does not hold answers 404 on its own read", async () => {
    // Brahman is a placed term; this fixture master does not serve it.
    const m = fixtureMaster();
    const [doc] = source(m).terms!([t("Brahman")]);
    await expect(doc).rejects.toBeInstanceOf(VocabularyUnavailableError);
    expect(m.requested.filter(isSingleTerm)).toEqual([`${RIG}/base/t/Brahman`]);
  });
});

describe("D5c: a named read the master refuses or fails", () => {
  it("is not the end: each term is then read on its own, and the answer is the same", async () => {
    const m = fixtureMaster();
    const refusing: TermFetch = (u, init) =>
      isNamed(u) ? Promise.resolve(Response.json({ error: "Refused" }, { status: 400 })) : m.fetch(u, init);
    const sets = await resolveFieldSets(source(m, refusing));
    expect(sets).toEqual(await resolveFieldSets(oneAtATime(fixtureMaster())));
    expect(m.requested.filter(isSingleTerm).length).toBeGreaterThan(0);
  });
});

describe("D5d: a source that throws instead of rejecting", () => {
  it("terms() never throws: an IRI that is not an address rejects its own promise", () => {
    const m = fixtureMaster();
    let docs: Promise<unknown>[] = [];
    expect(() => {
      docs = source(m).terms!(["https://bad host/base/t/Animal"]);
    }).not.toThrow();
    return expect(docs[0]).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });

  it("a record type's term that throws notes the record type, and the kinds still read", async () => {
    // Employment (a record type, declared by fixtureTag's writable fields) is read in the same
    // batch as the kinds' own terms.
    const m = withWritableFields(withTagStandard(fixtureMaster()));
    const s = oneAtATime(m);
    const throwing: VocabularySource = {
      ...s,
      term: ((iri: string) => {
        if (iri === t("Employment")) throw new VocabularyUnavailableError(`${iri} refused synchronously`);
        return s.term(iri);
      }) as VocabularySource["term"],
    };
    const sets = await resolveFieldSets(throwing);
    expect(sets.incompleteAt.some((n) => n.startsWith(`record type ${t("Employment")}`))).toBe(true);
    expect(Object.keys(sets.byKind).length).toBeGreaterThan(0);
  });
});

describe("D6: what goes by name, and how it is sent", () => {
  it("an IRI outside /base/t/<Name> is read on its own", async () => {
    const m = fixtureMaster();
    const [doc] = source(m).terms!([a("fieldOf")]);
    expect((await doc)["a:predicateAttribute"]).toBe("a:fieldOf");
    expect(m.requested).toEqual([`${RIG}/base/a/fieldOf`]);
  });

  it("each named read checks back with the master, with an init of its own", async () => {
    const m = fixtureMaster();
    await resolveFieldSets(source(m));
    const named = m.requested.map((u, i) => [u, m.inits[i]] as const).filter(([u]) => isNamed(u));
    expect(named.length).toBeGreaterThan(1);
    for (const [, init] of named) expect(init?.cache).toBe("no-cache");
    expect(new Set(named.map(([, init]) => init)).size).toBe(named.length);
  });
});
