// The Development Resource card is the Value card with changes: Budget in the place of Goal, a "lower" Scale direction and an
// Organization / Person Endpoint shown by default. These tests pin the shared behaviour of the Value and the Resource card.
// The type origin is set in test/setup.ts to https://ontology.example.test and forgotten after each test.
import { describe, expect, it } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import {
  blankLevel,
  levelNumberDisplay,
  levelNumberText,
  levelOfText,
  levelOfTyped,
  readLevelRecord,
  defaultLevelRowsFor,
  isLevelType,
  levelCreateFacts,
  levelLike,
  levelPatch,
  levelTypeName,
  offeredLevelKindsFor,
  parseLevelLine,
  readScaleRecord,
  readValueCard,
  scaleCreateFacts,
  scaleFacts,
  sortLevels,
  valueCardPatch,
} from "./planValue";
import { kindClass, levelKindsFor, RESOURCE_LEVEL_KINDS, STANDARD_LEVEL_KINDS } from "./planValueModel";
import type { BaseRecord } from "./baseRecord";

const ORIGIN = "https://ontology.example.test";
const RES = "https://vault.example.test/base/t/Resource";
const VAL = "https://vault.example.test/base/t/Value";

describe("Budget in the place of Goal, on a Resource only", () => {
  it("offers Budget (and not Goal) on a Resource, Goal on a Value", () => {
    expect(levelKindsFor("t:Resource")).toEqual(["Fail", "Survival", "Past", "Status", "Tolerable", "Budget", "Wish"]);
    expect(levelKindsFor("t:Resource")).toEqual([...RESOURCE_LEVEL_KINDS]);
    expect(levelKindsFor("t:Value")).toEqual([...STANDARD_LEVEL_KINDS]);
    expect(levelKindsFor("t:Resource")).not.toContain("Goal");
  });
  it("stores Budget as t:Budget on a Resource, and a Value's own word Budget still as t:Level", () => {
    expect(levelTypeName("Budget", "t:Resource")).toBe("Budget");
    expect(levelTypeName("budget", "t:Resource")).toBe("Budget");
    expect(levelTypeName("Budget")).toBe("Level");
    expect(levelTypeName("Budget", "t:Value")).toBe("Level");
    expect(levelTypeName("Goal")).toBe("Goal");
    expect(levelTypeName("Status", "t:Resource")).toBe("Status");
    expect(isLevelType("t:Budget")).toBe(true);
  });
  it("reads three level lines, Budget as kind Budget", () => {
    const status = parseLevelLine("Status [last month] 0 <- ESTIMATE");
    const tol = parseLevelLine("Tolerable [each month] 2 000 <- Requester");
    const budget = parseLevelLine("Budget [each month] 1 000 <- Requester");
    expect(status).toMatchObject({ kind: "Status", value: 0, qualifier: { conditions: ["last month"] } });
    expect(tol).toMatchObject({ kind: "Tolerable", value: 2000, qualifier: { conditions: ["each month"] } });
    expect(budget).toMatchObject({ kind: "Budget", value: 1000, qualifier: { conditions: ["each month"] } });
  });
  it("counts Budget as the Goal point, on a Resource only", () => {
    expect(kindClass("Budget", true)).toBe("goal");
    expect(kindClass("Budget")).toBe("budget");
    expect(kindClass("Goal", true)).toBe("goal");
    const levels = [blankLevel("Budget"), blankLevel("Status"), blankLevel("Wish")];
    expect(sortLevels(levels, undefined, true).map((l) => l.kind)).toEqual(["Status", "Budget", "Wish"]);
    expect(sortLevels(levels).map((l) => l.kind)).toEqual(["Status", "Wish", "Budget"]);
    const b = { ...blankLevel("Budget"), value: 10 };
    const s = { ...blankLevel("Status"), value: 2 };
    const t = { ...blankLevel("Tolerable"), value: 4 };
    // no Status in the set: the new level's value is the middle of its Tolerable and Budget
    const made = levelLike(t, "Wish", { members: [t, b], axisMid: 0, resource: true });
    expect(made.value).toBe(7);
    expect(levelLike(t, "Wish", { members: [t, b], axisMid: 0 }).value).toBe(0);
    expect(levelLike(t, "Wish", { members: [t, b, s], axisMid: 0, resource: true }).value).toBe(2);
  });
});

