// @vitest-environment node
// New tests for the term read beyond the ported ones: what is dereferenced, what is cached, what is never coalesced, and the is-a walk.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { __resetOntologyTermsForTest, fetchOntologyTerm, fetchParentChain, hopableTermIris, kindFromRaw, looksLikeStoreId, ontologyRefIri } from "./ontologyTerms";

const ONT = "https://ontology.platform.example.test";
const term = (n: string) => `${ONT}/base/t/${n}`;
let urls: string[] = [];
let docs: Record<string, unknown> = {};

beforeEach(() => {
  setTermOrigin(ONT);
  __resetOntologyTermsForTest();
  urls = [];
  docs = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      urls.push(url);
      const body = docs[url.split("?")[0]!];
      return body === undefined ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetTermOrigin();
});

describe("fetchOntologyTerm", () => {
  it("reads only an address on the type plane; anything else is null with no request", async () => {
    expect(await fetchOntologyTerm("")).toBeNull();
    expect(await fetchOntologyTerm(`${ONT}/base/e/abc`)).toBeNull();
    expect(urls).toEqual([]);
  });
  it("keeps the answer for the session: a second plain read is one request", async () => {
    docs[term("Chair")] = { "@id": term("Chair"), "a:label": "Chair", "a:nodeKind": "type" };
    const a = await fetchOntologyTerm(term("Chair"));
    const b = await fetchOntologyTerm(term("Chair"));
    expect(a?.label).toBe("Chair");
    expect(b).toBe(a);
    expect(urls).toHaveLength(1);
  });
  it("the kept answer lapses after five minutes", async () => {
    vi.useFakeTimers();
    try {
      docs[term("Chair")] = { "@id": term("Chair"), "a:label": "Chair" };
      await fetchOntologyTerm(term("Chair"));
      vi.advanceTimersByTime(5 * 60_000 - 1);
      await fetchOntologyTerm(term("Chair"));
      expect(urls).toHaveLength(1);
      vi.advanceTimersByTime(2);
      await fetchOntologyTerm(term("Chair"));
      expect(urls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("a finished read removes only its own entry from the reads in flight", async () => {
    const release: Array<() => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        urls.push(String(input));
        await new Promise<void>((r) => release.push(r));
        return new Response(JSON.stringify({ "@id": term("Chair"), "a:label": "Chair" }), { status: 200 });
      }),
    );
    const first = fetchOntologyTerm(term("Chair"), { revalidate: true });
    __resetOntologyTermsForTest(); // a write evicts the read in flight
    const second = fetchOntologyTerm(term("Chair"), { revalidate: true });
    expect(urls).toHaveLength(2);
    release[0]!();
    await first;
    // the first read has settled; the second is still in flight and a third reader joins it
    const third = fetchOntologyTerm(term("Chair"), { revalidate: true });
    expect(urls).toHaveLength(2);
    release[1]!();
    await Promise.all([second, third]);
  });
  it("keeps a miss too: a 404 is asked once", async () => {
    expect(await fetchOntologyTerm(term("Nope"))).toBeNull();
    expect(await fetchOntologyTerm(term("Nope"))).toBeNull();
    expect(urls).toHaveLength(1);
  });
  it("a bust is never joined to a read in flight: two busts are two requests with two different urls", async () => {
    docs[term("Chair")] = { "@id": term("Chair"), "a:label": "Chair" };
    await Promise.all([fetchOntologyTerm(term("Chair"), { bust: true }), fetchOntologyTerm(term("Chair"), { bust: true })]);
    expect(urls).toHaveLength(2);
    expect(new Set(urls).size).toBe(2);
    expect(urls.every((u) => u.includes("?_="))).toBe(true);
  });
  it("two plain readers in flight share one request", async () => {
    docs[term("Chair")] = { "@id": term("Chair"), "a:label": "Chair" };
    const [a, b] = await Promise.all([fetchOntologyTerm(term("Chair")), fetchOntologyTerm(term("Chair"))]);
    expect(urls).toHaveLength(1);
    expect(a?.label).toBe("Chair");
    expect(b?.label).toBe("Chair");
  });
  it("a pipe-joined identity is read at its first hop-able token", async () => {
    docs[term("A")] = { "@id": term("A"), "a:label": "A" };
    const doc = await fetchOntologyTerm(`${term("A")}|${term("B")}`);
    expect(urls).toEqual([term("A")]);
    expect(doc?.label).toBe("A");
  });
  it("does not use a network error as an answer: it is a null, kept", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await fetchOntologyTerm(term("Chair"))).toBeNull();
  });
});

