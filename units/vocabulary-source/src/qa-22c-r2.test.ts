// Ported from `gilb-stakeholders` `test/qa-c214-22c-r2.test.ts` at 27fe0cef: 1 of its 3 tests (the others call symbols that are not in this unit).
import { describe, it, expect } from "vitest";
import { masterSource } from "./source";
import { fixtureMaster, RIG } from "../test/support";


// R2: the fixture's relative-next line (`wholeListing`) was reached by
// no test input, so a fault there (mutant MB3d) survived. A fixture self-test.
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
