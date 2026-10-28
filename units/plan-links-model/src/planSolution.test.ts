// Pinning tests for planSolution: every export has at least one, and the odd cases are pinned as the code does them.
import { describe, expect, it } from "vitest";
import {
  SOLUTION_OF_ROLES,
  SOLUTION_OF_TYPE,
  readPartOf,
  readPartOfFact,
  relationMemberIds,
  solutionOfCacheRow,
  solutionOfFunctions,
  solutionsTargeting,
  type PartOfReading,
} from "./index";

const HOST = "https://vault.example.test";
const e = (id: string) => `${HOST}/base/e/${id}`;
const R = `${HOST}/base/r/s1`;

describe("constants", () => {
  it("SOLUTION_OF_TYPE and SOLUTION_OF_ROLES", () => {
    expect(SOLUTION_OF_TYPE).toBe("t:SolutionOf");
    expect(SOLUTION_OF_ROLES).toEqual({ source: "role:source", target: "role:target" });
  });
});

describe("solutionOfFunctions", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    relation: R,
    role: "role:source",
    type: "t:SolutionOf",
    members: [{ member: e("fn"), role: "role:target" }],
    ...over,
  });

  it("reads the Functions a Solution names", () => {
    expect(solutionOfFunctions([row()])).toEqual([{ relation: R, uri: e("fn") }]);
  });
  it("takes the type in any spelling of its name", () => {
    expect(solutionOfFunctions([row({ type: `${HOST}/base/t/SolutionOf` })])).toHaveLength(1);
    expect(solutionOfFunctions([row({ type: "SolutionOf" })])).toHaveLength(1);
  });
  it("ignores another type, a missing type, and a row where the record is the target", () => {
    expect(solutionOfFunctions([row({ type: "t:PartOf" })])).toEqual([]);
    expect(solutionOfFunctions([row({ type: undefined })])).toEqual([]);
    expect(solutionOfFunctions([row({ role: "role:target" })])).toEqual([]);
  });
  it("lists every target member, in order, skipping other roles and blank members", () => {
    const members = [
      { member: e("f1"), role: "target" },
      { member: e("x"), role: "role:source" },
      { member: "   ", role: "role:target" },
      { member: e("f2"), role: "role:target" },
    ];
    expect(solutionOfFunctions([row({ members })]).map((m) => m.uri)).toEqual([e("f1"), e("f2")]);
  });
  it("keeps a member address as served (not trimmed)", () => {
    expect(solutionOfFunctions([row({ members: [{ member: ` ${e("f1")} `, role: "target" }] })])[0]?.uri).toBe(` ${e("f1")} `);
  });
  it("a row without members gives nothing; no rows give nothing", () => {
    expect(solutionOfFunctions([row({ members: undefined })])).toEqual([]);
    expect(solutionOfFunctions([])).toEqual([]);
    expect(solutionOfFunctions(null)).toEqual([]);
    expect(solutionOfFunctions(undefined)).toEqual([]);
  });
  it("reads several relations", () => {
    const out = solutionOfFunctions([row(), row({ relation: `${HOST}/base/r/s2`, members: [{ member: e("f2"), role: "target" }] })]);
    expect(out).toEqual([{ relation: R, uri: e("fn") }, { relation: `${HOST}/base/r/s2`, uri: e("f2") }]);
  });
});

describe("solutionsTargeting", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    relation: R,
    role: "role:target",
    type: "t:SolutionOf",
    members: [{ member: e("sol"), role: "role:source" }],
    ...over,
  });
  it("reads the Solutions that name a Function", () => {
    expect(solutionsTargeting([row()])).toEqual([{ relation: R, uri: e("sol") }]);
  });
  it("ignores another type, the source row, and non-source members", () => {
    expect(solutionsTargeting([row({ type: "t:ImpactOn" })])).toEqual([]);
    expect(solutionsTargeting([row({ role: "role:source" })])).toEqual([]);
    expect(solutionsTargeting([row({ members: [{ member: e("x"), role: "role:target" }, { member: "", role: "source" }] })])).toEqual([]);
  });
  it("null and undefined rows give nothing", () => {
    expect(solutionsTargeting(null)).toEqual([]);
    expect(solutionsTargeting(undefined)).toEqual([]);
  });
});

describe("solutionOfCacheRow", () => {
  it("as the source view: this record is the source, the other is the target", () => {
    expect(solutionOfCacheRow({ relation: R, view: "source", otherUri: e("fn") })).toEqual({
      relation: R,
      role: "role:source",
      type: "t:SolutionOf",
      members: [{ member: e("fn"), role: "role:target" }],
    });
  });
  it("as the target view: the other way round", () => {
    expect(solutionOfCacheRow({ relation: R, view: "target", otherUri: e("sol") })).toEqual({
      relation: R,
      role: "role:target",
      type: "t:SolutionOf",
      members: [{ member: e("sol"), role: "role:source" }],
    });
  });
  it("is read back by the readers", () => {
    expect(solutionOfFunctions([solutionOfCacheRow({ relation: R, view: "source", otherUri: e("fn") })])).toEqual([{ relation: R, uri: e("fn") }]);
    expect(solutionsTargeting([solutionOfCacheRow({ relation: R, view: "target", otherUri: e("sol") })])).toEqual([{ relation: R, uri: e("sol") }]);
  });
});

