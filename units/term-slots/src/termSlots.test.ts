// The term-slot reads against a fake `fetch`: every export, the caches (one GET for two questions), a refused read, and the origin read
// at the moment a URL is built. Fresh caches and a fresh origin for every test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import * as api from "./index";
import {
  __resetTermSlotsForTest,
  attributeLabel,
  attributeSpelling,
  termDocLabel,
  termLabelOfIri,
  termValueSet,
  typeSpelling,
} from "./index";

const ORIGIN = "https://ontology.example.test";
const ACCEPT = "application/ld+json, application/json";

type Reply = { status?: number; body?: unknown } | "throw";
let routes: Record<string, Reply | (() => Reply)>;
let calls: { url: string; init?: RequestInit }[];

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  routes = {};
  calls = [];
  setTermOrigin(ORIGIN);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const r = routes[url];
      const reply = typeof r === "function" ? r() : r;
      if (reply === undefined) return json({}, 404);
      if (reply === "throw") throw new TypeError("offline");
      return json(reply.body ?? {}, reply.status ?? 200);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTermOrigin();
  __resetTermSlotsForTest();
});

const A = (name: string) => `${ORIGIN}/base/a/${name}`;
const T = (name: string) => `${ORIGIN}/base/t/${name}`;
const urls = () => calls.map((c) => c.url);

describe("the export list", () => {
  it("is exactly these names", () => {
    expect(Object.keys(api).sort()).toEqual(["__resetTermSlotsForTest", "attributeLabel", "attributeSpelling", "termDocLabel", "termLabelOfIri", "termValueSet", "typeSpelling"]);
  });
});

describe("attributeSpelling", () => {
  it("asks GET <origin>/base/a/<name> with the ld+json accept header and no credential, and strips `a:` from the binding", async () => {
    routes[A("email")] = { body: { "a:predicateAttribute": "a:email" } };
    expect(await attributeSpelling("email")).toBe("email");
    expect(urls()).toEqual([A("email")]);
    expect(calls[0]!.init).toEqual({ headers: { accept: ACCEPT } });
  });
  it("the name is URL-encoded", async () => {
    routes[A("a%20b%2Fc")] = { body: { predicateAttribute: "x" } };
    expect(await attributeSpelling("a b/c")).toBe("x");
  });
  it("takes the wire key `predicateAttribute` when the framed key is absent, trims, and keeps a bare value", async () => {
    routes[A("one")] = { body: { predicateAttribute: "  a:one  " } };
    routes[A("two")] = { body: { "a:predicateAttribute": "  two " } };
    expect(await attributeSpelling("one")).toBe("one");
    expect(await attributeSpelling("two")).toBe("two");
  });
  it("the framed key wins over the wire key", async () => {
    routes[A("both")] = { body: { "a:predicateAttribute": "a:framed", predicateAttribute: "a:wire" } };
    expect(await attributeSpelling("both")).toBe("framed");
  });
  it("only the leading `a:` is removed", async () => {
    routes[A("x")] = { body: { "a:predicateAttribute": "a:a:x" } };
    expect(await attributeSpelling("x")).toBe("a:x");
  });
  it("a blank, missing or non-string binding is null", async () => {
    routes[A("blank")] = { body: { "a:predicateAttribute": "   " } };
    routes[A("none")] = { body: {} };
    routes[A("num")] = { body: { "a:predicateAttribute": 7 } };
    expect(await attributeSpelling("blank")).toBeNull();
    expect(await attributeSpelling("none")).toBeNull();
    expect(await attributeSpelling("num")).toBeNull();
  });
  it("two questions of one term are ONE GET, and the answer is the same", async () => {
    routes[A("email")] = { body: { "a:predicateAttribute": "a:email" } };
    const [a, b] = await Promise.all([attributeSpelling("email"), attributeSpelling("email")]);
    expect([a, b]).toEqual(["email", "email"]);
    expect(await attributeSpelling("email")).toBe("email");
    expect(calls).toHaveLength(1);
  });
  it("a term that was read but carries no binding is held too (one GET)", async () => {
    routes[A("none")] = { body: {} };
    await attributeSpelling("none");
    await attributeSpelling("none");
    expect(calls).toHaveLength(1);
  });
});

