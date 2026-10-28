import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetBaseOrigin,
  resetLocalRigHosts,
  resetMinOntologyQuery,
  resetOntologyApiOrigin,
  resetPublicCorpusOrigin,
  resetSystemVaultHosts,
  setBaseOrigin,
  setLocalRigHosts,
  setMinOntologyQuery,
  setOntologyApiOrigin,
  setPublicCorpusOrigin,
  setSystemVaultHosts,
} from "@kaigilb/gilbplatformcode-base-origin";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import * as api from "./index";
import {
  BUILTIN_TYPE_OPTIONS,
  normalizeTypeName,
  readTermDefinition,
  DEGRADED_REACH,
  LIVE_TERM_LIMIT,
  TYPE_PICTURE_ATTR,
  VEDA_ID_PREFIX,
  blankQueryReach,
  corpusApiOrigin,
  defaultOntologyHost,
  defaultTermIri,
  fetchTypePictureSrc,
  fileBytesUrl,
  kindFromNodeKind,
  searchLiveTerms,
  shortQueryReach,
  typeOptionFromSpec,
  typePictureSrc,
} from "./index";

const APEX = "https://platform.example.test";
const ONTOLOGY = "https://veda.platform.example.test";

beforeEach(() => {
  setBaseOrigin(APEX);
  setSystemVaultHosts(["veda.platform.example.test"]);
  setTermOrigin(ONTOLOGY);
});
afterEach(() => {
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  resetOntologyApiOrigin();
  resetMinOntologyQuery();
  resetPublicCorpusOrigin();
  resetTermOrigin();
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const asked: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      asked.push({ url: String(url), init });
      return handler(String(url), init);
    }),
  );
  return asked;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("corpusApiOrigin", () => {
  it("is the platform origin when nothing else is set", () => {
    expect(corpusApiOrigin()).toBe(APEX);
  });

  it("is the override when one is set, with the origin form of the setting", () => {
    setOntologyApiOrigin("https://corpus.example.test/");
    expect(corpusApiOrigin()).toBe("https://corpus.example.test");
  });

  it("on a local rig (the base host is a rig host) it is the public corpus origin", () => {
    setBaseOrigin("http://localhost:8787");
    setLocalRigHosts(["localhost"]);
    setPublicCorpusOrigin("https://corpus.example.test");
    expect(corpusApiOrigin()).toBe("https://corpus.example.test");
  });

  it("the override beats the rig", () => {
    setBaseOrigin("http://localhost:8787");
    setLocalRigHosts(["localhost"]);
    setPublicCorpusOrigin("https://corpus.example.test");
    setOntologyApiOrigin("https://override.example.test");
    expect(corpusApiOrigin()).toBe("https://override.example.test");
  });

  it("each loopback name the app tested for is a rig host once the app names it", () => {
    setPublicCorpusOrigin("https://corpus.example.test");
    setLocalRigHosts(["localhost", "127.0.0.1", "[::1]"]);
    for (const base of ["http://localhost:8787", "http://127.0.0.1:8787", "http://[::1]:8787"]) {
      setBaseOrigin(base);
      expect(corpusApiOrigin(), base).toBe("https://corpus.example.test");
    }
  });

  it("with no rig host set, a local base is just the platform origin and the public corpus origin is never read", () => {
    setBaseOrigin("http://localhost:8787");
    expect(corpusApiOrigin()).toBe("http://localhost:8787");
  });

  it("the public corpus origin is read only inside the rig branch: a production base never needs it", () => {
    expect(() => corpusApiOrigin()).not.toThrow();
    setBaseOrigin("http://localhost:8787");
    setLocalRigHosts(["localhost"]);
    expect(() => corpusApiOrigin()).toThrow(/setPublicCorpusOrigin/);
  });

  it("with no platform origin set it throws naming setBaseOrigin", () => {
    resetBaseOrigin();
    expect(() => corpusApiOrigin()).toThrow(/setBaseOrigin/);
  });
});

