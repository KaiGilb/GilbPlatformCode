// Ported from `gilb-stakeholders` `test/qa-c214-22d-r2.test.ts` at 0a261488: all 3 tests. Gap tests of the named read, second round:
//
//   G1  a source with no `terms` whose `term` throws synchronously: the field-set read rejects (`flush` calls the source synchronously
//       inside a timer callback)
//   G2  a source whose `terms` throws synchronously: the field-set read rejects
//   G3  control for the object-context path: the named read, carrier read and listing pages served with an OBJECT context give the same
//       answer as the list context the fixture serves
import { describe, it, expect } from "vitest";
import { VocabularyUnavailableError, masterSource, type TermFetch, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "./fieldSets";
import { fixtureMaster, RIG, t, CONTEXT, type FixtureMaster } from "../test/support";

const src = (f: TermFetch) => masterSource({ vedaOrigin: RIG, fetchImpl: f });
const settle = <T>(p: Promise<T>) =>
  Promise.race([
    p.then(() => "resolved", (e) => (e instanceof VocabularyUnavailableError ? "rejected" : `other: ${String(e)}`)),
    new Promise<string>((r) => setTimeout(() => r("never settled within 2 s"), 2000)),
  ]);

describe("G1: a source whose term throws synchronously", () => {
  it("rejects the field-set read, as one awaited read does", async () => {
    const m = fixtureMaster();
    const s = src(m.fetch);
    const custom: VocabularySource = {
      termIri: s.termIri,
      children: s.children,
      carriersOf: s.carriersOf,
      term: ((iri: string) => {
        if (iri === t("Animal")) throw new VocabularyUnavailableError(`${iri} refused synchronously`);
        return s.term(iri);
      }) as VocabularySource["term"],
    };
    expect(await settle(resolveFieldSets(custom))).toBe("rejected");
  });
});

describe("G2: a source whose terms throws synchronously", () => {
  it("rejects the field-set read", async () => {
    const m = fixtureMaster();
    const s = src(m.fetch);
    let calls = 0;
    const custom: VocabularySource = {
      ...s,
      terms: (iris) => {
        calls += 1;
        if (iris.includes(t("Animal"))) throw new VocabularyUnavailableError("terms refused synchronously");
        return s.terms!(iris);
      },
    };
    const outcome = await settle(resolveFieldSets(custom));
    expect(calls).toBeGreaterThan(0);
    expect(outcome).toBe("rejected");
  });
});

describe("G3: control, the object-context path still reads", () => {
  it("every /base/vocab answer served with an object context gives the list-context answer", async () => {
    const objectContext = (m: FixtureMaster): TermFetch => async (url, init) => {
      const res = await m.fetch(url, init);
      if (!new URL(url).pathname.endsWith("/base/vocab") || res.status !== 200) return res;
      const body = (await res.json()) as Record<string, unknown>;
      expect(Array.isArray(body["@context"])).toBe(true); // the fixture now serves the door's list
      return Response.json({ ...body, "@context": CONTEXT });
    };
    const m = fixtureMaster();
    const viaList = await resolveFieldSets(src(m.fetch));
    const viaObject = await resolveFieldSets(src(objectContext(fixtureMaster())));
    expect(Object.keys(viaList.byKind).length).toBeGreaterThan(0);
    expect(JSON.stringify(viaObject)).toBe(JSON.stringify(viaList));
  });
});