describe("a refused read", () => {
  it("a 404, a 500 and a thrown fetch each answer null for every question", async () => {
    routes[A("gone")] = { status: 404 };
    routes[A("sick")] = { status: 500, body: { "a:predicateAttribute": "a:x" } };
    routes[A("down")] = "throw";
    for (const name of ["gone", "sick", "down"]) {
      expect(await attributeSpelling(name)).toBeNull();
      expect(await attributeLabel(name)).toBeNull();
      expect(await termValueSet(name)).toBeNull();
    }
  });
  it("is not kept: the next question asks again, and a later answer is then held", async () => {
    let up = false;
    routes[A("email")] = () => (up ? { body: { "a:predicateAttribute": "a:email", "a:label": "Email" } } : { status: 503 });
    expect(await attributeSpelling("email")).toBeNull();
    expect(await attributeSpelling("email")).toBeNull();
    expect(calls).toHaveLength(2);
    up = true;
    expect(await attributeSpelling("email")).toBe("email");
    expect(await attributeLabel("email")).toBe("Email");
    expect(calls).toHaveLength(3);
  });
  it("a body that is not JSON is a refused read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    expect(await attributeSpelling("html")).toBeNull();
  });
});

describe("termDocLabel", () => {
  it("takes `a:label`, then `label`, then the schema name; each trimmed", () => {
    expect(termDocLabel({ "a:label": " One ", label: "Two", "https://schema.org/name": "Three" })).toBe("One");
    expect(termDocLabel({ label: " Two ", "https://schema.org/name": "Three" })).toBe("Two");
    expect(termDocLabel({ "https://schema.org/name": " Three " })).toBe("Three");
  });
  it("is null when there is none, a blank, or a non-string", () => {
    expect(termDocLabel({})).toBeNull();
    expect(termDocLabel({ "a:label": "   " })).toBeNull();
    expect(termDocLabel({ "a:label": 3 })).toBeNull();
  });
  it("a blank `a:label` does not fall through to the next key (it is present)", () => {
    expect(termDocLabel({ "a:label": "", label: "Two" })).toBeNull();
  });
});

describe("attributeLabel", () => {
  it("reads the label off the SAME document as the spelling: one GET for both", async () => {
    routes[A("addressLine1")] = { body: { "a:predicateAttribute": "a:addressLine1", "a:label": "Address 1" } };
    expect(await attributeSpelling("addressLine1")).toBe("addressLine1");
    expect(await attributeLabel("addressLine1")).toBe("Address 1");
    expect(calls).toHaveLength(1);
  });
  it("is null when the term carries no label", async () => {
    routes[A("x")] = { body: { "a:predicateAttribute": "a:x" } };
    expect(await attributeLabel("x")).toBeNull();
  });
});

