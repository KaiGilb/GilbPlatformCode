// @vitest-environment node
// A census-named type's plane by dereference of its term, the served-revision gate for the batched read, and which chosen census names go on the
// records door. Ported from heldTypes.test.ts. The term fetcher and the parent walk of `ontology-reads` are mocked as collaborators;
// `heldTypePlanes`, `isIssuedOnTypeFind`, the gate and `classifyPlane` are real. The app's environment values are the settings of `base-origin`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browse = vi.hoisted(() => ({
  fetchOntologyTerm: vi.fn(),
  fetchParentChain: vi.fn(),
}));
vi.mock("@kaigilb/gilbplatformcode-ontology-reads", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchOntologyTerm: browse.fetchOntologyTerm,
  fetchParentChain: browse.fetchParentChain,
}));

import { baseOrigin, setOntologyApiOriginRaw, setVocabTypeBatchRevisions } from "@kaigilb/gilbplatformcode-base-origin";
import { defaultOntologyHost, defaultTermIri } from "@kaigilb/gilbplatformcode-ontology-reads";
import {
  __resetServedRevisionForTest,
  chosenCensusCandidates,
  heldTypePlanes,
  isIssuedOnTypeFind,
  issueChosenCensusNames,
  vocabTypeBatchServed,
  type HeldTypePlane,
} from "./heldTypes";
import { setUp, tearDown } from "../test/support";


/** The term's IDENTITY IRI — the catalog `@id` host, ⛔ baseOrigin() (nchor). */
const T = (n: string) => defaultTermIri(n);

