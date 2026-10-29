// Ported by block from `gilb-stakeholders` `test/` at 0a261488, the blocks that call `resolveStakeholderKinds` and nothing outside this unit:
// `qa-c214.test.ts` (1 of its tests), `qa-c214-22d.test.ts` (Q8, 1 of 7), `fieldSetReadSpeed-22d.test.ts` (2 of 18).
// The longest-chain test of the source counted real milliseconds; here the requests run on a logical clock (one event per start and per end,
// each answer held back by a fixed number of microtask turns), so no test waits on the wall clock.
import { describe, it, expect } from "vitest";
import { masterSource, type TermFetch, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveStakeholderKinds } from "./kinds";
import { fixtureMaster, ID, RIG, CONTEXT, t, type FixtureMaster } from "../test/support";

const src = (m: FixtureMaster) => masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
/** The same master, read one term at a time: the source without `terms`. */
const oneAtATime = (f: TermFetch): VocabularySource => {
  const s = masterSource({ vedaOrigin: RIG, fetchImpl: f });
  return { termIri: s.termIri, term: s.term, children: s.children, carriersOf: s.carriersOf };
};

describe("resolveStakeholderKinds — what it reads", () => {
  it("reads no type above a member (qa-c214)", async () => {
    const m = fixtureMaster();
    await resolveStakeholderKinds(src(m));
    expect(m.count("/base/t/Animal")).toBe(0);
    // positive control: the member's children listing was read
    expect(m.count("/base/t/Person/children")).toBe(1);
  });
});

describe("resolveStakeholderKinds — the role's players as CURIEs, through the door's named read (qa-c214-22d Q8)", () => {
  /** The page grammar the door appends to its term context. */
  const PAGE_GRAMMAR = {
    complete: { "@id": `${ID}/base/ns/vocab-page#complete` },
    limit: { "@id": `${ID}/base/ns/vocab-page#limit` },
    absent: { "@id": `${ID}/base/ns/vocab-page#absent`, "@container": "@set" },
    next: { "@id": "http://www.w3.org/ns/hydra/core#next", "@type": "@id" },
  };
  /** The fixture master, with every /base/vocab answer's @context served as the real door serves it. */
  const arrayContext = (m: FixtureMaster): TermFetch => async (url, init) => {
    const res = await m.fetch(url, init);
    if (!new URL(url).pathname.endsWith("/base/vocab") || res.status !== 200) return res;
    const body = (await res.json()) as Record<string, unknown>;
    return Response.json({ ...body, "@context": [CONTEXT, PAGE_GRAMMAR] });
  };
  it("the kinds read alone equals a one-term-at-a-time read", async () => {
    const m = fixtureMaster();
    const role = m.docs.get(`${RIG}/base/t/Stakeholder`) as Record<string, unknown>;
    m.put("t/Stakeholder", { ...role, "a:playableBy": ["Person", "Organization"].map((n) => ({ "@id": `t:${n}` })) });
    const reference = await resolveStakeholderKinds(oneAtATime(arrayContext(m)));
    expect(reference.members).toEqual([t("Person"), t("Organization")]); // positive control
    const viaNamed = await resolveStakeholderKinds(masterSource({ vedaOrigin: RIG, fetchImpl: arrayContext(m) }));
    expect(viaNamed.members).toEqual(reference.members);
  });
});

describe("resolveStakeholderKinds — the same answer by the named read or by one term at a time (fieldSetReadSpeed-22d)", () => {
  it("the kinds alone equal a one-at-a-time read", async () => {
    const m = fixtureMaster();
    const batched = await resolveStakeholderKinds(src(m));
    expect(batched).toEqual(await resolveStakeholderKinds(oneAtATime(fixtureMaster().fetch)));
  });
});

describe("resolveStakeholderKinds — reads that do not wait on each other are made at the same time (fieldSetReadSpeed-22d D4)", () => {
  /** A fetch that answers after a fixed number of microtask turns and records each request's start and end on a logical clock. */
  function logical(m: FixtureMaster) {
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
  it("the kinds alone take one round for the terms and one per level of children", async () => {
    const m = logical(fixtureMaster());
    await resolveStakeholderKinds(masterSource({ vedaOrigin: RIG, fetchImpl: m.f }));
    expect(longestChain(m.log)).toBe(3);
  });
  it("(control) the logical clock tells a chain from a parallel read", async () => {
    const seq = logical(fixtureMaster());
    await seq.f(`${RIG}/base/t/Person`);
    await seq.f(`${RIG}/base/t/Organization`);
    expect(longestChain(seq.log)).toBe(2);
    const par = logical(fixtureMaster());
    await Promise.all([par.f(`${RIG}/base/t/Person`), par.f(`${RIG}/base/t/Organization`)]);
    expect(longestChain(par.log)).toBe(1);
  });
});
