// Ported from `gilb-stakeholders` `test/qa-c214-22d.test.ts` at 0a261488: 4 of its 5 tests (Q8 calls only `resolveStakeholderKinds`, and is in
// `stakeholder-kinds`). Gap tests of the named read. Two fixture strings that are not on the master are replaced by placed carriers
// (TimeZone / a:timeZone, Skill / a:skill), used for their shape only.
//
// The real door serves a named read's `@context` as an ARRAY: [the term context, the page grammar]. The package lends that array to each
// node, and `prefixesOf` reads prefixes only from an OBJECT context.
//
//   Q7  a type whose own term names its parent as a CURIE (`t:Animal`): the walk up through the named read must give the ancestors a
//       one-term-at-a-time read gives
//   Q9  control: Q7's master with the fixture's own context is equal
//   Q10 a declaration's `a:fieldOf` as a CURIE on a selector page served with the array context
//   Q11 a parent reference that is not an address rejects the read, as `term` does (it must not hang)
import { describe, it, expect } from "vitest";
import { VocabularyUnavailableError, masterSource, type TermFetch, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "./fieldSets";
import { fixtureMaster, RIG, t, CONTEXT, type FixtureMaster } from "../test/support";

/** The page grammar the door appends to its term context (eda13db1 `pageContext`). */
const PAGE_GRAMMAR = {
  complete: { "@id": "https://ontology.platform.example.test/base/ns/vocab-page#complete" },
  limit: { "@id": "https://ontology.platform.example.test/base/ns/vocab-page#limit" },
  absent: { "@id": "https://ontology.platform.example.test/base/ns/vocab-page#absent", "@container": "@set" },
  next: { "@id": "http://www.w3.org/ns/hydra/core#next", "@type": "@id" },
};
/** The fixture master, with every /base/vocab answer's @context served as the real door serves it. */
const arrayContext = (m: FixtureMaster): TermFetch => async (url, init) => {
  const res = await m.fetch(url, init);
  if (!new URL(url).pathname.endsWith("/base/vocab") || res.status !== 200) return res;
  const body = (await res.json()) as Record<string, unknown>;
  return Response.json({ ...body, "@context": [CONTEXT, PAGE_GRAMMAR] });
};
const named = (f: TermFetch) => masterSource({ vedaOrigin: RIG, fetchImpl: f });
const oneAtATime = (f: TermFetch): VocabularySource => {
  const s = named(f);
  return { termIri: s.termIri, term: s.term, children: s.children, carriersOf: s.carriersOf };
};
/** Person names its parent as a CURIE; a field is declared on that parent, so the parent matters. */
function curieParent(): FixtureMaster {
  const m = fixtureMaster();
  m.put("t/Person", { "@context": CONTEXT, "@id": t("Person"), "a:label": "Person", "a:subTypeOf": { "@id": "t:Animal" } });
  const first = m.docs.get(`${RIG}/base/vocab?status=all&limit=2000`) as { "@graph": unknown[] };
  first["@graph"].push({ "@id": t("TimeZone"), "a:predicateAttribute": "a:timeZone", "a:label": "Time zone", "a:fieldOf": { "@id": t("Animal") } });
  return m;
}
const fieldsOf = (sets: Awaited<ReturnType<typeof resolveFieldSets>>, kind: string) => sets.byKind[t(kind)]!.fields.map((f) => f.term);

describe("Q7: a CURIE parent, read through the real door's named read", () => {
  it("gives the field set a one-term-at-a-time read gives", async () => {
    const m = curieParent();
    const reference = await resolveFieldSets(oneAtATime(arrayContext(m)));
    expect(fieldsOf(reference, "Person")).toContain(t("TimeZone")); // positive control: the parent's field reaches Person
    const viaNamed = await resolveFieldSets(named(arrayContext(m)));
    expect(fieldsOf(viaNamed, "Person")).toEqual(fieldsOf(reference, "Person"));
    expect(JSON.stringify(viaNamed)).toBe(JSON.stringify(reference));
  });
});

describe("Q9: control, the fixture's object context", () => {
  it("Q7's master read through the fixture's own named read is equal", async () => {
    const m = curieParent();
    const reference = await resolveFieldSets(oneAtATime(m.fetch));
    const viaNamed = await resolveFieldSets(named(m.fetch));
    expect(fieldsOf(reference, "Person")).toContain(t("TimeZone"));
    expect(JSON.stringify(viaNamed)).toBe(JSON.stringify(reference));
  });
});

describe("Q10 (sibling, older than the named read): a declaration's a:fieldOf as a CURIE on the selector page", () => {
  it("still reaches its kind when the page's context is the door's array", async () => {
    const m = fixtureMaster();
    const first = m.docs.get(`${RIG}/base/vocab?status=all&limit=2000`) as { "@graph": unknown[] };
    first["@graph"].push({ "@id": t("Skill"), "a:predicateAttribute": "a:skill", "a:label": "Skill", "a:fieldOf": { "@id": "t:Person" } });
    const viaObject = await resolveFieldSets(named(m.fetch));
    expect(fieldsOf(viaObject, "Person")).toContain(t("Skill")); // positive control
    const viaArray = await resolveFieldSets(named(arrayContext(m)));
    expect(fieldsOf(viaArray, "Person")).toContain(t("Skill"));
  });
});

// Q11: a parent reference that is not an address rejects the read, as a read of that term does. The walk's terms go through `terms`, whose
// per-term fallback `one` is a plain arrow: `locate` throws synchronously inside `flush`, a timer callback, so without the guard the error
// would escape as an uncaught exception and the batch's promises would never settle.
describe("Q11: a parent reference that is not an address", () => {
  it("rejects the read with VocabularyUnavailableError, as a read of that term does", async () => {
    const m = fixtureMaster();
    m.put("t/Person", { "@context": CONTEXT, "@id": t("Person"), "a:label": "Person", "a:subTypeOf": { "@id": "https://bad host/base/t/Animal" } });
    // Control: one term at a time, the read rejects loudly.
    await expect(resolveFieldSets(oneAtATime(m.fetch))).rejects.toBeInstanceOf(VocabularyUnavailableError);
    const outcome = await Promise.race([
      resolveFieldSets(named(m.fetch)).then(() => "resolved", (e) => (e instanceof VocabularyUnavailableError ? "rejected" : `other: ${String(e)}`)),
      new Promise<string>((r) => setTimeout(() => r("never settled within 2 s"), 2000)),
    ]);
    expect(outcome).toBe("rejected");
  });
});