describe("termValueSet", () => {
  it("answers the strings of the attribute's own `a:valueSet`, dropping blanks and non-strings", async () => {
    routes[A("level")] = { body: { "a:valueSet": ["low", "  ", 3, "high", ""] } };
    expect(await termValueSet("level")).toEqual(["low", "high"]);
    expect(urls()).toEqual([A("level")]);
  });
  it("takes the wire key `valueSet` when the framed key is absent", async () => {
    routes[A("level")] = { body: { valueSet: ["a"] } };
    expect(await termValueSet("level")).toEqual(["a"]);
  });
  it("a set that is empty after filtering, or not a list, is not a set; with no type to follow it is null", async () => {
    routes[A("e")] = { body: { "a:valueSet": ["", " "] } };
    routes[A("s")] = { body: { "a:valueSet": "low" } };
    expect(await termValueSet("e")).toBeNull();
    expect(await termValueSet("s")).toBeNull();
    expect(calls).toHaveLength(2);
  });
  it("without its own set, reads the type the attribute defines (`a:typeUri` as a string)", async () => {
    routes[A("cefr")] = { body: { "a:typeUri": `${ORIGIN}/base/t/CefrLevelScale` } };
    routes[T("CefrLevelScale")] = { body: { "a:valueSet": ["A1", "A2"] } };
    expect(await termValueSet("cefr")).toEqual(["A1", "A2"]);
    expect(urls()).toEqual([A("cefr"), T("CefrLevelScale")]);
    expect(calls[1]!.init).toEqual({ headers: { accept: ACCEPT } });
  });
  it("the type can be named by a reference `{ @id }` or by the wire key `typeUri`; any host's /t/<Name> names the type", async () => {
    routes[A("ref")] = { body: { typeUri: { "@id": "https://elsewhere.example.test/base/t/Scale" } } };
    routes[T("Scale")] = { body: { valueSet: ["x"] } };
    expect(await termValueSet("ref")).toEqual(["x"]);
  });
  it("the attribute's own set wins: the type is not read", async () => {
    routes[A("own")] = { body: { "a:valueSet": ["mine"], "a:typeUri": `${ORIGIN}/base/t/Other` } };
    expect(await termValueSet("own")).toEqual(["mine"]);
    expect(urls()).toEqual([A("own")]);
  });
  it("a type address that names no `/t/<Name>`, or a non-address, ends in null with no second GET", async () => {
    routes[A("a")] = { body: { "a:typeUri": `${ORIGIN}/base/a/NotAType` } };
    routes[A("b")] = { body: { "a:typeUri": 12 } };
    routes[A("c")] = { body: { "a:typeUri": { nope: 1 } } };
    for (const n of ["a", "b", "c"]) expect(await termValueSet(n)).toBeNull();
    expect(calls).toHaveLength(3);
  });
  it("the type name is URL-encoded when it is read", async () => {
    routes[A("enc")] = { body: { "a:typeUri": `${ORIGIN}/base/t/A%20B` } };
    routes[T("A%2520B")] = { body: { "a:valueSet": ["ok"] } };
    expect(await termValueSet("enc")).toEqual(["ok"]);
  });
  it("a type read that is refused (404) or throws is null", async () => {
    routes[A("a")] = { body: { "a:typeUri": `${ORIGIN}/base/t/Missing` } };
    routes[A("b")] = { body: { "a:typeUri": `${ORIGIN}/base/t/Down` } };
    routes[T("Down")] = "throw";
    expect(await termValueSet("a")).toBeNull();
    expect(await termValueSet("b")).toBeNull();
  });
  it("two questions are one pair of GETs; a set read (or none declared) is held", async () => {
    routes[A("cefr")] = { body: { "a:typeUri": `${ORIGIN}/base/t/S` } };
    routes[T("S")] = { body: { "a:valueSet": ["A1"] } };
    const [x, y] = await Promise.all([termValueSet("cefr"), termValueSet("cefr")]);
    expect([x, y]).toEqual([["A1"], ["A1"]]);
    expect(await termValueSet("cefr")).toEqual(["A1"]);
    expect(calls).toHaveLength(2);
  });
  it("the value-set read shares the attribute's document with the spelling (one GET of the term)", async () => {
    routes[A("level")] = { body: { "a:predicateAttribute": "a:level", "a:valueSet": ["low"] } };
    await attributeSpelling("level");
    expect(await termValueSet("level")).toEqual(["low"]);
    expect(calls).toHaveLength(1);
  });
  it("a term whose document did not answer is asked again (its null is not kept), and then held", async () => {
    let up = false;
    routes[A("level")] = () => (up ? { body: { "a:valueSet": ["low"] } } : { status: 500 });
    expect(await termValueSet("level")).toBeNull();
    expect(await termValueSet("level")).toBeNull();
    up = true;
    expect(await termValueSet("level")).toEqual(["low"]);
    expect(await termValueSet("level")).toEqual(["low"]);
    expect(calls).toHaveLength(3);
  });
});