describe("fetchParentChain", () => {
  it("walks leaf to root and returns root first", async () => {
    docs[term("Chair")] = { "@id": term("Chair"), "a:label": "Chair", "a:subTypeOf": { "@id": term("Furnishing") } };
    docs[term("Furnishing")] = { "@id": term("Furnishing"), "a:label": "Furnishing" };
    const chain = await fetchParentChain(term("Chair"));
    expect(chain.map((d) => d.label)).toEqual(["Furnishing", "Chair"]);
  });
  it("stops at a parent of another kind when asked for the same kind only", async () => {
    docs[term("Chair")] = { "@id": term("Chair"), "a:label": "Chair", "a:nodeKind": "type", "a:subTypeOf": { "@id": term("Do") } };
    docs[term("Do")] = { "@id": term("Do"), "a:label": "Do", "a:nodeKind": "function" };
    expect((await fetchParentChain(term("Chair"), { sameKindOnly: true })).map((d) => d.label)).toEqual(["Chair"]);
    __resetOntologyTermsForTest();
    expect((await fetchParentChain(term("Chair"))).map((d) => d.label)).toEqual(["Do", "Chair"]);
  });
  it("never walks more than 24 terms", async () => {
    for (let i = 0; i < 40; i++) docs[term(`T${i}`)] = { "@id": term(`T${i}`), "a:label": `T${i}`, "a:subTypeOf": { "@id": term(`T${i + 1}`) } };
    expect(await fetchParentChain(term("T0"))).toHaveLength(24);
  });
  it("two refs that resolve to the same term are one node: the walk does not repeat it", async () => {
    const e1 = `${ONT}/base/e/aaaaaaaaaa1`;
    const e2 = `${ONT}/base/e/aaaaaaaaaa2`;
    docs[e1] = { "@id": e1, label: "T", typeUri: term("T"), nodeKind: "type", subTypeOf: { "@id": "base:e/aaaaaaaaaa2" } };
    docs[e2] = { "@id": e2, label: "T", typeUri: term("T"), nodeKind: "type" };
    docs[term("T")] = { "@id": term("T"), "a:label": "T", "a:nodeKind": "type", "a:subTypeOf": { "@id": e2 } };
    expect((await fetchParentChain(e1)).map((d) => d.term)).toEqual([term("T")]);
  });
  it("an address that does not resolve is an empty chain", async () => {
    expect(await fetchParentChain(term("Nope"))).toEqual([]);
  });
});

describe("the small readers", () => {
  it("looksLikeStoreId: a digit, no capital, ten or more characters", () => {
    expect(looksLikeStoreId("3ehvnp0kqwha")).toBe(true);
    expect(looksLikeStoreId("Chair")).toBe(false);
    expect(looksLikeStoreId("improvement")).toBe(false);
    expect(looksLikeStoreId("3DLighting")).toBe(false);
  });
  it("ontologyRefIri puts a store id on the entity plane and a name on the type plane, at the term host", () => {
    expect(ontologyRefIri("3ehvnp0kqwha")).toBe(`${ONT}/base/e/3ehvnp0kqwha`);
    expect(ontologyRefIri("Chair")).toBe(`${ONT}/base/t/Chair`);
    expect(ontologyRefIri("https://x.example.test/base/t/A")).toBe("https://x.example.test/base/t/A");
    expect(ontologyRefIri("Chair", "other.example.test")).toBe("https://other.example.test/base/t/Chair");
  });
  it("hopableTermIris splits a pipe-joined identity into term addresses and drops the rest", () => {
    expect(hopableTermIris(`${term("A")}|${term("B")}|not-an-iri`)).toEqual([term("A"), term("B")]);
  });
  it("kindFromRaw reads function and value, and everything else is a type", () => {
    expect(kindFromRaw({ "a:nodeKind": "function" })).toBe("function");
    expect(kindFromRaw({ nodeKind: "value" })).toBe("value");
    expect(kindFromRaw({ "a:nodeKind": "type" })).toBe("type");
    expect(kindFromRaw({})).toBe("type");
  });
});