function doc(name: string, raw: Record<string, unknown>) {
  return { term: T(name), name, label: name, does: "", status: "Approved", module: "planguage-core", kind: "type", parentTerm: null, capableOf: [], providesFunction: [], hasValue: [], measures: null, endpointSubject: null, unresolvedRef: null, raw: { "@id": T(name), ...raw } };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  __resetServedRevisionForTest();
  setUp();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  browse.fetchParentChain.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("plane by dereference of the term (singular path, no pin)", () => {
  it("dereferences each held name ONCE at its IDENTITY IRI (veda host, never baseOrigin ) and classifies over the facts", async () => {
    browse.fetchOntologyTerm.mockImplementation(async (iri: string) => {
      if (iri === T("NoteDocument")) return doc("NoteDocument", { "a:nodeKind": "type" });
      if (iri === T("Classify")) return doc("Classify", { "a:nodeKind": "function" });
      if (iri === T("CapableOf")) return doc("CapableOf", { "a:nodeKind": "relation" });
      if (iri === T("title")) return doc("title", { "a:nodeKind": "attribute" });
      if (iri === T("Speed")) return doc("Speed", { "a:nodeKind": "value" });
      return null;
    });
    const reading = await heldTypePlanes(["NoteDocument", "Classify", "CapableOf", "title", "Speed"]);
    expect(reading.planes.get("NoteDocument")).toBe("entity");
    expect(reading.planes.get("Classify")).toBe("function");
    expect(reading.planes.get("CapableOf")).toBe("relation");
    expect(reading.planes.get("title")).toBe("attribute");
    expect(reading.planes.get("Speed")).toBe("value");
    expect(browse.fetchOntologyTerm).toHaveBeenCalledTimes(5);
    expect(reading.dereferences).toBe(5);
    expect(reading.parentWalks).toBe(0);
    expect(reading.batched).toBe(0);
    // The shipped fetcher, at the term's IDENTITY origin — the catalog @id host — never the
    // app's baseOrigin() (whose apex /base/t/* is host-identity-bound and 404s in production).
    for (const call of browse.fetchOntologyTerm.mock.calls) {
      const iri = String(call[0]);
      expect(iri.startsWith(`https://${defaultOntologyHost()}/base/t/`)).toBe(true);
      expect(iri.startsWith(baseOrigin())).toBe(false);
    }
    // No `/base/vocab` document was pulled to answer a plane question.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a kind-ABSENT term walks its parent chain and the is-a line decides (relation ancestor → relation)", async () => {
    browse.fetchOntologyTerm.mockImplementation(async (iri: string) =>
      iri === T("PartOf") ? doc("PartOf", { "a:label": "part of" }) : iri === T("Widget") ? doc("Widget", { "a:label": "widget" }) : null,
    );
    browse.fetchParentChain.mockImplementation(async (iri: string) =>
      iri === T("PartOf")
        ? [doc("Relation", {}), doc("PartOf", {})]
        : iri === T("Widget")
          ? [doc("Thing", {}), doc("Widget", {})]
          : [],
    );
    const reading = await heldTypePlanes(["PartOf", "Widget"]);
    expect(reading.planes.get("PartOf")).toBe("relation");
    expect(reading.planes.get("Widget")).toBe("entity");
    expect(reading.parentWalks).toBe(2);
    expect(browse.fetchParentChain).toHaveBeenCalledWith(T("PartOf"));
  });

  it("an UNCATALOGUED name (the term 404s — WritingPlanguage) reads `uncatalogued` and IS issued", async () => {
    browse.fetchOntologyTerm.mockResolvedValue(null);
    const reading = await heldTypePlanes(["WritingPlanguage"]);
    expect(reading.planes.get("WritingPlanguage")).toBe("uncatalogued");
    expect(isIssuedOnTypeFind("uncatalogued")).toBe(true);
    expect(browse.fetchParentChain).not.toHaveBeenCalled();
  });

  it("issued planes: entity · function · value · uncatalogued; NOT issued: relation · attribute · undefined", () => {
    expect(isIssuedOnTypeFind("entity")).toBe(true);
    expect(isIssuedOnTypeFind("function")).toBe(true);
    expect(isIssuedOnTypeFind("value")).toBe(true);
    expect(isIssuedOnTypeFind("relation")).toBe(false);
    expect(isIssuedOnTypeFind("attribute")).toBe(false);
    expect(isIssuedOnTypeFind(undefined)).toBe(false);
  });

  it("VITE_ONTOLOGY_API_ORIGIN, when set, names the origin the terms are dereferenced at (a rig serving the corpus)", async () => {
    setOntologyApiOriginRaw("http://rig.example.test:8787/");
    browse.fetchOntologyTerm.mockResolvedValue(doc("Person", { "a:nodeKind": "type" }));
    await heldTypePlanes(["Person"]);
    expect(browse.fetchOntologyTerm).toHaveBeenCalledWith("http://rig.example.test:8787/base/t/Person");
  });

  it("de-duplicates and trims names; an empty census issues nothing", async () => {
    browse.fetchOntologyTerm.mockResolvedValue(doc("Person", { "a:nodeKind": "type" }));
    const reading = await heldTypePlanes([" Person ", "Person", ""]);
    expect([...reading.planes.keys()]).toEqual(["Person"]);
    expect(reading.dereferences).toBe(1);
    const none = await heldTypePlanes([]);
    expect(none.planes.size).toBe(0);
    expect(none.dereferences).toBe(0);
  });
});

describe("(v) — the batched read is gated on the SERVED REVISION, never on a body-shape probe", () => {
  it("with NO pin the gate is closed and /version is never asked", async () => {
    expect(await vocabTypeBatchServed()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with a pin that does NOT match the served revision the gate is closed (singular path)", async () => {
    setVocabTypeBatchRevisions("deadbeef");
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ revision: "636faf3ae340118f" }) } as unknown as Response);
    expect(await vocabTypeBatchServed()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${baseOrigin()}/version`);
    browse.fetchOntologyTerm.mockResolvedValue(doc("Person", { "a:nodeKind": "type" }));
    const reading = await heldTypePlanes(["Person"]);
    expect(reading.batched).toBe(0);
    expect(reading.dereferences).toBe(1);
    // /version is read ONCE per session, not per census.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("with a pin that matches (prefix) the gate opens: ONE /base/vocab?type= per ≤100 names, graph-absent names uncatalogued", async () => {
    setVocabTypeBatchRevisions("abc123,636faf3");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/version")) return { ok: true, status: 200, json: async () => ({ revision: "636faf3ae340118f" }) } as unknown as Response;
      if (url.includes("/base/vocab?type=")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            "@graph": [
              { "@id": T("NoteDocument"), "a:nodeKind": "type" },
              { "@id": T("CapableOf"), "a:nodeKind": "relation" },
              { "@id": T("Orphan") }, // kind-absent → parent chain (singular, cached)
            ],
          }),
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    browse.fetchParentChain.mockResolvedValue([doc("Function", {}), doc("Orphan", {})]);
    expect(await vocabTypeBatchServed()).toBe(true);
    const reading = await heldTypePlanes(["NoteDocument", "CapableOf", "Orphan", "WritingPlanguage"]);
    expect(reading.batched).toBe(1);
    expect(reading.dereferences).toBe(0);
    expect(reading.parentWalks).toBe(1);
    expect(reading.planes.get("NoteDocument")).toBe("entity");
    expect(reading.planes.get("CapableOf")).toBe("relation");
    expect(reading.planes.get("Orphan")).toBe("function");
    expect(reading.planes.get("WritingPlanguage")).toBe("uncatalogued");
    const vocabCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/base/vocab?type="));
    expect(vocabCalls).toHaveLength(1);
    expect(vocabCalls[0]).toContain("type=NoteDocument");
    expect(vocabCalls[0]).toContain("type=WritingPlanguage");
  });

  it("a failed batch chunk falls back to the singular path for its names — never an unknown plane", async () => {
    setVocabTypeBatchRevisions("636faf3");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/version")) return { ok: true, status: 200, json: async () => ({ revision: "636faf3ae" }) } as unknown as Response;
      return { ok: false, status: 500 } as unknown as Response;
    });
    browse.fetchOntologyTerm.mockResolvedValue(doc("Person", { "a:nodeKind": "type" }));
    const reading = await heldTypePlanes(["Person"]);
    expect(reading.batched).toBe(1);
    expect(reading.dereferences).toBe(1);
    expect(reading.planes.get("Person")).toBe("entity");
  });

  it("101 names → TWO batched calls (the D8b cap is respected on the vocabulary door too)", async () => {
    setVocabTypeBatchRevisions("636faf3");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/version")) return { ok: true, status: 200, json: async () => ({ revision: "636faf3ae" }) } as unknown as Response;
      return { ok: true, status: 200, json: async () => ({ "@graph": [] }) } as unknown as Response;
    });
    const names = Array.from({ length: 101 }, (_, i) => `T${i}`);
    const reading = await heldTypePlanes(names);
    expect(reading.batched).toBe(2);
    const counts = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/base/vocab?type=")).map((u) => (u.match(/type=/g) ?? []).length);
    expect(counts).toEqual([100, 1]);
  });
});

// ── — the chosen types, narrowed to what the vault's census holds ─────────
//
// Specified by the design,
// Implementation 1, and by the ValPlan row ("A role record of each kind must be
// listed"). The census rows below carry the spellings the platform answered on the scratch rig
// (M5, `base_c214gapp26r2_test`, GilbPlatform `556c42c9`, 2026-09-30T12:32:35Z): the relation kinds
// came back as `t:<Name>`, under `excludedTypes` in the `/base/r/` vault and under `types` in the
// `/vault/r/` vault. ⚠ The production code this step adds names no stakeholder kind; the fixtures
// below name `Person` and `Organization` as values (the census rows spell `t:Person`;
// `Organization` appears only as a bare chosen name), and the relation kinds are stand-ins
// (relation-plane types this suite already uses). Every expected value is a literal.
describe("which chosen census names go on ?type=", () => {
  const reading = (entries: Record<string, HeldTypePlane>) => ({
    planes: new Map(Object.entries(entries)),
    dereferences: Object.keys(entries).length,
    parentWalks: 0,
    batched: 0,
  });
  const chose = (...keys: string[]) => (typeUri: string) =>
    keys.includes(typeUri.replace(/^t:/, "").replace(/^.*\/base\/t\//, ""));

  /** The `/base/r/` vault: roles are disclosed only under `excludedTypes`, beside a name-set exclusion. */
  const baseFormCensus = {
    types: [{ typeUri: "t:Person" }, { typeUri: "t:Task" }, { typeUri: "t:NoteDocument" }],
    excludedTypes: [{ typeUri: "t:CapableOf" }, { typeUri: "t:WorksFor" }, { typeUri: "t:TagHandle" }],
  };
  /** The `/vault/r/` vault: the same kinds are listed under `types`. */
  const vaultFormCensus = {
    types: [{ typeUri: "t:Person" }, { typeUri: "t:CapableOf" }, { typeUri: "t:NoteDocument" }],
    excludedTypes: [{ typeUri: "t:TagHandle" }],
  };

  it("splits the census into the chosen names it holds and the chosen names it only discloses as excluded", () => {
    const c = chosenCensusCandidates(baseFormCensus, chose("Person", "CapableOf", "TagHandle", "Organization"));
    expect(c.held).toEqual(["Person"]);
    expect(c.excluded).toEqual(["CapableOf", "TagHandle"]);
  });

  it("a type that was not chosen is in neither list, wherever the census puts it", () => {
    const c = chosenCensusCandidates(baseFormCensus, chose("Person"));
    expect(c.held).toEqual(["Person"]);
    expect(c.excluded).toEqual([]);
  });

  it("a chosen type the vault does not hold is in neither list", () => {
    const c = chosenCensusCandidates(baseFormCensus, chose("Organization"));
    expect(c).toEqual({ held: [], excluded: [] });
  });

  it("the store's spellings of one type merge by bare name, and a name under both lists counts once, as held", () => {
    const c = chosenCensusCandidates(
      {
        types: [{ typeUri: "t:CapableOf" }, { typeUri: "https://ontology.platform.example.test/base/t/CapableOf" }],
        excludedTypes: [{ typeUri: "t:CapableOf" }],
      },
      chose("CapableOf"),
    );
    expect(c).toEqual({ held: ["CapableOf"], excluded: [] });
  });

  it("/base/r/ form: a chosen relation kind under excludedTypes IS issued; a chosen name-set exclusion is NOT", () => {
    const c = chosenCensusCandidates(baseFormCensus, chose("Person", "CapableOf", "TagHandle"));
    const out = issueChosenCensusNames(c, reading({ Person: "entity", CapableOf: "relation", TagHandle: "entity" }));
    expect(out.issued).toEqual(["Person", "CapableOf"]);
    expect(out.notIssued).toEqual(["TagHandle"]);
  });

  it("/vault/r/ form: a chosen relation kind under types IS issued", () => {
    const c = chosenCensusCandidates(vaultFormCensus, chose("Person", "CapableOf"));
    const out = issueChosenCensusNames(c, reading({ Person: "entity", CapableOf: "relation" }));
    expect(out.issued).toEqual(["Person", "CapableOf"]);
    expect(out.notIssued).toEqual([]);
  });

  it("a chosen attribute-plane name is not issued from either list (positive control: the entity beside it is)", () => {
    const out = issueChosenCensusNames(
      { held: ["Person", "HeldAttr"], excluded: ["ExcludedAttr"] },
      reading({ Person: "entity", HeldAttr: "attribute", ExcludedAttr: "attribute" }),
    );
    expect(out.issued).toEqual(["Person"]);
    expect(out.notIssued).toEqual(["HeldAttr", "ExcludedAttr"]);
  });

  it("an uncatalogued chosen name is issued when held  and not issued when only excluded", () => {
    const out = issueChosenCensusNames(
      { held: ["HeldUnknown"], excluded: ["ExcludedUnknown"] },
      reading({ HeldUnknown: "uncatalogued", ExcludedUnknown: "uncatalogued" }),
    );
    expect(out.issued).toEqual(["HeldUnknown"]);
    expect(out.notIssued).toEqual(["ExcludedUnknown"]);
  });

  it("function and value planes are issued when held and not issued when only excluded", () => {
    const out = issueChosenCensusNames(
      { held: ["HeldFn", "HeldVal"], excluded: ["ExcludedFn", "ExcludedVal"] },
      reading({ HeldFn: "function", HeldVal: "value", ExcludedFn: "function", ExcludedVal: "value" }),
    );
    expect(out.issued).toEqual(["HeldFn", "HeldVal"]);
    expect(out.notIssued).toEqual(["ExcludedFn", "ExcludedVal"]);
  });

  it("a name whose plane was not read is not issued", () => {
    const out = issueChosenCensusNames({ held: ["NoReading"], excluded: ["NoReadingEither"] }, reading({}));
    expect(out.issued).toEqual([]);
    expect(out.notIssued).toEqual(["NoReading", "NoReadingEither"]);
  });
});