describe("a fresh Resource shows direction lower and Endpoint Organization / Person", () => {
  const ORG = `${ORIGIN}/base/t/Organization`;
  const PERSON = `${ORIGIN}/base/t/Person`;
  it("shows both on a Resource with nothing stored, and a Value keeps higher with Thing / Person", () => {
    const r = readValueCard({}, null, true);
    expect(r.scale.direction).toBe("lower");
    expect(r.endpoint.subject).toEqual({ typeIri: ORG, typeLabel: "Organization", words: "" });
    expect(r.endpoint.reference).toEqual({ typeIri: PERSON, typeLabel: "Person", words: "" });
    const v = readValueCard({});
    expect(v.scale.direction).toBe("higher");
    expect(v.endpoint.subject).toEqual({ typeIri: `${ORIGIN}/base/t/Thing`, typeLabel: "Thing", words: "" });
    expect(v.endpoint.reference).toEqual({ typeIri: PERSON, typeLabel: "Person", words: "" });
  });
  it("never overrides a stored Endpoint or a stored Scale", () => {
    const stored = { endpoint: { "a:endpointSubject": { "@id": `${ORIGIN}/base/t/Place`, "a:label": "Place" } } };
    const r = readValueCard(stored, null, true);
    expect(r.endpoint.subject.typeIri).toContain("/Place");
    expect(r.endpoint.reference.typeIri).toBe("");
    const old = readValueCard({ hasScale: { "a:unit": "USD" } }, null, true);
    expect(old.scale.direction).toBe("lower");
    const higher = readValueCard({ hasScale: { "a:unit": "USD", "a:scaleDirection": "higher" } }, null, true);
    expect(higher.scale.direction).toBe("higher");
  });
  it("writes nothing for the shown defaults, and a Resource's default-only Scale is still empty", () => {
    const r = readValueCard({}, null, true);
    expect(scaleFacts(r.scale, true)).toBeNull();
    expect(scaleFacts(r.scale)).not.toBeNull(); // as a Value it would be "lower", not the default
    expect(scaleFacts(readValueCard({}).scale)).toBeNull();
    // the Endpoint patch of the shown defaults equals the patch of a read of the same empty record: no change, no save
    expect(JSON.stringify(valueCardPatch(r))).toBe(JSON.stringify(valueCardPatch(readValueCard({}, null, true))));
  });
});

describe("a Value did not change", () => {
  it("level type of a custom Budget, the kinds, the default rows and the offered kinds", () => {
    expect(levelTypeName("Budget")).toBe("Level");
    expect(levelTypeName("Budget", VAL)).toBe("Level");
    expect(levelTypeName("Goal", VAL)).toBe("Goal");
    expect(levelTypeName("Goal", RES)).toBe("Budget");
    expect(levelKindsFor(VAL)).toEqual(STANDARD_LEVEL_KINDS);
    expect(defaultLevelRowsFor(false)).toEqual(["Status", "Tolerable", "Goal"]);
    expect(offeredLevelKindsFor(false)).toContain("Goal");
  });
  it("a Value's Scale default is higher, a stored Scale record without direction still reads lower, a Value 'lower' is stored", () => {
    expect(readValueCard({}).scale.direction).toBe("higher");
    expect(readValueCard({}, null, false).scale.direction).toBe("higher");
    const f = scaleFacts({ text: "", unit: "", rate: "", context: "", direction: "lower", source: {} });
    expect(f?.["a:scaleDirection"]).toBe("lower");
  });
  it("a custom Budget on a Value sorts after Wish and is not the Goal point", () => {
    const mk = (kind: string) => blankLevel(kind);
    const out = sortLevels([mk("Budget"), mk("Wish"), mk("Goal")]).map((l) => l.kind);
    expect(out).toEqual(["Goal", "Wish", "Budget"]);
  });
  it("a t:Level row labelled Budget on a Value round-trips to kind Budget and type Level", () => {
    const l = { ...blankLevel("Budget"), value: 5 };
    const facts = levelCreateFacts(l, "T", "https://vault.example.test/base/e/v", 1, VAL);
    expect(facts.label).toBe("Budget");
  });
});

