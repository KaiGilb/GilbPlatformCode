// Pins for the exports added for the Development Resource card, and for the type origin the default Endpoint reads.
// The type origin is set in test/setup.ts to https://ontology.example.test and forgotten after each test.
// The code wins: where a result looks odd it is pinned as it is.
import { describe, expect, it } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import * as api from "./index";
import {
  BUDGET_LEVEL_TYPE,
  DEFAULT_LEVEL_ROWS,
  OFFERED_LEVEL_KINDS,
  RESOURCE_DEFAULT_LEVEL_ROWS,
  RESOURCE_OFFERED_LEVEL_KINDS,
  blankLevel,
  defaultDirectionFor,
  defaultEndpointFor,
  defaultLevelRowsFor,
  levelCreateFacts,
  levelPatch,
  levelTypeName,
  offeredLevelKindsFor,
  readLevelRecord,
  readValueCard,
  resourceKind,
  scaleCreateFacts,
  scalePatch,
  sortLevels,
  valueCardPatch,
} from "./planValue";
import { RESOURCE_LEVEL_KINDS, STANDARD_LEVEL_KINDS, kindClass, levelKindsFor } from "./planValueModel";
import type { BaseRecord } from "./baseRecord";

const ORIGIN = "https://ontology.example.test";
const ERR = "term-origin: call setTermOrigin(<origin>) once at start-up";

const scaleOf = (direction: "lower" | "higher" | "target", unit = "") => ({ text: "", unit, rate: "", context: "", direction, source: {} });
const row = (type: string, served: Record<string, unknown>): BaseRecord =>
  ({
    id: "r1",
    entityUri: "https://vault.example.test/base/e/r1",
    typeUri: type,
    facts: {},
    opaqueFacts: [],
    etag: '"e1"',
    served: { facts: served, context: undefined, etag: '"e1"' },
  }) as unknown as BaseRecord;

describe("the index carries the Resource exports", () => {
  it("each one is there, under the source's name", () => {
    for (const name of [
      "defaultEndpointFor",
      "defaultDirectionFor",
      "BUDGET_LEVEL_TYPE",
      "resourceKind",
      "RESOURCE_DEFAULT_LEVEL_ROWS",
      "RESOURCE_OFFERED_LEVEL_KINDS",
      "defaultLevelRowsFor",
      "offeredLevelKindsFor",
      "RESOURCE_LEVEL_KINDS",
      "levelKindsFor",
      "kindClass",
    ]) {
      expect(api, name).toHaveProperty(name);
    }
    expect(api.kindClass).toBe(kindClass);
    expect(api.defaultEndpointFor).toBe(defaultEndpointFor);
  });
  it("defaultEndpointPart (the private helper) is not exported", () => {
    expect((api as Record<string, unknown>).defaultEndpointPart).toBeUndefined();
  });
});

describe("defaultEndpointFor", () => {
  it("a Value: Thing / Person, with the type address built from the type origin", () => {
    for (const arg of [undefined, false]) {
      expect(defaultEndpointFor(arg)).toEqual({
        subject: { typeIri: `${ORIGIN}/base/t/Thing`, typeLabel: "Thing", words: "" },
        reference: { typeIri: `${ORIGIN}/base/t/Person`, typeLabel: "Person", words: "" },
      });
    }
  });
  it("a Resource: Organization / Person", () => {
    expect(defaultEndpointFor(true)).toEqual({
      subject: { typeIri: `${ORIGIN}/base/t/Organization`, typeLabel: "Organization", words: "" },
      reference: { typeIri: `${ORIGIN}/base/t/Person`, typeLabel: "Person", words: "" },
    });
  });
  it("the address follows the origin the app set, read at each call (a trailing slash is cut by term-origin)", () => {
    setTermOrigin("https://other.example.test/");
    expect(defaultEndpointFor(true).subject.typeIri).toBe("https://other.example.test/base/t/Organization");
    setTermOrigin("http://third.example.test:8080");
    expect(defaultEndpointFor().reference.typeIri).toBe("http://third.example.test:8080/base/t/Person");
  });
  it("each call builds new objects", () => {
    expect(defaultEndpointFor()).not.toBe(defaultEndpointFor());
    expect(defaultEndpointFor().subject).not.toBe(defaultEndpointFor().subject);
  });
  it("with no type origin set it throws the term-origin error", () => {
    resetTermOrigin();
    expect(() => defaultEndpointFor()).toThrow(ERR);
    expect(() => defaultEndpointFor(true)).toThrow(ERR);
  });
});