describe("searchLiveTerms", () => {
  const TERMS = {
    terms: [
      { term: "https://veda.platform.example.test/base/t/Rule", label: "Rule", nodeKind: "type", does: " states a rule " },
      { term: "https://veda.platform.example.test/base/t/Communicate", label: "", nodeKind: "function" },
      { term: "https://veda.platform.example.test/base/t/Findability", label: "Findability", nodeKind: "value" },
      { term: "https://veda.platform.example.test/base/t/IsA", label: "Is A", nodeKind: "relation" },
      { term: "https://veda.platform.example.test/base/t/Title", label: "Title", nodeKind: "attribute" },
      { term: "https://veda.platform.example.test/base/t/NoteDocument", label: "Note Document" },
      { term: "https://veda.platform.example.test/base/t/Contact", label: "Contact" },
    ],
    complete: true,
  };

  it("a blank query answers the shipped types and the blank sentence, and asks nothing", async () => {
    const asked = stubFetch(() => json(TERMS));
    const r = await searchLiveTerms("   ");
    expect(asked).toEqual([]);
    expect(r.options).toBe(BUILTIN_TYPE_OPTIONS);
    expect(r.reach).toBe(blankQueryReach());
    expect(r.degraded).toBe(false);
  });

  it("a query under the floor filters the shipped types only, says how many letters are missing, and asks nothing", async () => {
    const asked = stubFetch(() => json(TERMS));
    const r = await searchLiveTerms("ta");
    expect(asked).toEqual([]);
    expect(r.options.map((o) => o.id)).toEqual(["task"]);
    expect(r.reach).toBe(shortQueryReach("ta"));
    expect(r.degraded).toBe(false);
  });

  it("the floor is the setting: 5 moves it, and a query is counted trimmed", async () => {
    setMinOntologyQuery(5);
    const asked = stubFetch(() => json(TERMS));
    await searchLiveTerms("rule");
    expect(asked).toEqual([]);
    await searchLiveTerms("  rule  ");
    expect(asked).toEqual([]);
    await searchLiveTerms("rules");
    expect(asked).toHaveLength(1);
  });

  it("a floor of 0 asks for a one-letter query", async () => {
    setMinOntologyQuery(0);
    const asked = stubFetch(() => json(TERMS));
    await searchLiveTerms("r");
    expect(asked).toHaveLength(1);
  });

  it("asks the corpus origin for the trimmed, encoded query with the limit, and sends accept only", async () => {
    const asked = stubFetch(() => json(TERMS));
    await searchLiveTerms("  a b&c ");
    expect(asked).toHaveLength(1);
    expect(asked[0]!.url).toBe(`${APEX}/base/terms?q=a%20b%26c&limit=${LIVE_TERM_LIMIT}`);
    expect(asked[0]!.init).toEqual({ headers: { accept: "application/json" } });
    expect(LIVE_TERM_LIMIT).toBe(20);
  });

  it("asks the override origin when one is set", async () => {
    setOntologyApiOrigin("https://corpus.example.test");
    const asked = stubFetch(() => json(TERMS));
    await searchLiveTerms("rule");
    expect(asked[0]!.url.startsWith("https://corpus.example.test/base/terms?")).toBe(true);
  });

  it("answers the shipped matches first, then the live terms as veda: options with their kind, label and definition", async () => {
    stubFetch(() => json(TERMS));
    const r = await searchLiveTerms("rule");
    expect(r.options.map((o) => o.id)).toEqual(["veda:Rule", "veda:Communicate", "veda:Findability"]);
    const [rule, comm, value] = r.options;
    expect(rule).toEqual({ id: "veda:Rule", label: "Rule", typeName: "Rule", spec: null, kind: "type", definition: "states a rule" });
    expect(comm).toEqual({ id: "veda:Communicate", label: "Communicate", typeName: "Communicate", spec: null, kind: "function", definition: null });
    expect(value!.kind).toBe("value");
    expect(r.degraded).toBe(false);
    expect(r.reach).toBe("Searching all of GilbVeda — every type, function and value except deprecated ones.");
  });

  it("leaves out relations, attributes and scales, and the shipped names and their aliases", async () => {
    stubFetch(() => json(TERMS));
    const r = await searchLiveTerms("note");
    expect(r.options.map((o) => o.id)).toEqual(["note", "veda:Rule", "veda:Communicate", "veda:Findability"]);
  });

  it("an answer with no live term says GilbVeda has none matching", async () => {
    stubFetch(() => json({ terms: [], complete: true }));
    const r = await searchLiveTerms("zzzz");
    expect(r.options).toEqual([]);
    expect(r.reach).toBe("GilbVeda has no term matching “zzzz”.");
  });

  it("complete:false says there are more than the limit, and does not read the count", async () => {
    stubFetch(() => json({ ...TERMS, complete: false }));
    const r = await searchLiveTerms("rule");
    expect(r.reach).toBe("More than 20 GilbVeda terms match “rule” — keep typing to narrow it.");
  });

  it("a body without a terms list is an empty live list", async () => {
    stubFetch(() => json({}));
    const r = await searchLiveTerms("rule");
    expect(r.options).toEqual([]);
    expect(r.degraded).toBe(false);
  });

  it("a hit with no usable label takes its type name; a hit with no term is skipped as nameless", async () => {
    stubFetch(() => json({ terms: [{ term: "https://x.example.test/base/t/Alpha", label: "  " }, { label: "x" }] }));
    const r = await searchLiveTerms("alp");
    expect(r.options.map((o) => [o.id, o.label])).toEqual([["veda:Alpha", "Alpha"], ["veda:", "x"]]);
  });

  it("a failed answer is degraded with the shipped matches and the unreachable sentence, never an absence", async () => {
    stubFetch(() => json({}, 500));
    const r = await searchLiveTerms("task");
    expect(r.degraded).toBe(true);
    expect(r.reach).toBe(DEGRADED_REACH);
    expect(r.options.map((o) => o.id)).toEqual(["task"]);
  });

  it("a network error and a body that is not JSON are degraded too", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await searchLiveTerms("task")).degraded).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    const r = await searchLiveTerms("task");
    expect(r.degraded).toBe(true);
    expect(r.reach).toBe(DEGRADED_REACH);
  });
});

