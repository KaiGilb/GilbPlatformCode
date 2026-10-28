// Ported from `gilb-stakeholders` `test/fieldSetReadSpeed-22d.test.ts` at 27fe0cef: 4 of its 18 tests (the others call symbols that are not in this unit).
import { describe, it, expect } from "vitest";
import { masterSource, NAMED_READ_MAX } from "./source";
import { VocabularyUnavailableError, type TermFetch } from "./terms";
import { fixtureMaster, RIG, a, t, type FixtureMaster } from "../test/support";


const source = (m: FixtureMaster, fetchImpl: TermFetch = m.fetch) => masterSource({ vedaOrigin: RIG, fetchImpl });
const isNamed = (u: string) => new URL(u).searchParams.has("type");
const isSingleTerm = (u: string) => /\/base\/t\/[^/?]+$/.test(new URL(u).pathname);

describe("GAPP214.22d D2: the walks up read their type terms by name, one request per level", () => {

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

describe("GAPP214.22d D5: a term the named read does not carry is read on its own", () => {

  it("a term this master does not hold answers 404 on its own read", async () => {
    // Brahman is a placed term; this fixture master does not serve it.
    const m = fixtureMaster();
    const [doc] = source(m).terms!([t("Brahman")]);
    await expect(doc).rejects.toBeInstanceOf(VocabularyUnavailableError);
    expect(m.requested.filter(isSingleTerm)).toEqual([`${RIG}/base/t/Brahman`]);
  });
});

describe("GAPP214.22d D5d: a source that throws instead of rejecting", () => {
  it("terms() never throws: an IRI that is not an address rejects its own promise", () => {
    const m = fixtureMaster();
    let docs: Promise<unknown>[] = [];
    expect(() => {
      docs = source(m).terms!(["https://bad host/base/t/Animal"]);
    }).not.toThrow();
    return expect(docs[0]).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
});

describe("GAPP214.22d D6: what goes by name, and how it is sent", () => {
  it("an IRI outside /base/t/<Name> is read on its own", async () => {
    const m = fixtureMaster();
    const [doc] = source(m).terms!([a("fieldOf")]);
    expect((await doc)["a:predicateAttribute"]).toBe("a:fieldOf");
    expect(m.requested).toEqual([`${RIG}/base/a/fieldOf`]);
  });
});