describe("relationMemberIds", () => {
  it("holds each address, its id and its canonical address", () => {
    expect([...relationMemberIds([`${e("a")}?x=1`])].sort()).toEqual([`${e("a")}?x=1`, e("a"), "a"].sort());
  });
  it("holds a value that is not an address as it is", () => {
    expect([...relationMemberIds(["urn:thing:1", "plain"])].sort()).toEqual(["plain", "urn:thing:1"]);
  });
  it("is empty for no addresses, and merges the spellings of two", () => {
    expect(relationMemberIds([]).size).toBe(0);
    const out = relationMemberIds([e("a"), `${HOST}/vault/e/a`]);
    expect(out.has(e("a"))).toBe(true);
    expect(out.has(`${HOST}/vault/e/a`)).toBe(true);
    expect(out.has("a")).toBe(true);
  });
});

describe("readPartOf", () => {
  const link = (uri: string): PartOfReading => ({ kind: "link", uri });
  const EMPTY: PartOfReading = { kind: "empty" };

  it("an {\"@id\"} is the link, trimmed, kept as given", () => {
    expect(readPartOf({ "@id": e("s") })).toEqual(link(e("s")));
    expect(readPartOf({ "@id": `  ${e("s")}?x=1 ` })).toEqual(link(`${e("s")}?x=1`));
  });
  it("an older {\"a:label\"} (or {\"label\"}) is words, not a link", () => {
    expect(readPartOf({ "a:label": " The Walker " })).toEqual({ kind: "label", label: "The Walker" });
    expect(readPartOf({ label: "The Walker" })).toEqual({ kind: "label", label: "The Walker" });
  });
  it("the link wins over the words; a blank @id falls to the words", () => {
    expect(readPartOf({ "@id": e("s"), "a:label": "words" })).toEqual(link(e("s")));
    expect(readPartOf({ "@id": "  ", "a:label": "words" })).toEqual({ kind: "label", label: "words" });
  });
  it("an object with neither is empty; so are blank words", () => {
    expect(readPartOf({})).toEqual(EMPTY);
    expect(readPartOf({ "a:label": "   " })).toEqual(EMPTY);
    expect(readPartOf({ "a:label": 5 })).toEqual(EMPTY);
    expect(readPartOf({ "@id": 5 })).toEqual(EMPTY);
  });
  it("a string that is an entity address or a urn: is a link, kept trimmed but otherwise as given", () => {
    expect(readPartOf(` ${e("s")}?x=1 `)).toEqual(link(`${e("s")}?x=1`));
    expect(readPartOf("urn:sys:1")).toEqual(link("urn:sys:1"));
  });
  it("any other string is empty, as is a blank one", () => {
    expect(readPartOf("The Walker")).toEqual(EMPTY);
    expect(readPartOf("")).toEqual(EMPTY);
    expect(readPartOf("   ")).toEqual(EMPTY);
    expect(readPartOf(`${HOST}/base/t/Function`)).toEqual(EMPTY);
  });
  it("a string holding JSON is parsed; broken JSON is empty", () => {
    expect(readPartOf(JSON.stringify({ "@id": e("s") }))).toEqual(link(e("s")));
    expect(readPartOf(JSON.stringify([{ "a:label": "old" }]))).toEqual({ kind: "label", label: "old" });
    expect(readPartOf('{"@id":')).toEqual(EMPTY);
    expect(readPartOf("[not json")).toEqual(EMPTY);
  });
  it("a list gives its first non-empty reading", () => {
    expect(readPartOf([null, "", {}, { "a:label": "words" }, { "@id": e("s") }])).toEqual({ kind: "label", label: "words" });
    expect(readPartOf([{ "@id": e("s") }])).toEqual(link(e("s")));
    expect(readPartOf([])).toEqual(EMPTY);
    expect(readPartOf([[], [{ "@id": e("deep") }]])).toEqual(link(e("deep")));
  });
  it("null, undefined, numbers and booleans are empty", () => {
    for (const v of [null, undefined, 0, 7, true, false]) expect(readPartOf(v)).toEqual(EMPTY);
  });
});

describe("readPartOfFact", () => {
  it("reads the served partOf first, else the flat fact", () => {
    expect(readPartOfFact({ facts: {}, served: { facts: { partOf: { "@id": e("s") } } } })).toEqual({ kind: "link", uri: e("s") });
    expect(readPartOfFact({ facts: { partOf: e("flat") } })).toEqual({ kind: "link", uri: e("flat") });
    expect(readPartOfFact({ facts: { partOf: e("flat") }, served: { facts: { partOf: { "@id": e("served") } } } })).toEqual({ kind: "link", uri: e("served") });
  });
  it("finds the a:-spelled key", () => {
    expect(readPartOfFact({ facts: {}, served: { facts: { "a:partOf": [{ "@id": e("s") }] } } })).toEqual({ kind: "link", uri: e("s") });
  });
  it("an older {\"a:label\"} is read as words, not a link", () => {
    expect(readPartOfFact({ facts: {}, served: { facts: { partOf: { "a:label": "Old system" } } } })).toEqual({ kind: "label", label: "Old system" });
    expect(readPartOfFact({ facts: { partOf: JSON.stringify({ "a:label": "Old system" }) }, served: null })).toEqual({ kind: "label", label: "Old system" });
  });
  it("no partOf is empty", () => {
    expect(readPartOfFact({ facts: {} })).toEqual({ kind: "empty" });
    expect(readPartOfFact({ facts: {}, served: null })).toEqual({ kind: "empty" });
  });
});