describe("the sentences and the options", () => {
  it("blankQueryReach and shortQueryReach follow the floor setting, at the time of the call", () => {
    expect(blankQueryReach()).toBe("The types GilbApp ships with fields. Type at least 3 letters to search all of GilbVeda.");
    setMinOntologyQuery(4);
    expect(blankQueryReach()).toContain("at least 4 letters");
    setMinOntologyQuery(1);
    expect(blankQueryReach()).toContain("at least 1 letters");
    setMinOntologyQuery(0);
    expect(blankQueryReach()).toBe("The types GilbApp ships with fields. Type to search all of GilbVeda.");
  });

  it("shortQueryReach says how many more letters, in the singular for one", () => {
    expect(shortQueryReach("a")).toBe("Type 2 more letters to search all of GilbVeda — showing only the types GilbApp ships.");
    expect(shortQueryReach("ab")).toBe("Type 1 more letter to search all of GilbVeda — showing only the types GilbApp ships.");
  });

  it("DEGRADED_REACH says the catalogue could not be reached and that this is not a statement of absence", () => {
    expect(DEGRADED_REACH).toBe(
      "GilbVeda's catalogue could not be reached — showing only the types GilbApp ships. This is not a statement that other types do not exist.",
    );
  });

  it("BUILTIN_TYPE_OPTIONS are the four registry types the Plan card does not own, in registry order, all of kind type", () => {
    expect(BUILTIN_TYPE_OPTIONS.map((o) => [o.id, o.label, o.typeName, o.kind])).toEqual([
      ["note", "Note", "NoteDocument", "type"],
      ["person", "Person", "Person", "type"],
      ["task", "Task", "Task", "type"],
      ["folder", "Folder", "VirtualFolder", "type"],
    ]);
    for (const o of BUILTIN_TYPE_OPTIONS) expect(o.spec).not.toBeNull();
  });

  it("typeOptionFromSpec carries the spec's id, label and type name and the spec itself", () => {
    const spec = BUILTIN_TYPE_OPTIONS[2]!.spec!;
    expect(typeOptionFromSpec(spec)).toEqual({ id: "task", label: "Task", typeName: "Task", spec, kind: "type" });
  });

  it("VEDA_ID_PREFIX is veda:", () => {
    expect(VEDA_ID_PREFIX).toBe("veda:");
  });

  it("kindFromNodeKind trims and lower-cases, and treats anything unknown as a type", () => {
    expect(kindFromNodeKind("  FUNCTION ")).toBe("function");
    expect(kindFromNodeKind("Value")).toBe("value");
    expect(kindFromNodeKind(null)).toBe("type");
    expect(kindFromNodeKind("")).toBe("type");
    expect(kindFromNodeKind("whatever")).toBe("type");
    expect(kindFromNodeKind(" Relation ")).toBeNull();
  });
});