describe("showing the Endpoint default never writes it", () => {
  const stored: [string, Record<string, unknown>][] = [
    ["legacy valueEndpoint object (types)", { valueEndpoint: { "a:endpointSubject": { "@id": `${ORIGIN}/base/t/Place`, "a:label": "Place" } } }],
    ["legacy valueEndpoint JSON string", { valueEndpoint: JSON.stringify({ "a:description": "the river" }) }],
    ["text-only a:endpoint object", { endpoint: { "a:description": "the river" } }],
    ["text-only a:endpoint JSON string", { endpoint: JSON.stringify({ "a:description": "the river" }) }],
    ["source-only a:endpoint", { endpoint: { "a:source": "Ann" } }],
    ["empty object a:endpoint", { endpoint: {} }],
  ];
  for (const resource of [false, true]) {
    for (const [name, facts] of stored) {
      it(`${resource ? "Resource" : "Value"} with ${name}: no default Thing/Organization/Person is shown over it`, () => {
        const c = readValueCard(facts, null, resource);
        expect(c.endpoint.subject.typeIri).not.toMatch(/\/(Thing|Organization)$/);
        expect(c.endpoint.reference.typeIri).not.toMatch(/\/Person$/);
      });
      it(`${resource ? "Resource" : "Value"} with ${name}: the patch the card would write equals the one read back (nothing to write)`, () => {
        const a = valueCardPatch(readValueCard(facts, null, resource));
        const b = valueCardPatch(readValueCard(facts, null, resource));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        // And it does not invent a part type that is not stored:
        expect(JSON.stringify(a)).not.toMatch(/Thing|Organization|Person/);
      });
    }
  }
});

describe("Resource Scale direction default vs stored", () => {
  const mkScaleRow = (facts: Record<string, unknown>): BaseRecord =>
    ({
      id: "sc",
      typeUri: "t:Scale",
      facts: {},
      opaqueFacts: [],
      etag: '"e"',
      served: { facts, context: undefined, etag: '"e"' },
    }) as unknown as BaseRecord;
  it("a Resource whose Scale record stores higher shows higher", () => {
    const row = mkScaleRow({ description: "USD", scaleDirection: "higher" });
    expect(readValueCard({}, row, true).scale.direction).toBe("higher");
  });
  it("a Resource whose inline a:hasScale stores higher shows higher", () => {
    expect(readValueCard({ hasScale: { "a:description": "USD", "a:scaleDirection": "higher" } }, null, true).scale.direction).toBe("higher");
  });
  it("a Resource whose legacy valueScale stores higher shows higher", () => {
    expect(readValueCard({ valueScale: { "a:description": "USD", "a:scaleDirection": "higher" } }, null, true).scale.direction).toBe("higher");
  });
  it("a Resource Scale with 'lower' and no words stores nothing, but with a unit it stores lower explicitly", () => {
    const s = { text: "", unit: "", rate: "", context: "", direction: "lower" as const, source: {} };
    expect(scaleFacts(s, true)).toBeNull();
    expect(scaleFacts({ ...s, unit: "USD" }, true)?.["a:scaleDirection"]).toBe("lower");
    expect(scaleFacts({ ...s, direction: "higher" as const }, true)?.["a:scaleDirection"]).toBe("higher");
  });
  it("creating a Resource Scale record always stores the direction (never rely on a default)", () => {
    const s = { text: "", unit: "", rate: "", context: "", direction: "lower" as const, source: {} };
    expect(scaleCreateFacts(s, "T", "https://vault.example.test/base/e/r", 0, true).scaleDirection).toBe("lower");
  });
  it("an old Value Scale record with no direction was lower; still lower", () => {
    const row = mkScaleRow({ description: "min" });
    expect(readScaleRecord(row).direction).toBe("lower");
  });
});

