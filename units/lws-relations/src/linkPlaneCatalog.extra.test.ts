// New. The live user-plane catalogue: where it is read, how long it is kept, who shares a read in flight, what a failure leaves, and the
// rules `catalogFromGraph` applies to the terms it is given.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setCatalogForTest, catalogFromGraph, liveIsOfferable, readUserLinkPlaneCatalog } from "./index";
import { resp, setUp, tearDown } from "../test/support";

const T = "https://ontology.example.test/base/t";
const term = (tail: string, extra: Record<string, unknown> = {}) => ({ "@id": `${T}/${tail}`, "a:linkPlane": "user", "a:label": tail.toLowerCase(), "a:typeAttribute": `t:${tail}`, ...extra });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setUp();
  __setCatalogForTest(null);
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => resp(200, { body: { "@graph": [term("Alpha"), term("Beta")] } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __setCatalogForTest(null);
  tearDown();
});

describe("readUserLinkPlaneCatalog", () => {
  it("is read from the corpus origin with the public headers, and fills the live set", async () => {
    expect(liveIsOfferable("t:Alpha")).toBe(false);
    const cat = await readUserLinkPlaneCatalog();
    expect(cat.terms.map((t) => t.curie)).toEqual(["t:Alpha", "t:Beta"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://platform.example.test/base/vocab?status=all&linkPlane=user");
    expect(init.headers).toEqual({ accept: "application/ld+json, application/json" });
    expect(liveIsOfferable("t:Alpha")).toBe(true);
    expect(liveIsOfferable("t:Gamma")).toBe(false);
    expect(liveIsOfferable(null)).toBe(false);
    expect(liveIsOfferable(undefined)).toBe(false);
    expect(liveIsOfferable("")).toBe(false);
  });
  it("is kept for a minute, and read again after it", async () => {
    await readUserLinkPlaneCatalog();
    await vi.advanceTimersByTimeAsync(59_000);
    await readUserLinkPlaneCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await readUserLinkPlaneCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("two reads at once are one request", async () => {
    const [a, b] = await Promise.all([readUserLinkPlaneCatalog(), readUserLinkPlaneCatalog()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
  it("a read that fails with nothing kept leaves an empty, stale catalogue, and offers nothing", async () => {
    fetchMock.mockResolvedValue(resp(503, { body: {} }));
    await expect(readUserLinkPlaneCatalog()).resolves.toEqual({ plane: "user", terms: [], roots: [], stale: true, excludedUnwritable: [] });
    fetchMock.mockRejectedValue(new Error("offline"));
    await vi.advanceTimersByTimeAsync(61_000);
    await expect(readUserLinkPlaneCatalog()).resolves.toMatchObject({ stale: true, terms: [] });
    expect(liveIsOfferable("t:Alpha")).toBe(false);
  });
  it("a read that fails with a catalogue kept gives that catalogue back (stale when the network failed), and keeps offering its terms", async () => {
    await readUserLinkPlaneCatalog();
    await vi.advanceTimersByTimeAsync(61_000);
    fetchMock.mockResolvedValue(resp(500, { body: {} }));
    const afterStatus = await readUserLinkPlaneCatalog();
    expect(afterStatus.terms).toHaveLength(2);
    expect(afterStatus.stale).toBe(false);
    await vi.advanceTimersByTimeAsync(61_000);
    fetchMock.mockRejectedValue(new Error("offline"));
    const afterNetwork = await readUserLinkPlaneCatalog();
    expect(afterNetwork.terms).toHaveLength(2);
    expect(afterNetwork.stale).toBe(true);
    expect(liveIsOfferable("t:Beta")).toBe(true);
  });
  it("a body with no @graph is an empty catalogue that is kept", async () => {
    fetchMock.mockResolvedValue(resp(200, { body: {} }));
    await expect(readUserLinkPlaneCatalog()).resolves.toMatchObject({ terms: [], stale: false });
    await readUserLinkPlaneCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("__setCatalogForTest injects a catalogue and its live set, and null forgets both", async () => {
    __setCatalogForTest(catalogFromGraph([term("Delta")], "user"));
    expect(liveIsOfferable("t:Delta")).toBe(true);
    await expect(readUserLinkPlaneCatalog()).resolves.toMatchObject({ terms: [{ curie: "t:Delta" }] });
    expect(fetchMock).not.toHaveBeenCalled();
    __setCatalogForTest(null);
    expect(liveIsOfferable("t:Delta")).toBe(false);
  });
});

describe("catalogFromGraph", () => {
  it("keeps only the plane asked for and only ids that are terms", () => {
    const cat = catalogFromGraph([term("A"), term("B", { "a:linkPlane": "grant" }), { "@id": "https://x.example.test/other/C", "a:linkPlane": "user" }, {}], "user");
    expect(cat.terms.map((t) => t.curie)).toEqual(["t:A"]);
    expect(cat.plane).toBe("user");
    expect(cat.stale).toBe(false);
    expect(catalogFromGraph([], "user", true).stale).toBe(true);
  });
  it("a term with no a:typeAttribute is written as t: and its tail; a declared binding is taken at its word", () => {
    const cat = catalogFromGraph([{ "@id": `${T}/Plain`, "a:linkPlane": "user" }, term("Declared", { "a:typeAttribute": "t:Other" })], "user");
    expect(cat.terms.map((t) => t.curie).sort()).toEqual(["t:Other", "t:Plain"]);
  });
  it("a binding with several writable spellings, or none, leaves the term out and says so", () => {
    const cat = catalogFromGraph(
      [
        term("Multi", { "a:typeAttribute": "t:One | t:Two" }),
        term("Dead", { "a:typeAttribute": "t:Old", "a:deprecatedNotation": "t:Old" }),
        term("Notation", { "a:typeAttribute": "not-a-curie" }),
        term("Retired", { "a:typeAttribute": "t:Old2 | t:New2", "a:deprecatedNotation": "t:Old2" }),
      ],
      "user",
    );
    expect(cat.terms.map((t) => t.curie)).toEqual(["t:New2"]);
    expect([...cat.excludedUnwritable].sort()).toEqual([`${T}/Dead`, `${T}/Multi`, `${T}/Notation`]);
  });
  it("the label is the stored label, or the tail with labelled false", () => {
    const cat = catalogFromGraph([term("Has", { "a:label": { "@value": "Has Label" } }), { "@id": `${T}/NoLabel`, "a:linkPlane": "user" }], "user");
    const has = cat.terms.find((t) => t.curie === "t:Has")!;
    const none = cat.terms.find((t) => t.curie === "t:NoLabel")!;
    expect([has.label, has.labelled]).toEqual(["Has Label", true]);
    expect([none.label, none.labelled]).toEqual(["NoLabel", false]);
  });
  it("directed is stated, or follows from a symmetric flag that is stated false; an unstated pair is not directed", () => {
    const flags = (a: unknown, s: unknown) => {
      const t = catalogFromGraph([term("X", { "a:directed": a, "a:symmetric": s })], "user").terms[0]!;
      return [t.directed, t.symmetric];
    };
    expect(flags(true, undefined)).toEqual([true, false]);
    expect(flags("true", "false")).toEqual([true, false]);
    expect(flags(undefined, false)).toEqual([true, false]);
    expect(flags(undefined, "false")).toEqual([true, false]);
    expect(flags(undefined, true)).toEqual([false, true]);
    expect(flags(undefined, undefined)).toEqual([false, false]);
    expect(flags(false, true)).toEqual([false, true]);
  });
  it("references between terms are resolved by the other term's own spelling; a reference it cannot resolve is null, never a guess", () => {
    const cat = catalogFromGraph(
      [
        term("Parent", { "a:typeAttribute": "t:ParentBound" }),
        term("Child", { "a:subTypeOf": { "@id": `${T}/Parent` }, "a:inverseOf": `${T}/Parent`, "a:inverseLabel": "parent-of" }),
        term("Lost", { "a:subTypeOf": `${T}/Missing`, "a:inverseOf": `${T}/Missing` }),
      ],
      "user",
    );
    const child = cat.terms.find((t) => t.curie === "t:Child")!;
    expect([child.parentCurie, child.inverseOfCurie, child.inverseLabel]).toEqual(["t:ParentBound", "t:ParentBound", "parent-of"]);
    const lost = cat.terms.find((t) => t.curie === "t:Lost")!;
    expect([lost.parentIri, lost.parentCurie, lost.inverseOfCurie]).toEqual([`${T}/Missing`, null, null]);
  });
  it("a composes-to chain is kept only when every step resolves, in the order served", () => {
    const cat = catalogFromGraph(
      [
        term("S1"),
        term("S2"),
        term("Whole", { "a:composesTo": [{ "@id": `${T}/S2` }, `${T}/S1`] }),
        term("Broken", { "a:composesTo": [`${T}/S1`, `${T}/Missing`] }),
        term("One", { "a:composesTo": `${T}/S1` }),
      ],
      "user",
    );
    const by = (c: string) => cat.terms.find((t) => t.curie === c)!;
    expect(by("t:Whole").composesTo).toEqual(["t:S2", "t:S1"]);
    expect(by("t:Broken").composesTo).toEqual([]);
    expect(by("t:One").composesTo).toEqual(["t:S1"]);
  });
  it("the terms are sorted by label, and the roots are those whose parent is the Relation category or is not itself in the plane", () => {
    const cat = catalogFromGraph(
      [
        term("Zed", { "a:label": "zed" }),
        term("Mid", { "a:label": "mid", "a:subTypeOf": { "@id": `${T}/Relation` } }),
        term("Kid", { "a:label": "kid", "a:subTypeOf": { "@id": `${T}/Zed` } }),
        term("Out", { "a:label": "out", "a:subTypeOf": "https://elsewhere.example.test/base/t/Thing" }),
      ],
      "user",
    );
    expect(cat.terms.map((t) => t.label)).toEqual(["kid", "mid", "out", "zed"]);
    expect(cat.roots.map((t) => t.label)).toEqual(["mid", "out", "zed"]);
  });
  it("text is trimmed, a blank is nothing, and an @value or @id wrapper is read through", () => {
    const t = catalogFromGraph([term("W", { "a:label": "  padded  ", "a:does": { "@value": "  does it " }, "a:genderedLabel": "   " })], "user").terms[0]!;
    expect([t.label, t.does, t.genderedLabel]).toEqual(["padded", "does it", null]);
  });
});

describe("catalogFromGraph: roots when the Relation category is itself a term of the plane", () => {
  it("a term whose parent is the Relation category is a root even though that parent is in the plane", () => {
    const cat = catalogFromGraph([term("Relation", { "a:label": "relation" }), term("Direct", { "a:label": "direct", "a:subTypeOf": { "@id": `${T}/Relation` } }), term("Nested", { "a:label": "nested", "a:subTypeOf": { "@id": `${T}/Direct` } })], "user");
    expect(cat.roots.map((t) => t.label)).toEqual(["direct", "relation"]);
  });
});