describe("defaultDirectionFor", () => {
  it("a Resource is lower (less cost is better), a Value is higher", () => {
    expect(defaultDirectionFor(true)).toBe("lower");
    expect(defaultDirectionFor(false)).toBe("higher");
    expect(defaultDirectionFor()).toBe("higher");
  });
});

describe("resourceKind", () => {
  it("on a Resource the word Goal is Budget, trimmed and in any case", () => {
    expect(resourceKind("Goal", true)).toBe("Budget");
    expect(resourceKind("goal", true)).toBe("Budget");
    expect(resourceKind("  GOAL ", true)).toBe("Budget");
  });
  it("any other word, and every Value, is returned as given", () => {
    expect(resourceKind("Goal")).toBe("Goal");
    expect(resourceKind("Goal", false)).toBe("Goal");
    expect(resourceKind("Budget", true)).toBe("Budget");
    expect(resourceKind(" Status ", true)).toBe(" Status ");
    expect(resourceKind("Fuel", true)).toBe("Fuel");
    expect(resourceKind("", true)).toBe("");
  });
});

describe("BUDGET_LEVEL_TYPE and levelTypeName(kind, cardTypeUri)", () => {
  it("the stored type of a Budget level is Budget", () => {
    expect(BUDGET_LEVEL_TYPE).toBe("Budget");
  });
  it("Goal types as Budget on a Resource card only", () => {
    expect(levelTypeName("Goal", "t:Resource")).toBe("Budget");
    expect(levelTypeName("goal", `${ORIGIN}/base/t/Resource`)).toBe("Budget");
    expect(levelTypeName("Goal", "t:Value")).toBe("Goal");
    expect(levelTypeName("Goal")).toBe("Goal");
    expect(levelTypeName("Goal", "")).toBe("Goal");
  });
  it("Budget types as Budget on a Resource, and as the custom type Level on a Value or with no card", () => {
    expect(levelTypeName("Budget", "t:Resource")).toBe("Budget");
    expect(levelTypeName("Budget", "t:Value")).toBe("Level");
    expect(levelTypeName("Budget")).toBe("Level");
  });
  it("the other standard kinds and a custom word are the same on both cards", () => {
    for (const kind of ["Fail", "Survival", "Past", "Status", "Tolerable", "Wish"]) {
      expect(levelTypeName(kind, "t:Resource")).toBe(kind);
      expect(levelTypeName(kind, "t:Value")).toBe(kind);
    }
    expect(levelTypeName("Fuel", "t:Resource")).toBe("Level");
    expect(levelTypeName("Fuel", "t:Value")).toBe("Level");
  });
});