describe("termLabelOfIri", () => {
  it("reads the label of a term named by its IRI on the term origin", async () => {
    routes[T("Photography")] = { body: { "a:label": "photography" } };
    expect(await termLabelOfIri(`${ORIGIN}/base/t/Photography`)).toBe("photography");
    expect(urls()).toEqual([T("Photography")]);
    expect(calls[0]!.init).toEqual({ headers: { accept: ACCEPT } });
  });
  it("trims the IRI", async () => {
    routes[T("Photography")] = { body: { label: "p" } };
    expect(await termLabelOfIri(`  ${ORIGIN}/base/t/Photography \n`)).toBe("p");
  });
  it("an IRI that is not a term of this origin is null with no request", async () => {
    for (const iri of [
      "https://other.example.test/base/t/Photography",
      `${ORIGIN}/base/a/Photography`,
      `${ORIGIN}/base/t/Photography/`,
      `${ORIGIN}/base/t/Photo-graphy`,
      `${ORIGIN}/base/t/`,
      `${ORIGIN}/base/t/Photography#x`,
      `${ORIGIN}/base/t/Photography?x=1`,
      `x${ORIGIN}/base/t/Photography`,
      `http://ontology.example.test/base/t/Photography`,
      "",
    ]) {
      expect(await termLabelOfIri(iri)).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });
  it("the dots of the origin are literal dots, not any character", async () => {
    expect(await termLabelOfIri("https://ontologyXexample.test/base/t/Photography")).toBeNull();
    expect(calls).toHaveLength(0);
  });
  it("one GET per term with a label; a term that answered with no label is asked again (its null is not kept)", async () => {
    routes[T("Photography")] = { body: { "a:label": "photography" } };
    routes[T("Bare")] = { body: {} };
    await termLabelOfIri(`${ORIGIN}/base/t/Photography`);
    await termLabelOfIri(`${ORIGIN}/base/t/Photography`);
    expect(await termLabelOfIri(`${ORIGIN}/base/t/Bare`)).toBeNull();
    expect(await termLabelOfIri(`${ORIGIN}/base/t/Bare`)).toBeNull();
    expect(calls).toHaveLength(3);
  });
  it("a refused read is null and is asked again; a later answer is held", async () => {
    let up = false;
    routes[T("Photography")] = () => (up ? { body: { "a:label": "photography" } } : "throw");
    expect(await termLabelOfIri(`${ORIGIN}/base/t/Photography`)).toBeNull();
    expect(await termLabelOfIri(`${ORIGIN}/base/t/Photography`)).toBeNull();
    up = true;
    expect(await termLabelOfIri(`${ORIGIN}/base/t/Photography`)).toBe("photography");
    expect(await termLabelOfIri(`${ORIGIN}/base/t/Photography`)).toBe("photography");
    expect(calls).toHaveLength(3);
  });
  it("a 404 is null", async () => {
    routes[T("Gone")] = { status: 404 };
    expect(await termLabelOfIri(`${ORIGIN}/base/t/Gone`)).toBeNull();
  });
});

describe("typeSpelling", () => {
  it("reads the create spelling the master binds to a type, as `t:<Name>`", async () => {
    routes[T("PlaceClaim")] = { body: { "a:typeAttribute": "t:PlaceClaim" } };
    expect(await typeSpelling("PlaceClaim")).toBe("t:PlaceClaim");
    expect(urls()).toEqual([T("PlaceClaim")]);
    expect(calls[0]!.init).toEqual({ headers: { accept: ACCEPT } });
  });
  it("adds `t:` to a bare value, trims, and reads the wire key too", async () => {
    routes[T("A")] = { body: { "a:typeAttribute": "  A " } };
    routes[T("B")] = { body: { typeAttribute: "t:B" } };
    expect(await typeSpelling("A")).toBe("t:A");
    expect(await typeSpelling("B")).toBe("t:B");
  });
  it("a missing, blank or non-string binding, a 404 and a thrown fetch are null", async () => {
    routes[T("None")] = { body: {} };
    routes[T("Blank")] = { body: { "a:typeAttribute": " " } };
    routes[T("Num")] = { body: { "a:typeAttribute": 1 } };
    routes[T("Gone")] = { status: 404 };
    routes[T("Down")] = "throw";
    for (const n of ["None", "Blank", "Num", "Gone", "Down"]) expect(await typeSpelling(n)).toBeNull();
  });
  it("is held once answered (one GET for two calls); a null is asked again", async () => {
    let up = false;
    routes[T("PlaceClaim")] = () => (up ? { body: { "a:typeAttribute": "PlaceClaim" } } : { status: 500 });
    expect(await typeSpelling("PlaceClaim")).toBeNull();
    expect(await typeSpelling("PlaceClaim")).toBeNull();
    up = true;
    expect(await typeSpelling("PlaceClaim")).toBe("t:PlaceClaim");
    expect(await typeSpelling("PlaceClaim")).toBe("t:PlaceClaim");
    expect(calls).toHaveLength(3);
  });
  it("is a cache apart from the label of the same term: a type read and a label read are two GETs", async () => {
    routes[T("Photography")] = { body: { "a:typeAttribute": "t:Photography", "a:label": "photography" } };
    await typeSpelling("Photography");
    await termLabelOfIri(`${ORIGIN}/base/t/Photography`);
    expect(calls).toHaveLength(2);
  });
});

describe("the origin is read when the URL is built", () => {
  it("an origin set after the module was imported is the one used, by every function", async () => {
    resetTermOrigin();
    setTermOrigin("https://late.example.test");
    routes["https://late.example.test/base/a/x"] = { body: { "a:predicateAttribute": "a:x", "a:label": "X", "a:typeUri": "https://late.example.test/base/t/S" } };
    routes["https://late.example.test/base/t/S"] = { body: { "a:valueSet": ["v"], "a:typeAttribute": "S", "a:label": "S" } };
    expect(await attributeSpelling("x")).toBe("x");
    expect(await attributeLabel("x")).toBe("X");
    expect(await termValueSet("x")).toEqual(["v"]);
    expect(await typeSpelling("S")).toBe("t:S");
    expect(await termLabelOfIri("https://late.example.test/base/t/S")).toBe("S");
    expect(urls().every((u) => u.startsWith("https://late.example.test/base/"))).toBe(true);
    expect(urls()).toEqual(["https://late.example.test/base/a/x", "https://late.example.test/base/t/S", "https://late.example.test/base/t/S", "https://late.example.test/base/t/S"]);
  });
  it("changing the origin changes the next URL (terms not yet read), and termLabelOfIri then follows the new origin", async () => {
    routes[A("a")] = { body: {} };
    await attributeSpelling("a");
    setTermOrigin("https://second.example.test");
    routes["https://second.example.test/base/a/b"] = { body: {} };
    await attributeSpelling("b");
    expect(urls()).toEqual([A("a"), "https://second.example.test/base/a/b"]);
    expect(await termLabelOfIri(`${ORIGIN}/base/t/X`)).toBeNull(); // the old origin is no longer the term origin
    expect(calls).toHaveLength(2);
  });
  it("the origin's trailing slash is the setting's business: no double slash in the URL", async () => {
    setTermOrigin(`${ORIGIN}/`);
    routes[A("e")] = { body: {} };
    await attributeSpelling("e");
    expect(urls()).toEqual([A("e")]);
  });
  it("with no origin set, the asking functions throw the setting's own message (the first call, before any GET)", () => {
    resetTermOrigin();
    expect(() => attributeSpelling("x")).toThrow(/setTermOrigin/);
    expect(() => attributeLabel("x")).toThrow(/setTermOrigin/);
    expect(() => typeSpelling("x")).toThrow(/setTermOrigin/);
    expect(() => termLabelOfIri(`${ORIGIN}/base/t/X`)).toThrow(/setTermOrigin/);
    expect(calls).toHaveLength(0);
  });
  it("termLabelOfIri asks for the origin before it looks at the IRI: even a text that is no IRI throws when none is set", () => {
    resetTermOrigin();
    expect(() => termLabelOfIri("not an iri")).toThrow(/setTermOrigin/);
  });
});

describe("__resetTermSlotsForTest", () => {
  it("empties all four caches: the next question asks again", async () => {
    routes[A("a")] = { body: { "a:predicateAttribute": "a:a", "a:valueSet": ["v"] } };
    routes[T("T")] = { body: { "a:typeAttribute": "T", "a:label": "T" } };
    await attributeSpelling("a");
    await termValueSet("a");
    await typeSpelling("T");
    await termLabelOfIri(`${ORIGIN}/base/t/T`);
    expect(calls).toHaveLength(3);
    __resetTermSlotsForTest();
    await attributeSpelling("a");
    await termValueSet("a");
    await typeSpelling("T");
    await termLabelOfIri(`${ORIGIN}/base/t/T`);
    expect(calls).toHaveLength(6);
  });
});