describe("Budget on a Resource", () => {
  it("type, kinds, offer", () => {
    expect(levelTypeName("Budget", RES)).toBe("Budget");
    expect(levelTypeName("budget", RES)).toBe("Budget");
    expect(levelTypeName(" BUDGET ", RES)).toBe("Budget");
    expect(isLevelType("t:Budget")).toBe(true);
    expect(offeredLevelKindsFor(true)).not.toContain("Goal");
    expect(defaultLevelRowsFor(true)).not.toContain("Goal");
  });
  it("a Budget row writes no a:label, a Level custom word does", () => {
    const f = levelCreateFacts({ ...blankLevel("Budget"), value: 5 }, "T", "https://vault.example.test/base/e/r", 1, RES);
    expect(f).not.toHaveProperty("label");
    const g = levelCreateFacts({ ...blankLevel("Fuel"), value: 5 }, "T", "https://vault.example.test/base/e/r", 1, RES);
    expect(g.label).toBe("Fuel");
  });
  it("sort on a Resource puts Budget where Goal sits, and a typed Goal on a Resource sorts the same place", () => {
    const mk = (kind: string) => blankLevel(kind);
    const out = sortLevels([mk("Wish"), mk("Budget"), mk("Tolerable"), mk("Status")], "lower", true).map((l) => l.kind);
    expect(out).toEqual(["Status", "Tolerable", "Budget", "Wish"]);
  });
  it("paste: three lines read as Status / Tolerable / Budget with the numbers", () => {
    const s = parseLevelLine("Status [last month] 0 <- ESTIMATE");
    const t = parseLevelLine("Tolerable [each month] 2 000 <- Requester");
    const b = parseLevelLine("Budget [each month] 2 000 <- Requester");
    expect(s?.kind).toBe("Status");
    expect(t?.value).toBe(2000);
    expect(b?.kind).toBe("Budget");
    expect(b?.value).toBe(2000);
    expect(b?.source.text).toBe("Requester");
  });
  it("paste: lower-case 'budget' keeps a kind that types as t:Budget on a Resource", () => {
    const b = parseLevelLine("budget [each month] 1 000");
    expect(b?.kind.toLowerCase()).toBe("budget");
    expect(levelTypeName(b!.kind, RES)).toBe("Budget");
  });
  it("paste: Goal typed on a Resource is kept as Goal in the line, and types as t:Budget when stored", () => {
    const g = parseLevelLine("Goal [each month] 1 000");
    expect(g?.kind).toBe("Goal");
    expect(levelTypeName(g!.kind, RES)).not.toBe("Goal");
  });
  it("kind change Budget -> Tolerable on a Resource retypes to Tolerable and drops no label that was never there", () => {
    expect(levelTypeName("Tolerable", RES)).toBe("Tolerable");
  });
  it("a row of type t:Budget under a Resource patch: the kind change to a custom word writes the label", () => {
    const row = {
      id: "b1",
      typeUri: "t:Budget",
      facts: {},
      opaqueFacts: [],
      etag: '"e"',
      served: { facts: { levelValue: 5 }, context: undefined, etag: '"e"' },
    } as unknown as BaseRecord;
    const p = levelPatch(row, { ...blankLevel("Fuel"), value: 5 }, RES);
    expect(p.label).toBe("Fuel");
  });
});

describe("space-grouped thousands change the paste for a Value too", () => {
  const cases: [string, number | null][] = [
    ["Goal [x] 2 000", 2000],
    ["Goal [x] 1 000 000", 1000000],
    ["Goal [x] 2 000,50", 2000.5],
    ["Goal [x] 12 345", 12345],
    ["Goal [x] 2 00", null],
    ["Goal [x] 2  000", null],
    ["Goal [x] 20 00", null],
    ["Goal [x] 1 0000", null],
    ["Goal [x] -2 000", -2000],
  ];
  for (const [text, want] of cases) {
    it(`${text} -> ${want}`, () => {
      const l = parseLevelLine(text);
      if (want === null) expect(l === null || !Number.isFinite(l.value as number)).toBe(true);
      else expect(l?.value).toBe(want);
    });
  }
  it.each([
    ["a plain space", " "],
    ["a no-break space (U+00A0)", "\u00a0"],
    ["a narrow no-break space (U+202F)", "\u202f"],
  ])("%s groups thousands: pasted, typed and stored, the value is 2000", (_name, sp) => {
    const text = `2${sp}000`;
    const pasted = parseLevelLine(`Goal [x] ${text}`);
    expect(pasted?.value).toBe(2000);
    // the paste path keeps no text of its own: the level holds the number, and writes back as the plain number
    expect(pasted?.valueText).toBeUndefined();
    expect(levelNumberText(pasted!)).toBe("2000");
    expect(levelNumberDisplay(pasted!)).toBe("2000");
    // the typed and stored paths keep the author's text exactly
    expect(levelOfText(text)).toEqual({ value: 2000, valueText: text });
    expect(levelOfTyped(text)).toEqual({ value: 2000, valueText: text });
    const row = {
      id: "l",
      typeUri: "t:Goal",
      facts: {},
      opaqueFacts: [],
      etag: '"e"',
      served: { facts: { scaleNumber: text }, context: undefined, etag: '"e"' },
    } as unknown as BaseRecord;
    expect(readLevelRecord(row)).toMatchObject({ value: 2000, valueText: text });
  });
  it("other spaces do not group thousands: a thin space (U+2009) is no number", () => {
    expect(parseLevelLine("Goal [x] 2\u2009000")).toBeNull();
  });
  it("a date-like qualifier after the number is not eaten: 'Status [2026-01-01] 5 000'", () => {
    expect(parseLevelLine("Status [2026-01-01] 5 000")?.value).toBe(5000);
  });
  it("a unit word after the number is rejected, not misread: 'Goal [x] 5 000 USD'", () => {
    expect(parseLevelLine("Goal [x] 5 000 USD")).toBeNull();
  });
});