describe("the per-card kind lists", () => {
  it("RESOURCE_LEVEL_KINDS is the Value's kinds with Budget in the place of Goal", () => {
    expect([...RESOURCE_LEVEL_KINDS]).toEqual(["Fail", "Survival", "Past", "Status", "Tolerable", "Budget", "Wish"]);
    expect([...STANDARD_LEVEL_KINDS]).toEqual(["Fail", "Survival", "Past", "Status", "Tolerable", "Goal", "Wish"]);
  });
  it("levelKindsFor gives those lists by the card's type, in any spelling, and the Value's for any other type", () => {
    expect(levelKindsFor("t:Resource")).toBe(RESOURCE_LEVEL_KINDS);
    expect(levelKindsFor("Resource")).toBe(RESOURCE_LEVEL_KINDS);
    expect(levelKindsFor(`${ORIGIN}/base/t/Resource`)).toBe(RESOURCE_LEVEL_KINDS);
    expect(levelKindsFor("t:Value")).toBe(STANDARD_LEVEL_KINDS);
    expect(levelKindsFor("t:Function")).toBe(STANDARD_LEVEL_KINDS);
    expect(levelKindsFor("")).toBe(STANDARD_LEVEL_KINDS);
  });
  it("RESOURCE_DEFAULT_LEVEL_ROWS and RESOURCE_OFFERED_LEVEL_KINDS", () => {
    expect([...RESOURCE_DEFAULT_LEVEL_ROWS]).toEqual(["Status", "Tolerable", "Budget"]);
    expect([...RESOURCE_OFFERED_LEVEL_KINDS]).toEqual(["Past", "Status", "Tolerable", "Budget", "Wish"]);
    expect([...DEFAULT_LEVEL_ROWS]).toEqual(["Status", "Tolerable", "Goal"]);
    expect([...OFFERED_LEVEL_KINDS]).toEqual(["Past", "Status", "Tolerable", "Goal", "Wish"]);
  });
  it("defaultLevelRowsFor and offeredLevelKindsFor give the Resource lists for true and the Value lists otherwise", () => {
    expect(defaultLevelRowsFor(true)).toBe(RESOURCE_DEFAULT_LEVEL_ROWS);
    expect(defaultLevelRowsFor(false)).toBe(DEFAULT_LEVEL_ROWS);
    expect(defaultLevelRowsFor()).toBe(DEFAULT_LEVEL_ROWS);
    expect(offeredLevelKindsFor(true)).toBe(RESOURCE_OFFERED_LEVEL_KINDS);
    expect(offeredLevelKindsFor(false)).toBe(OFFERED_LEVEL_KINDS);
    expect(offeredLevelKindsFor()).toBe(OFFERED_LEVEL_KINDS);
  });
});

describe("kindClass", () => {
  it("is the trimmed lower-case kind", () => {
    expect(kindClass("Goal")).toBe("goal");
    expect(kindClass("  Status ")).toBe("status");
    expect(kindClass("FAIL", false)).toBe("fail");
    expect(kindClass("")).toBe("");
  });
  it("on a Resource Budget is the Goal point, in any case and with spaces", () => {
    expect(kindClass("Budget", true)).toBe("goal");
    expect(kindClass(" BUDGET ", true)).toBe("goal");
    expect(kindClass("Budget", false)).toBe("budget");
    expect(kindClass("Budget")).toBe("budget");
  });
  it("a Goal on a Resource stays goal, and other kinds are unchanged", () => {
    expect(kindClass("Goal", true)).toBe("goal");
    expect(kindClass("Tolerable", true)).toBe("tolerable");
  });
});

