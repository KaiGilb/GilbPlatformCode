// New tests: every export of terms.ts, pinned.
import { describe, expect, it } from "vitest";
import {
  MasterTimeoutError,
  VocabularyUnavailableError,
  bareForm,
  cardinalityOf,
  encodingOf,
  nameOfIri,
  refsUnder,
  spellingFromBinding,
  spellingOfTermDoc,
  textUnder,
  typeAttributeOf,
  valuesUnder,
  type TermFetch,
} from "./terms";

describe("the two errors", () => {
  it("VocabularyUnavailableError is an Error with its own name", () => {
    const e = new VocabularyUnavailableError("down");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("VocabularyUnavailableError");
    expect(e.message).toBe("down");
  });
  it("MasterTimeoutError is a VocabularyUnavailableError that carries the bound that ran out", () => {
    const e = new MasterTimeoutError("slow", 1234);
    expect(e).toBeInstanceOf(VocabularyUnavailableError);
    expect(e.name).toBe("MasterTimeoutError");
    expect(e.ms).toBe(1234);
  });
  it("TermFetch is a function from a url and an init to a response", async () => {
    const f: TermFetch = async (url, init) => new Response(JSON.stringify({ url, cache: init?.cache ?? null }));
    expect(await (await f("https://h.example.test/x", { cache: "no-cache" })).json()).toEqual({ url: "https://h.example.test/x", cache: "no-cache" });
  });
});

describe("bareForm", () => {
  it("strips exactly one leading a: or t:", () => {
    expect(bareForm("a:fieldOf")).toBe("fieldOf");
    expect(bareForm("t:Person")).toBe("Person");
    expect(bareForm("a:a:x")).toBe("a:x");
  });
  it("leaves a segment with no such prefix, or the prefix not at the start, alone", () => {
    expect(bareForm("fieldOf")).toBe("fieldOf");
    expect(bareForm("x:a:y")).toBe("x:a:y");
    expect(bareForm("b:y")).toBe("b:y");
  });
});

describe("spellingFromBinding", () => {
  it("reads every segment, prefixed and bare, and writes the one survivor", () => {
    const s = spellingFromBinding("https://h.example.test/base/a/label", "a:label", undefined);
    expect(s.term).toBe("https://h.example.test/base/a/label");
    expect(new Set(s.readKeys)).toEqual(new Set(["a:label", "label"]));
    expect(s.writeKey).toBe("a:label");
    expect(s.writeKeyProblem).toBeNull();
  });
  it("splits a binding on | and trims; the order carries no meaning", () => {
    const s = spellingFromBinding("t", " a:one | two ", undefined);
    expect(new Set(s.readKeys)).toEqual(new Set(["a:one", "one", "two"]));
  });
  it("a retired segment is still read but is not written; one survivor is the write key", () => {
    const s = spellingFromBinding("t", "a:old|a:new", "a:old");
    expect(new Set(s.readKeys)).toEqual(new Set(["a:old", "old", "a:new", "new"]));
    expect(s.writeKey).toBe("a:new");
    expect(s.writeKeyProblem).toBeNull();
  });
  it("a retired list given as an array, or a single retired string, are both read; null counts as none", () => {
    expect(spellingFromBinding("t", "a:old|a:new", ["a:old"]).writeKey).toBe("a:new");
    expect(spellingFromBinding("t", "a:old|a:new", null).writeKey).toBeNull();
  });
  it("two current spellings with none retired: no write key, and the problem is stated", () => {
    const s = spellingFromBinding("T", "a:x|a:y", undefined);
    expect(s.writeKey).toBeNull();
    expect(s.writeKeyProblem).toBe("T offers 2 current spellings (a:x, a:y) and retires none; GilbVeda must name one");
  });
  it("every spelling retired: no write key, and the problem is stated", () => {
    const s = spellingFromBinding("T", "a:x", "a:x");
    expect(s.writeKey).toBeNull();
    expect(s.writeKeyProblem).toBe("T retires every spelling it offers");
  });
  it("an empty binding: no write key, and the problem is stated", () => {
    const s = spellingFromBinding("T", " | ", undefined);
    expect(s.readKeys).toEqual([]);
    expect(s.writeKeyProblem).toBe("T serves an empty binding");
  });
});

describe("spellingOfTermDoc", () => {
  it("reads the prefixed meta-key and takes the document's own @id as the term", () => {
    const s = spellingOfTermDoc({ "@id": "https://h.example.test/base/a/x", "a:predicateAttribute": "a:x" }, "fallback");
    expect(s.term).toBe("https://h.example.test/base/a/x");
    expect(s.writeKey).toBe("a:x");
  });
  it("reads the bare meta-key a frame may leave, and falls back to the given term without an @id", () => {
    const s = spellingOfTermDoc({ predicateAttribute: "x", deprecatedNotation: "y" }, "fallback");
    expect(s.term).toBe("fallback");
    expect(s.writeKey).toBe("x");
  });
  it("a retired spelling named under the bare or the prefixed key is applied", () => {
    expect(spellingOfTermDoc({ "a:predicateAttribute": "a:x|a:y", "a:deprecatedNotation": "a:x" }, "t").writeKey).toBe("a:y");
    expect(spellingOfTermDoc({ predicateAttribute: "a:x|a:y", deprecatedNotation: "a:x" }, "t").writeKey).toBe("a:y");
  });
  it("a document that names no spelling is a VocabularyUnavailableError, never an empty read", () => {
    expect(() => spellingOfTermDoc({ "@id": "https://h.example.test/base/a/x" }, "t")).toThrow(VocabularyUnavailableError);
    expect(() => spellingOfTermDoc({ "a:predicateAttribute": "   " }, "t")).toThrow(/carries no a:predicateAttribute/);
  });
});