describe("defaultOntologyHost and defaultTermIri", () => {
  it("the host is the host of the term origin, read at call time", () => {
    expect(defaultOntologyHost()).toBe("veda.platform.example.test");
    setTermOrigin("http://ontology.example.test:8080");
    expect(defaultOntologyHost()).toBe("ontology.example.test:8080");
  });

  it("with no term origin set it throws naming setTermOrigin", () => {
    resetTermOrigin();
    expect(() => defaultOntologyHost()).toThrow(/setTermOrigin/);
    expect(() => defaultTermIri("Person")).toThrow(/setTermOrigin/);
    expect(defaultTermIri("Person", "x.example.test")).toBe("https://x.example.test/base/t/Person");
  });

  it("defaultTermIri is always https, percent-encodes the name and takes a host", () => {
    expect(defaultTermIri("Person")).toBe("https://veda.platform.example.test/base/t/Person");
    expect(defaultTermIri("Note Document")).toBe("https://veda.platform.example.test/base/t/Note%20Document");
    setTermOrigin("http://ontology.example.test:8080");
    expect(defaultTermIri("Person")).toBe("https://ontology.example.test:8080/base/t/Person");
  });
});

describe("readTermDefinition, beyond the ported tests", () => {
  it("a blank name asks nothing and is unreachable with a reason that names the host", async () => {
    const asked = stubFetch(() => json({}));
    expect(await readTermDefinition("  ")).toEqual({ state: "unreachable", reason: "no term name to resolve at veda.platform.example.test" });
    expect(await readTermDefinition("t:")).toEqual({ state: "unreachable", reason: "no term name to resolve at veda.platform.example.test" });
    expect(asked).toEqual([]);
  });

  it("a non-200 answer is unreachable even when its body is a term document that carries a definition", async () => {
    stubFetch(() => json({ "a:does": "x" }, 404));
    expect(await readTermDefinition("Person")).toEqual({ state: "unreachable", reason: "veda.platform.example.test answered 404 for Person" });
  });

  it("the host is the second argument, and defaults to the host of the term origin", async () => {
    const asked = stubFetch(() => json({ "a:does": "x" }));
    await readTermDefinition("Person", "other.example.test");
    await readTermDefinition("Person");
    expect(asked.map((a) => a.url)).toEqual(["https://other.example.test/base/t/Person", "https://veda.platform.example.test/base/t/Person"]);
  });

  it("a definition is trimmed", async () => {
    stubFetch(() => json({ "a:does": "  does it  " }));
    expect(await readTermDefinition("Person")).toEqual({ state: "defined", does: "does it" });
  });
});

describe("normalizeTypeName, beyond the ported tests", () => {
  it("drops a .png suffix in any case, and refuses a name that still holds a slash or is empty", () => {
    expect(normalizeTypeName("Chair.png")).toBe("Chair");
    expect(normalizeTypeName("https://x.example.test/base/t/Chair.PNG")).toBe("Chair");
    expect(normalizeTypeName("a/b")).toBeNull();
    expect(normalizeTypeName("")).toBeNull();
    expect(normalizeTypeName("   ")).toBeNull();
    expect(normalizeTypeName(null)).toBeNull();
    expect(normalizeTypeName(undefined)).toBeNull();
    expect(normalizeTypeName("t:")).toBeNull();
  });
});

