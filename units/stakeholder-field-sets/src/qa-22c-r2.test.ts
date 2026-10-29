// Ported from `gilb-stakeholders` `test/qa-c214-22c-r2.test.ts` at 0a261488: all 3 tests. Gap tests of the carrier read, second round:
//
//   Q5  within ONE source, a host fetch that writes a per-URL header onto the init it is handed must not have that header ride on the
//       source's next read (`masterSource` promises "a fresh object per call"; Q1 pins only the cross-source case, so a per-source shared
//       init survives it)
//   Q6  the harmful key itself: a host that writes `cache` onto its init does not turn check-back off for a later, separate source
import { describe, it, expect } from "vitest";
import { masterSource, type TermFetch } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "./fieldSets";
import { fixtureMaster, RIG } from "../test/support";

describe("Q5: one source, a header written for one read", () => {
  it("does not ride on that source's next read", async () => {
    const m = fixtureMaster();
    const sent: { url: string; headers: unknown }[] = [];
    let first = true;
    // A host that adds a conditional header for the first URL only, by writing onto the init.
    const perUrl: TermFetch = (u, init) => {
      if (first && init) { (init as { headers?: Record<string, string> }).headers = { "if-none-match": "\"etag-of-first\"" }; first = false; }
      sent.push({ url: u, headers: init?.headers });
      return m.fetch(u, init);
    };
    await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: perUrl }));
    expect(sent.length).toBeGreaterThan(1);
    expect(sent[0]!.headers).toBeDefined();          // positive control: the host did write it
    expect(sent.slice(1).every((s) => s.headers === undefined)).toBe(true);
    expect(m.inits.every((i) => i?.cache === "no-cache")).toBe(true);
  });
});

describe("Q6: a host that writes cache onto its init", () => {
  it("a later, separate source still sends no-cache", async () => {
    const m = fixtureMaster();
    const careless: TermFetch = (u, init) => { if (init) (init as RequestInit).cache = "force-cache"; return m.fetch(u, init); };
    await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: careless }));
    expect(m.inits.every((i) => i?.cache === "force-cache")).toBe(true); // positive control
    const m2 = fixtureMaster();
    await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m2.fetch }));
    expect(m2.inits.length).toBeGreaterThan(0);
    expect(m2.inits.every((i) => i?.cache === "no-cache")).toBe(true);
  });
});

// A fixture self-test: the fixture's relative-next line (`wholeListing`) was reached by no test input, so a fault there survived.
describe("fixture self-test: a relative next in the listing the selector narrows", () => {
  it("the selector still finds a carrier on the page a relative next points to", async () => {
    const m = fixtureMaster();
    const first = m.docs.get(`${RIG}/base/vocab?status=all&limit=2000`) as { next: string | null; complete: boolean; "@graph": unknown[] };
    // Phone (a:phone) is a placed carrier, used here for its shape.
    const carrier = { "@id": "https://ontology.platform.example.test/base/t/Phone", "a:predicateAttribute": "a:phone", "a:fieldOf": { "@id": "https://ontology.platform.example.test/base/t/Person" } };
    const graph = first["@graph"];
    m.listing([graph as never, [carrier]]);
    const page0 = m.docs.get(`${RIG}/base/vocab?status=all&limit=2000`) as { next: string | null };
    page0.next = "/base/vocab?status=all&limit=2000&cursor=c1";
    const list = await masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }).carriersOf(["a:fieldOf"]);
    expect(list.terms.map((d) => d["@id"])).toContain(carrier["@id"]);
  });
});