describe("readValueCard(facts, scaleRow, resource) defaults", () => {
  it("a Resource with no stored Scale reads direction lower; a Value or an undefined flag reads higher", () => {
    expect(readValueCard({}, null, true).scale.direction).toBe("lower");
    expect(readValueCard({}, null, false).scale.direction).toBe("higher");
    expect(readValueCard({}, null, undefined).scale.direction).toBe("higher");
    expect(readValueCard({}).scale.direction).toBe("higher");
  });
  it("a Resource with a stored Scale of any kind keeps what is stored", () => {
    expect(readValueCard({ hasScale: { "a:unit": "USD", "a:scaleDirection": "target" } }, null, true).scale.direction).toBe("target");
    expect(readValueCard({ hasScale: { "a:unit": "USD", "a:scaleDirection": "higher" } }, null, true).scale.direction).toBe("higher");
    expect(readValueCard({}, row("t:Scale", { scaleDirection: "target" }), true).scale.direction).toBe("target");
  });
  it("a Resource with a stored Scale and no direction reads lower (the older meaning of no direction), for a Value too", () => {
    expect(readValueCard({ hasScale: { "a:unit": "USD" } }, null, true).scale.direction).toBe("lower");
    expect(readValueCard({ hasScale: { "a:unit": "USD" } }, null, false).scale.direction).toBe("lower");
    expect(readValueCard({}, row("t:Scale", { description: "min" }), false).scale.direction).toBe("lower");
  });
  it("the endpoint defaults are Thing / Person for a Value and Organization / Person for a Resource, only while nothing is stored", () => {
    expect(readValueCard({}).endpoint.subject.typeLabel).toBe("Thing");
    expect(readValueCard({}, null, true).endpoint.subject.typeLabel).toBe("Organization");
    expect(readValueCard({}, null, true).endpoint.reference.typeLabel).toBe("Person");
    const stored = { endpoint: { "a:endpointSubject": { "@id": "https://x.example.test/base/t/Place", "a:label": "Place" } } };
    for (const resource of [false, true]) {
      const c = readValueCard(stored, null, resource);
      expect(c.endpoint.subject).toMatchObject({ typeIri: "https://x.example.test/base/t/Place", typeLabel: "Place" });
      expect(c.endpoint.reference).toEqual({ typeIri: "", typeLabel: "", words: "" });
    }
  });
  it("the default endpoint is not stored: it carries no raw member, and a Resource's patch of it is the Value's", () => {
    const r = readValueCard({}, null, true);
    const patch = valueCardPatch(r) as Record<string, Record<string, Record<string, unknown>>>;
    expect(patch.endpoint["a:endpointSubject"]!["@id"]).toBe(`${ORIGIN}/base/t/Organization`);
    expect(patch.endpoint["a:endpointReference"]!["@id"]).toBe(`${ORIGIN}/base/t/Person`);
  });
  it("with no type origin set it throws, and only when a default Endpoint is needed", () => {
    resetTermOrigin();
    expect(() => readValueCard({})).toThrow(ERR);
    expect(() => readValueCard({}, null, true)).toThrow(ERR);
    expect(() => readValueCard(null)).toThrow(ERR);
    expect(() => readValueCard({ valueScale: 5 })).toThrow(ERR);
    // a stored Endpoint of any shape (even an empty object or a description alone) needs no default
    for (const endpoint of [{}, { "a:description": "the river" }, { "a:endpointSubject": { "@id": "https://x.example.test/base/t/P" } }]) {
      expect(() => readValueCard({ endpoint }, null, true)).not.toThrow();
      expect(() => readValueCard({ endpoint })).not.toThrow();
    }
    // a stored older Endpoint needs none either
    expect(() => readValueCard({ valueEndpoint: { "a:description": "x" } })).not.toThrow();
    // a Scale of a Resource is not a reason to throw
    expect(() => readValueCard({ endpoint: {}, hasScale: { "a:unit": "USD" } }, null, true)).not.toThrow();
  });
  it("the error is an Error from the term-origin unit, not a TypeError", () => {
    resetTermOrigin();
    let caught: unknown;
    try {
      readValueCard({});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(TypeError);
    expect((caught as Error).message).toBe(ERR);
  });
  it("everything that does not read a default works with no type origin set", () => {
    resetTermOrigin();
    expect(() => api.emptyValueCard()).not.toThrow();
    expect(api.parseLevelLine("Goal [x] 5")?.value).toBe(5);
    expect(levelTypeName("Goal", "t:Resource")).toBe("Budget");
    expect(defaultDirectionFor(true)).toBe("lower");
    expect(valueCardPatch(api.emptyValueCard())).toBeTruthy();
  });
});

describe("sortLevels(levels, direction, resource)", () => {
  const kinds = (ls: { kind: string }[]) => ls.map((l) => l.kind);
  it("ranks Budget as Goal on a Resource, and after Wish on a Value", () => {
    const ls = ["Wish", "Budget", "Tolerable", "Status", "Past", "Fail"].map((k) => blankLevel(k));
    expect(kinds(sortLevels(ls, "lower", true))).toEqual(["Fail", "Past", "Status", "Tolerable", "Budget", "Wish"]);
    expect(kinds(sortLevels(ls, "lower", false))).toEqual(["Fail", "Past", "Status", "Tolerable", "Wish", "Budget"]);
    expect(kinds(sortLevels(ls, "lower"))).toEqual(["Fail", "Past", "Status", "Tolerable", "Wish", "Budget"]);
  });
  it("a Budget and a Goal on one Resource card tie, in input order", () => {
    const a = [blankLevel("Goal"), blankLevel("Budget")];
    const b = [blankLevel("Budget"), blankLevel("Goal")];
    expect(kinds(sortLevels(a, undefined, true))).toEqual(["Goal", "Budget"]);
    expect(kinds(sortLevels(b, undefined, true))).toEqual(["Budget", "Goal"]);
  });
  it("does not change the list it is given", () => {
    const ls = [blankLevel("Wish"), blankLevel("Budget")];
    const copy = [...ls];
    sortLevels(ls, undefined, true);
    expect(ls).toEqual(copy);
  });
});

describe("the writers take the card's type or flag", () => {
  const S = "https://vault.example.test/base/e/res";
  it("levelCreateFacts: Budget on a Resource writes no a:label; on a Value (or with no card) the word is the label", () => {
    const l = { ...blankLevel("Budget"), value: 3 };
    expect(levelCreateFacts(l, "T", S, 1, "t:Resource")).not.toHaveProperty("label");
    expect(levelCreateFacts(l, "T", S, 1, "t:Value").label).toBe("Budget");
    expect(levelCreateFacts(l, "T", S, 1).label).toBe("Budget");
  });
  it("levelCreateFacts: a Goal on a Resource is stored as the Budget type and writes no label", () => {
    const f = levelCreateFacts({ ...blankLevel("Goal"), value: 3 }, "T", S, 1, "t:Resource");
    expect(f).not.toHaveProperty("label");
  });
  it("levelPatch: a row typed Budget is read as kind Budget and an unchanged level patches nothing on a Resource", () => {
    const r = row("t:Budget", { scaleNumber: "5", partOf: { "@id": S }, elementOrder: 1 });
    const lv = readLevelRecord(r)!;
    expect(lv.kind).toBe("Budget");
    expect(lv.value).toBe(5);
    expect(levelPatch(r, lv, "t:Resource")).not.toHaveProperty("label");
  });
  it("scaleFacts / scaleCreateFacts / scalePatch: the resource flag decides which direction is the default", () => {
    expect(api.scaleFacts(scaleOf("lower"), true)).toBeNull();
    expect(api.scaleFacts(scaleOf("lower"))).toEqual({ "a:scaleDirection": "lower" });
    expect(api.scaleFacts(scaleOf("higher"), true)).toEqual({ "a:scaleDirection": "higher" });
    expect(api.scaleFacts(scaleOf("higher"))).toBeNull();
    expect(scaleCreateFacts(scaleOf("lower"), "T", S, 0, true).scaleDirection).toBe("lower");
    expect(scaleCreateFacts(scaleOf("higher"), "T", S, 0, false).scaleDirection).toBe("higher");
  });
  it("scalePatch: an unchanged Scale patches nothing, and the flag only changes which direction counts as the default", () => {
    const stored = row("t:Scale", { unit: "USD", scaleDirection: "higher" });
    expect(scalePatch(stored, scaleOf("higher", "USD"), true)).toEqual({});
    expect(scalePatch(stored, scaleOf("higher", "USD"))).toEqual({});
    expect(scalePatch(stored, scaleOf("lower", "USD"), true)).toEqual({ scaleDirection: "lower" });
  });
});
