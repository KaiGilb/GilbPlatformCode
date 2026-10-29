// The reads of the catalogue that the header's relation chips rely on: the predicate reference rides on the entry read, and its CURIE is read
// once from the predicate's own term. The expected words are READ from the fixture of the master (anonymous GETs of the ontology host,
// 2026-10-19: the RelationshipKind entries and the kindPredicate term entities).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetTermOrigin, setTermOrigin, termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import fixture from "../test/relationsMaster.json";
import { __resetCatalogueCache, readMasterEntryName, readPredicateCurie } from "./contactKindCatalogue";

type Doc = Record<string, unknown>;
const ENTRIES = fixture.entries as Record<string, Doc>;
const TERMS = fixture.terms as Record<string, Doc>;
const entry = (word: string): Doc => Object.values(ENTRIES).find((e) => e["label"] === word)!;
const termEntityOf = (ref: string): Doc => TERMS[ref.replace(/^base:e\//, "https://ontology.example.test/base/e/")]!;
const refOf = (e: Doc): string | null => ((e["kindPredicate"] as { "@id": string } | undefined)?.["@id"] ?? null);

beforeEach(() => {
  resetTermOrigin();
  setTermOrigin("https://ontology.example.test");
});
afterEach(() => {
  __resetCatalogueCache();
  vi.restoreAllMocks();
});

describe("the reads: the predicate reference rides on the entry read; its CURIE is read once from the term", () => {
  const masterUrl = (id: string) => id.replace("https://ontology.example.test", termOrigin()).replace(/^base:e\//, `${termOrigin()}/base/e/`);
  function fakeMaster() {
    const calls: string[] = [];
    const docs = new Map<string, Doc>();
    for (const [id, d] of Object.entries(ENTRIES)) docs.set(masterUrl(id), d);
    for (const [id, d] of Object.entries(TERMS)) docs.set(masterUrl(id), d);
    const f = vi.fn(async (u: RequestInfo | URL) => {
      const url = String(u);
      calls.push(url);
      const d = docs.get(url);
      return d ? new Response(JSON.stringify(d), { status: 200 }) : new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    return { f, calls };
  }
  test("readMasterEntryName carries the entry's kind predicate reference (null for an entry with none)", async () => {
    const { f } = fakeMaster();
    const customer = entry("Customer");
    expect((await readMasterEntryName(masterUrl(String(customer["@id"])), f))?.predicate).toBe(refOf(customer));
    expect((await readMasterEntryName(masterUrl(String(entry("Competitor")["@id"])), f))?.predicate).toBeNull();
  });
  test("readPredicateCurie: the term's own a:typeAttribute, one read per term for the session; a failed read is not kept", async () => {
    const { f, calls } = fakeMaster();
    const ref = refOf(entry("Customer"))!;
    expect(await readPredicateCurie(ref, f)).toBe(termEntityOf(ref)["typeAttribute"]);
    await readPredicateCurie(ref, f);
    expect(calls.filter((c) => c.endsWith(ref.replace("base:e/", "/e/")))).toHaveLength(1);
    expect(await readPredicateCurie("base:e/no-such-term", f)).toBeNull();
    await readPredicateCurie("base:e/no-such-term", f);
    expect(calls.filter((c) => c.endsWith("/e/no-such-term"))).toHaveLength(2);
  });
});
