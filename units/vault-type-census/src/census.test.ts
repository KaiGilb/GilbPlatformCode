// @vitest-environment node
// New tests for what the ported ones leave open: the plane rules, the pure name derivations, the catalogue read and its cache, and the revision gate.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setOntologyApiOriginRaw, setVocabTypeBatchRevisions } from "@kaigilb/gilbplatformcode-base-origin";
import {
  __resetServedRevisionForTest,
  censusBareNames,
  classifyCensusNames,
  heldTypePlanes,
  vocabTypeBatchServed,
  type HeldTypePlaneReading,
} from "./heldTypes";
import { classifyPlane, isCreatePlane } from "./vocabCatalog";
import { chosenCensusCandidates, issueChosenCensusNames } from "./heldTypes";
import { ONTOLOGY, ORIGIN, setUp, tearDown } from "../test/support";

const browse = vi.hoisted(() => ({ fetchOntologyTerm: vi.fn(), fetchParentChain: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-ontology-reads", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchOntologyTerm: browse.fetchOntologyTerm,
  fetchParentChain: browse.fetchParentChain,
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setUp();
  vi.clearAllMocks();
  __resetServedRevisionForTest();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  browse.fetchParentChain.mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  tearDown();
});

describe("classifyPlane: the first rule that matches wins", () => {
  it("relation: by node kind, by the predicate flag, or by a Relation ancestor", () => {
    expect(classifyPlane({ "a:nodeKind": "relation" }, [])).toBe("relation");
    expect(classifyPlane({ "a:isRelationPredicate": true }, [])).toBe("relation");
    expect(classifyPlane({}, [`${ONTOLOGY}/base/t/Relation`])).toBe("relation");
    expect(classifyPlane({ "@id": `${ONTOLOGY}/base/t/Relation` }, [])).toBe("relation");
  });
  it("attribute: by node kind, by an attribute predicate with an a: or skos: value, or by an Identity ancestor", () => {
    expect(classifyPlane({ "a:nodeKind": "attribute" }, [])).toBe("attribute");
    expect(classifyPlane({ "a:predicateAttribute": "a:title" }, [])).toBe("attribute");
    expect(classifyPlane({ "a:predicateAttribute": { "@id": "skos:prefLabel" } }, [])).toBe("attribute");
    expect(classifyPlane({}, [`${ONTOLOGY}/base/t/Identity`])).toBe("attribute");
  });
  it("a t:-prefixed predicate attribute is not an attribute: the value prefix decides, not the key", () => {
    expect(classifyPlane({ "a:predicateAttribute": "t:Note" }, [])).toBe("entity");
    expect(classifyPlane({ "a:predicateAttribute": { "@id": "t:Note" } }, [])).toBe("entity");
    expect(classifyPlane({ "a:predicateAttribute": 5 }, [])).toBe("entity");
  });
  it("value: by node kind or by any fact only a value carries", () => {
    expect(classifyPlane({ "a:nodeKind": "value" }, [])).toBe("value");
    for (const k of ["a:measures", "a:valuedBy", "a:scale", "a:unit", "a:scaleAnchors", "a:meter", "a:hasMeter", "a:endpointSubject", "a:endpointReference"]) {
      expect(classifyPlane({ [k]: "x" }, [])).toBe("value");
    }
  });
  it("function: by node kind, by a verb, or by a Function ancestor; providesFunction does not make one", () => {
    expect(classifyPlane({ "a:nodeKind": "function" }, [])).toBe("function");
    expect(classifyPlane({ "a:verb": "write" }, [])).toBe("function");
    expect(classifyPlane({}, [`${ONTOLOGY}/base/t/Function`])).toBe("function");
    expect(classifyPlane({ "a:providesFunction": "t:Rule" }, [])).toBe("entity");
  });
  it("anything else is an entity, and the order is relation, attribute, value, function", () => {
    expect(classifyPlane({}, [])).toBe("entity");
    expect(classifyPlane({ "a:nodeKind": "type" }, [])).toBe("entity");
    expect(classifyPlane({ "a:nodeKind": "relation", "a:scale": "1", "a:verb": "x" }, [])).toBe("relation");
    expect(classifyPlane({ "a:predicateAttribute": "a:x", "a:scale": "1" }, [])).toBe("attribute");
    expect(classifyPlane({ "a:scale": "1", "a:verb": "x" }, [])).toBe("value");
  });
  it("isCreatePlane is entity, function or value", () => {
    expect(["entity", "function", "value", "relation", "attribute"].map((p) => isCreatePlane(p as never))).toEqual([true, true, true, false, false]);
  });
});

describe("the pure derivations", () => {
  it("censusBareNames merges the store's spellings by bare local name, in first-seen order, and drops blanks", () => {
    expect(censusBareNames([{ typeUri: "t:Person" }, { typeUri: `${ONTOLOGY}/base/t/Person` }, { typeUri: "Task" }, { typeUri: "" }, { typeUri: " t:Note " }])).toEqual(["Person", "Task", "Note"]);
  });
  it("classifyCensusNames splits into issued, not issued and uncatalogued", () => {
    const reading: HeldTypePlaneReading = {
      planes: new Map([["A", "entity"], ["B", "relation"], ["C", "uncatalogued"], ["D", "attribute"], ["E", "value"]] as const),
      dereferences: 5,
      parentWalks: 0,
      batched: 0,
    };
    expect(classifyCensusNames(["A", "B", "C", "D", "E", "F"], reading)).toEqual({ issued: ["A", "C", "E"], notIssued: ["B", "D", "F"], uncatalogued: ["C"] });
  });
});

describe("heldTypePlanes", () => {
  it("counts a parent walk only for a term whose facts carry no node kind", async () => {
    browse.fetchOntologyTerm.mockImplementation(async (iri: string) => ({ term: iri, raw: iri.endsWith("/Bare") ? {} : { "a:nodeKind": "type" } }));
    browse.fetchParentChain.mockResolvedValue([{ term: `${ONTOLOGY}/base/t/Relation` }]);
    const reading = await heldTypePlanes(["Bare", "Typed"]);
    expect(reading.parentWalks).toBe(1);
    expect(reading.planes.get("Bare")).toBe("relation");
    expect(reading.planes.get("Typed")).toBe("entity");
  });
  it("leaves the term itself out of the ancestors it passes to the rule", async () => {
    browse.fetchOntologyTerm.mockImplementation(async (iri: string) => ({ term: iri, raw: { "@id": iri } }));
    browse.fetchParentChain.mockResolvedValue([{ term: `${ONTOLOGY}/base/t/Bare` }, { term: `${ONTOLOGY}/base/t/Function` }]);
    const reading = await heldTypePlanes(["Bare"]);
    expect(reading.planes.get("Bare")).toBe("function");
  });
  it("a term named like a plane is not its own ancestor", async () => {
    browse.fetchOntologyTerm.mockImplementation(async (iri: string) => ({ term: iri, raw: {} }));
    browse.fetchParentChain.mockResolvedValue([{ term: `${ONTOLOGY}/base/t/Relation` }, { term: `${ONTOLOGY}/base/t/Thing` }]);
    const reading = await heldTypePlanes(["Relation"]);
    expect(reading.planes.get("Relation")).toBe("entity");
  });
  it("an ontology API origin set as text is used as given, trimmed, with one trailing slash removed", async () => {
    setOntologyApiOriginRaw("  http://rig.example.test:8787/  ");
    browse.fetchOntologyTerm.mockResolvedValue(null);
    await heldTypePlanes(["Person Name"]);
    expect(browse.fetchOntologyTerm).toHaveBeenCalledWith("http://rig.example.test:8787/base/t/Person%20Name");
  });
  it("a blank ontology API origin is no override", async () => {
    setOntologyApiOriginRaw("   ");
    browse.fetchOntologyTerm.mockResolvedValue(null);
    await heldTypePlanes(["Person"]);
    expect(browse.fetchOntologyTerm).toHaveBeenCalledWith(`${ONTOLOGY}/base/t/Person`);
  });
});

describe("issueChosenCensusNames", () => {
  it("reports the relation kinds among the issued names, and none when there are none", () => {
    const planes = new Map([["Role", "relation"], ["Person", "entity"], ["Hidden", "relation"]] as const);
    const reading: HeldTypePlaneReading = { planes, dereferences: 3, parentWalks: 0, batched: 0 };
    const candidates = chosenCensusCandidates(
      { types: [{ typeUri: "t:Role" }, { typeUri: "t:Person" }], excludedTypes: [{ typeUri: "t:Hidden" }] },
      () => true,
    );
    const out = issueChosenCensusNames(candidates, reading);
    expect(out.issued).toEqual(["Role", "Person", "Hidden"]);
    expect(out.relation).toEqual(["Role", "Hidden"]);
    expect(out.notIssued).toEqual([]);
    const plain = issueChosenCensusNames({ held: ["Person"], excluded: [] }, reading);
    expect(plain.relation).toEqual([]);
  });
});

describe("the served-revision gate", () => {
  it("the revision is read once per session, from the platform's own origin, and a miss is a closed gate", async () => {
    setVocabTypeBatchRevisions("abc");
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
    expect(await vocabTypeBatchServed()).toBe(false);
    expect(await vocabTypeBatchServed()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${ORIGIN}/version`);
  });
  it("a revision that is not a non-empty string, or a read that throws, closes the gate", async () => {
    setVocabTypeBatchRevisions("abc");
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ revision: "" }) } as unknown as Response);
    expect(await vocabTypeBatchServed()).toBe(false);
    __resetServedRevisionForTest();
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await vocabTypeBatchServed()).toBe(false);
  });
  it("the pins are split at commas, trimmed, and empty parts are dropped; an all-empty pin never asks", async () => {
    setVocabTypeBatchRevisions(" , ,");
    expect(await vocabTypeBatchServed()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    setVocabTypeBatchRevisions(" x1 , abc ,");
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ revision: "abcdef" }) } as unknown as Response);
    expect(await vocabTypeBatchServed()).toBe(true);
  });
  it("a pin matches by prefix of the served revision, not by containment", async () => {
    setVocabTypeBatchRevisions("def");
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ revision: "abcdef" }) } as unknown as Response);
    expect(await vocabTypeBatchServed()).toBe(false);
  });
});

describe("the opt-in catalogue", () => {
  // The catalogue keeps module state (its cache), so each test loads a fresh copy of the module and sets the origin on the fresh copy of base-origin.
  let readFindTypeCatalog: typeof import("./vocabCatalog").readFindTypeCatalog;
  let catalogNodeTypeNames: typeof import("./vocabCatalog").catalogNodeTypeNames;
  beforeEach(async () => {
    vi.resetModules();
    (await import("@kaigilb/gilbplatformcode-base-origin")).setBaseOrigin(ORIGIN);
    ({ readFindTypeCatalog, catalogNodeTypeNames } = await import("./vocabCatalog"));
  });
  const graph = (n: number) => ({
    "@graph": [
      { "@id": `${ONTOLOGY}/base/t/Person`, "a:label": "Person" },
      { "@id": `${ONTOLOGY}/base/t/Person${n}`, "a:label": " Zed " },
      { "@id": `${ONTOLOGY}/base/t/X`, "a:label": "short" },
      { "@id": `${ONTOLOGY}/base/e/NotAType`, "a:label": "entity" },
      { "@id": "t:Fn", "a:verb": "do" },
      { "@id": `${ONTOLOGY}/base/t/Rel`, "a:nodeKind": "relation" },
    ],
  });
  const answer = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
  it("asks the opt-in listing at the platform origin, without a credential", async () => {
    fetchMock.mockResolvedValue(answer(graph(1)));
    await readFindTypeCatalog();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/base/vocab?status=all`);
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
  });
  it("derives the entries: only /t/ ids, names of two letters or more, label trimmed or the name, sorted by label", async () => {
    fetchMock.mockResolvedValue(answer(graph(1)));
    const { terms, stale } = await readFindTypeCatalog();
    expect(stale).toBe(false);
    expect(terms.map((t) => [t.name, t.label, t.plane])).toEqual([
      ["Fn", "Fn", "function"],
      ["Person", "Person", "entity"],
      ["Rel", "Rel", "relation"],
      ["Person1", "Zed", "entity"],
    ]);
  });
  it("keeps the read for a minute: a second read in that time is not a request, a read after it is", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(answer(graph(1)));
    await readFindTypeCatalog();
    vi.advanceTimersByTime(59_999);
    await readFindTypeCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    await readFindTypeCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("concurrent reads share one request", async () => {
    fetchMock.mockResolvedValue(answer(graph(2)));
    await Promise.all([readFindTypeCatalog(), readFindTypeCatalog()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("a refused read is an outage, not an empty ontology: no terms, stale", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as unknown as Response);
    const out = await readFindTypeCatalog();
    expect(out.terms).toEqual([]);
    expect(out.stale).toBe(true);
  });
  it("a read that fails after a good one gives the last good terms, marked stale", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(answer(graph(3)));
    const good = await readFindTypeCatalog();
    vi.advanceTimersByTime(61_000);
    fetchMock.mockRejectedValue(new Error("offline"));
    const out = await readFindTypeCatalog();
    expect(out.stale).toBe(true);
    expect(out.terms).toEqual(good.terms);
    expect(out.terms.length).toBeGreaterThan(0);
  });
  it("a document with a terms list instead of a graph is read too", async () => {
    fetchMock.mockResolvedValue(answer({ terms: [{ "@id": `${ONTOLOGY}/base/t/Alpha`, "a:label": "Alpha" }] }));
    expect((await readFindTypeCatalog()).terms.map((t) => t.name)).toEqual(["Alpha"]);
  });
  it("a plane rule sees the ancestors of a term up to 64 steps away, and no further", async () => {
    const chain = (relationAt: number) => {
      const nodes = [];
      for (let i = 0; i <= 70; i++) {
        const id = i === relationAt ? `${ONTOLOGY}/base/t/Relation` : `${ONTOLOGY}/base/t/N${i}`;
        nodes.push({ "@id": id, "a:subTypeOf": { "@id": `${ONTOLOGY}/base/t/${i + 1 === relationAt ? "Relation" : `N${i + 1}`}` } });
      }
      return { "@graph": nodes };
    };
    fetchMock.mockResolvedValue(answer(chain(3)));
    expect((await readFindTypeCatalog()).terms.find((t) => t.name === "N0")?.plane).toBe("relation");
    vi.resetModules();
    (await import("@kaigilb/gilbplatformcode-base-origin")).setBaseOrigin(ORIGIN);
    ({ readFindTypeCatalog } = await import("./vocabCatalog"));
    fetchMock.mockResolvedValue(answer(chain(70)));
    expect((await readFindTypeCatalog()).terms.find((t) => t.name === "N0")?.plane).toBe("entity");
  });
  it("catalogNodeTypeNames trims a name and counts two spellings of it once", async () => {
    fetchMock.mockResolvedValue(answer({ "@graph": [{ "@id": `${ONTOLOGY}/base/t/Alpha` }, { "@id": `${ONTOLOGY}/base/t/Alpha ` }] }));
    expect(await catalogNodeTypeNames()).toEqual(["Alpha"]);
  });
  it("catalogNodeTypeNames: the create planes only, trimmed, no repeats", async () => {
    fetchMock.mockResolvedValue(answer({ "@graph": [{ "@id": `${ONTOLOGY}/base/t/Alpha` }, { "@id": `${ONTOLOGY}/base/t/Alpha` }, { "@id": `${ONTOLOGY}/base/t/Rel`, "a:nodeKind": "relation" }, { "@id": `${ONTOLOGY}/base/t/Val`, "a:scale": "1" }] }));
    expect(await catalogNodeTypeNames()).toEqual(["Alpha", "Val"]);
  });
});