describe("valuesUnder, textUnder, refsUnder, nameOfIri", () => {
  it("valuesUnder gathers every key's values, arrays flattened, skipping missing and null", () => {
    expect(valuesUnder({ a: 1, b: [2, 3], c: null }, ["a", "b", "c", "d"])).toEqual([1, 2, 3]);
  });
  it("textUnder returns the first non-blank text, trimmed, from a string or an @value object", () => {
    expect(textUnder({ x: "  hi " }, ["x"])).toBe("hi");
    expect(textUnder({ x: { "@value": "word" } }, ["x"])).toBe("word");
    expect(textUnder({ x: ["", "  ", { "@value": 5 }, "second"] }, ["x"])).toBe("second");
    expect(textUnder({ x: "" }, ["x"])).toBeNull();
    expect(textUnder({}, ["x"])).toBeNull();
  });
  it("refsUnder takes absolute references, string or @id, once each, in served order", () => {
    const doc = { k: ["https://h.example.test/base/t/A", { "@id": "https://h.example.test/base/t/B" }, "https://h.example.test/base/t/A"] };
    expect(refsUnder(doc, ["k"])).toEqual(["https://h.example.test/base/t/A", "https://h.example.test/base/t/B"]);
  });
  it("refsUnder expands a CURIE by the document's own @context, in a context object or a list of them", () => {
    const one = { "@context": { t: "https://h.example.test/base/t/" }, k: "t:Person" };
    expect(refsUnder(one, ["k"])).toEqual(["https://h.example.test/base/t/Person"]);
    const list = { "@context": [{ t: "https://h.example.test/base/t/" }, { complete: { "@id": "x" } }, null, ["no"]], k: [{ "@id": "t:Org" }] };
    expect(refsUnder(list, ["k"])).toEqual(["https://h.example.test/base/t/Org"]);
  });
  it("refsUnder drops a value that is not a reference: no prefix known, blank, a number, a non-http prefix value", () => {
    const doc = { "@context": { t: "urn:x:" , u: "https://h.example.test/u/" }, k: ["q:Thing", "  ", 5, "t:A", "u:B", { "@id": 7 }] };
    expect(refsUnder(doc, ["k"])).toEqual(["https://h.example.test/u/B"]);
  });
  it("nameOfIri is the last path segment, decoded, without trailing slashes", () => {
    expect(nameOfIri("https://h.example.test/base/t/Person")).toBe("Person");
    expect(nameOfIri("https://h.example.test/base/t/Person///")).toBe("Person");
    expect(nameOfIri("https://h.example.test/base/t/A%20B")).toBe("A B");
    expect(nameOfIri("https://h.example.test/base/t/%E0%A4%A")).toBe("%E0%A4%A");
    expect(nameOfIri("bare")).toBe("bare");
  });
});

describe("the three self-description readers", () => {
  const cases: [string, (doc: Record<string, unknown>) => string | null, string, string][] = [
    ["encodingOf", encodingOf, "a:encoding", "encoding"],
    ["typeAttributeOf", typeAttributeOf, "a:typeAttribute", "typeAttribute"],
    ["cardinalityOf", cardinalityOf, "a:cardinality", "cardinality"],
  ];
  for (const [name, read, prefixed, bare] of cases) {
    it(`${name} reads the prefixed key`, () => {
      expect(read({ [prefixed]: "x:one" })).toBe("x:one");
    });
    it(`${name} reads the bare key when the prefixed one is absent`, () => {
      expect(read({ [bare]: "x:two" })).toBe("x:two");
    });
    it(`${name} prefers the prefixed key to the bare key`, () => {
      expect(read({ [prefixed]: "first", [bare]: "second" })).toBe("first");
    });
    it(`${name} trims the value, and falls through a blank prefixed value to the bare key`, () => {
      expect(read({ [prefixed]: "  padded  " })).toBe("padded");
      expect(read({ [prefixed]: "   ", [bare]: "second" })).toBe("second");
    });
    it(`${name} is null when the term publishes none, or a value that is not a string`, () => {
      expect(read({})).toBeNull();
      expect(read({ [prefixed]: 5, [bare]: ["list"] })).toBeNull();
      expect(read({ [prefixed]: "", [bare]: "  " })).toBeNull();
    });
    it(`${name} does not read the other two keys`, () => {
      const others = cases.filter((c) => c[0] !== name).flatMap((c) => [c[2], c[3]]);
      const doc = Object.fromEntries(others.map((k) => [k, "other"]));
      expect(read(doc)).toBeNull();
    });
  }
  it("a served term document gives all three at once", () => {
    const doc = { "a:encoding": "reference:@id", "a:typeAttribute": "t:Person", "a:cardinality": "multi" };
    expect([encodingOf(doc), typeAttributeOf(doc), cardinalityOf(doc)]).toEqual(["reference:@id", "t:Person", "multi"]);
  });
});