describe("the type picture", () => {
  it("TYPE_PICTURE_ATTR is a:typePicture", () => {
    expect(TYPE_PICTURE_ATTR).toBe("a:typePicture");
  });

  it("typeTermUrl-built reads follow the term origin that is set", async () => {
    const asked = stubFetch(() => json({ "a:typePicture": { "@id": `${ONTOLOGY}/base/e/abc12345` } }));
    expect(await fetchTypePictureSrc("Chair2")).toBe(`${ONTOLOGY}/files/abc12345`);
    expect(asked.map((a) => a.url)).toEqual([`${ONTOLOGY}/base/t/Chair2`]);
    expect(asked[0]!.init).toEqual({ headers: { accept: "application/json" } });
  });

  it("an empty or unusable name asks nothing and answers null", async () => {
    const asked = stubFetch(() => json({}));
    expect(await fetchTypePictureSrc("")).toBeNull();
    expect(await fetchTypePictureSrc("a/b")).toBeNull();
    expect(asked).toEqual([]);
  });

  it("an answer is remembered per name: a second read asks nothing", async () => {
    const asked = stubFetch(() => json({ "a:typePicture": { "@id": `${ONTOLOGY}/base/e/abc12345` } }));
    const a = await fetchTypePictureSrc("Chair3");
    const b = await fetchTypePictureSrc("t:Chair3");
    expect(b).toBe(a);
    expect(asked).toHaveLength(1);
  });

  it("a 404 is remembered as null (no hunt); a 500 and a network error are not remembered", async () => {
    let status = 404;
    const asked = stubFetch(() => json({}, status));
    expect(await fetchTypePictureSrc("Chair4")).toBeNull();
    expect(await fetchTypePictureSrc("Chair4")).toBeNull();
    expect(asked).toHaveLength(1);
    status = 500;
    expect(await fetchTypePictureSrc("Chair5")).toBeNull();
    status = 200;
    expect(await fetchTypePictureSrc("Chair5")).toBeNull();
    expect(asked).toHaveLength(3);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await fetchTypePictureSrc("Chair6")).toBeNull();
    const again = stubFetch(() => json({ "a:typePicture": { "@id": `${ONTOLOGY}/base/e/zz123456` } }));
    expect(await fetchTypePictureSrc("Chair6")).toBe(`${ONTOLOGY}/files/zz123456`);
    expect(again).toHaveLength(1);
  });

  it("fileBytesUrl is the entity's own vault origin plus /files/<id>, and refuses anything that is not a /base/e/ entity address", () => {
    expect(fileBytesUrl(`${ONTOLOGY}/base/e/abc12345`)).toBe(`${ONTOLOGY}/files/abc12345`);
    expect(fileBytesUrl("https://evil.example/base/e/abc12345")).toBe(`${APEX}/files/abc12345`);
    expect(fileBytesUrl(`${ONTOLOGY}/base/t/Chair.png`)).toBeNull();
    expect(fileBytesUrl(`${ONTOLOGY}/base/e/`)).toBeNull();
    expect(fileBytesUrl(`${ONTOLOGY}/base/t/Chair`)).toBeNull();
    expect(fileBytesUrl(`${ONTOLOGY}/lws/r/abc12345`)).toBeNull();
    expect(fileBytesUrl(`${ONTOLOGY}/base/e/thumb.png`)).toBeNull();
    expect(fileBytesUrl(`${ONTOLOGY}/base/e/doc.jpeg`)).toBeNull();
    expect(fileBytesUrl(42)).toBeNull();
    expect(fileBytesUrl(null)).toBeNull();
    expect(fileBytesUrl("/base/e/abc12345")).toBeNull();
  });

  it("an entity id that merely contains png is a picture (the anchored extension test)", () => {
    expect(fileBytesUrl(`${ONTOLOGY}/base/e/fpngn43e70b4`)).toBe(`${ONTOLOGY}/files/fpngn43e70b4`);
    expect(typePictureSrc({ "a:typePicture": { "@id": `${ONTOLOGY}/base/e/fpngn43e70b4` } })).toBe(`${ONTOLOGY}/files/fpngn43e70b4`);
  });

  it("typePictureSrc takes the object form only, and the a: key before the bare key", () => {
    expect(typePictureSrc({ "a:typePicture": `${ONTOLOGY}/base/e/abc12345` })).toBeNull();
    expect(typePictureSrc({ "a:typePicture": { "@id": `${ONTOLOGY}/base/e/aaaa1111` }, typePicture: { "@id": `${ONTOLOGY}/base/e/bbbb2222` } })).toBe(`${ONTOLOGY}/files/aaaa1111`);
    expect(typePictureSrc(undefined)).toBeNull();
  });
});

describe("the export list", () => {
  it("is exactly these names (the types are erased)", () => {
    expect(Object.keys(api).sort()).toEqual([
      "BUILTIN_TYPE_OPTIONS",
      "DEGRADED_REACH",
      "LIVE_TERM_LIMIT",
      "TYPE_PICTURE_ATTR",
      "VEDA_ID_PREFIX",
      "__resetOntologyTermsForTest",
      "blankQueryReach",
      "corpusApiOrigin",
      "defaultOntologyHost",
      "defaultTermIri",
      "fetchOntologyTerm",
      "fetchParentChain",
      "fetchTermAtRef",
      "fetchTypePictureSrc",
      "fileBytesUrl",
      "hopableTermIris",
      "kindFromNodeKind",
      "kindFromRaw",
      "looksLikeStoreId",
      "normalizeTypeName",
      "ontologyRefIri",
      "readTermDefinition",
      "searchLiveTerms",
      "shortQueryReach",
      "typeOptionFromSpec",
      "typePictureSrc",
      "typeTermUrl",
    ]);
  });
});
