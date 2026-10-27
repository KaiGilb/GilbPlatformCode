// Pins for every export of planValue.ts and planValueModel.ts that the ported cases do not reach.
// The code wins: where a result looks odd it is pinned as it is.
import { describe, expect, it } from "vitest";
import { resetTypeKey, setTypeKey } from "@kaigilb/gilbplatformcode-type-key";
import * as api from "./index";
import {
  ALL_VALUE,
  CUSTOM_LEVEL_TYPE,
  DEFAULT_LEVEL_ROWS,
  LEGACY_ENDPOINT_SLUG,
  LEGACY_SCALE_SLUG,
  LEGACY_VALUE_SLUGS,
  LEVEL_TERMS,
  METER_LINE_TYPE,
  METER_TYPE,
  OFFERED_LEVEL_KINDS,
  OPTION_DEF_TYPE,
  PRESET_QUALIFIERS,
  QUALIFIER_TYPE,
  SCALE_TYPE,
  STANDARD_LEVEL_KINDS,
  VALUE_CHILD_TERMS,
  VALUE_PATCH_SLUGS,
  VALUE_SLUGS,
  VALUE_SLUG_LIST,
  VALUE_TERMS,
  aliasLevelKey,
  blankEndpointPart,
  blankLevel,
  blankLevelQualifier,
  blankVariable,
  carryOthers,
  carryRaw,
  emptyValueCard,
  isLegacyQualifierRow,
  isLevelType,
  isMeterLineType,
  isMeterType,
  isOptionDefType,
  isPartOfParent,
  isQualifierRowType,
  isQualifierType,
  isScaleType,
  latestChange,
  levelGroupKey,
  levelHasQualifierValue,
  levelIsBlank,
  levelKey,
  levelLike,
  levelNumberTyped,
  levelOfTyped,
  levelTypeName,
  levelsUsingQualifier,
  localDay,
  localToday,
  meterCreateFacts,
  meterIsBlank,
  meterLineCreateFacts,
  meterLineIsBlank,
  meterLinePatch,
  meterLineTag,
  meterPatch,
  meterTag,
  movableConditions,
  moveConditionIntoVariable,
  nextOrderOf,
  optionDefCreateFacts,
  optionDefPatch,
  optionDefRowsOf,
  optionDefTag,
  othersOf,
  packQualifierValues,
  parseLevelDate,
  parseLevelLine,
  parseNumberText,
  qualifierIsBlank,
  qualifierOptionNames,
  qualifierRowOptionNames,
  qualifierRows,
  qualifierTag,
  qualifierValues,
  quoteValue,
  readLegacyMeters,
  readLegacyVariables,
  readLevelRecord,
  readQualifierRecord,
  readScaleRecord,
  readValueCard,
  recOf,
  renameCandidate,
  resolveLevelKey,
  scaleCreateFacts,
  scaleDirectionOf,
  scaleQualifierNames,
  scaleRefOf,
  scaleTag,
  setLevelKey,
  splitOutsideBraces,
  valueLinesEmpty,
  withOthers,
  withScaleQualifiers,
} from "./index";
import type { BaseRecord } from "./index";

const row = (id: string, type: string, served: Record<string, unknown>): BaseRecord =>
  ({
    id,
    entityUri: `https://example.test/base/e/${id}`,
    typeUri: `t:${type}`,
    facts: {},
    opaqueFacts: [],
    etag: '"e"',
    updatedAt: 1,
    servedKeys: Object.keys(served),
    served: { facts: served, context: undefined, etag: '"e"' },
  }) as unknown as BaseRecord;
const variable = (name: string, options: string[] = []) => ({ ...blankVariable(name), options: options.map((n) => ({ name: n, definition: "" })) });

describe("the vocabulary constants", () => {
  it("the Value's members: written names, older names, and the lists built from them", () => {
    expect(VALUE_TERMS).toEqual({ scale: "a:hasScale", endpoint: "a:endpoint" });
    expect(LEGACY_VALUE_SLUGS).toEqual({
      scale: "valueScale",
      endpoint: "valueEndpoint",
      scaleVariables: "scaleQualifierDefinitions",
      meters: "valueMeters",
      levels: "valueLevels",
    });
    expect(LEGACY_ENDPOINT_SLUG).toBe("valueEndpoint");
    expect(LEGACY_SCALE_SLUG).toBe("valueScale");
    expect(VALUE_SLUGS).toEqual({ scale: "hasScale", endpoint: "endpoint", scaleVariables: "scaleQualifierDefinitions", meters: "valueMeters", levels: "valueLevels" });
    expect(VALUE_SLUG_LIST).toEqual(["hasScale", "endpoint", "scaleQualifierDefinitions", "valueMeters", "valueLevels", "valueEndpoint", "valueScale"]);
    expect(VALUE_PATCH_SLUGS).toEqual(["endpoint"]);
  });
  it("the level terms and the standard kinds", () => {
    expect(LEVEL_TERMS).toEqual({
      value: "a:scaleNumber",
      when: "a:levelWhen",
      conditions: "a:levelCondition",
      choice: "a:levelQualifierChoice",
      side: "a:levelSide",
      note: "a:note",
      tag: "a:unitTag",
      label: "a:label",
      sources: "a:lineSources",
      partOf: "a:partOf",
      order: "a:elementOrder",
    });
    expect(STANDARD_LEVEL_KINDS).toEqual(["Fail", "Survival", "Past", "Status", "Tolerable", "Goal", "Wish"]);
    expect(CUSTOM_LEVEL_TYPE).toBe("Level");
    expect(DEFAULT_LEVEL_ROWS).toEqual(["Status", "Tolerable", "Goal"]);
    expect(OFFERED_LEVEL_KINDS).toEqual(["Past", "Status", "Tolerable", "Goal", "Wish"]);
    expect(PRESET_QUALIFIERS).toHaveLength(11);
    expect(PRESET_QUALIFIERS[0]).toBe("Release");
    expect(PRESET_QUALIFIERS).toContain("Age-Group");
  });
  it("the child record terms and type names", () => {
    expect(VALUE_CHILD_TERMS).toMatchObject({
      qualifierType: "t:ScaleQualifier",
      optionDefType: "t:ScaleQualifierDefinition",
      meterType: "t:Meter",
      meterLineType: "t:MeterLine",
      options: "a:qualifierOptions",
      meterQualifier: "a:meterQualifier",
      agentKind: "a:meterAgentKind",
      method: "a:meterMethod",
    });
    expect([QUALIFIER_TYPE, OPTION_DEF_TYPE, METER_TYPE, METER_LINE_TYPE, SCALE_TYPE]).toEqual(["ScaleQualifier", "ScaleQualifierDefinition", "Meter", "MeterLine", "Scale"]);
    expect(ALL_VALUE).toBe("ALL");
  });
});

describe("type tests use the type-key peer", () => {
  it("each test accepts the URL, t: and bare spellings, in any case", () => {
    expect(isLevelType("t:Goal")).toBe(true);
    expect(isLevelType("https://example.test/base/t/Level")).toBe(true);
    expect(isLevelType("t:PlanguageLevel")).toBe(true);
    expect(isLevelType("Fail")).toBe(true);
    expect(isLevelType("t:Scale")).toBe(false);
    expect(isQualifierType("https://example.test/base/t/ScaleQualifier")).toBe(true);
    expect(isQualifierType("t:ScaleQualifierDefinition")).toBe(false);
    expect(isOptionDefType("t:scalequalifierdefinition")).toBe(true);
    expect(isQualifierRowType("t:ScaleQualifier")).toBe(true);
    expect(isQualifierRowType("t:ScaleQualifierDefinition")).toBe(true);
    expect(isQualifierRowType("t:Meter")).toBe(false);
    expect(isMeterType("t:Meter")).toBe(true);
    expect(isMeterType("t:MeterLine")).toBe(false);
    expect(isMeterLineType("t:MeterLine")).toBe(true);
    expect(isScaleType("t:Scale")).toBe(true);
    expect(isScaleType("t:ScaleQualifier")).toBe(false);
  });
  it("a host's own key function (setTypeKey) is what they use", () => {
    setTypeKey((x) => (x === "t:Alias" ? "scale" : x.replace(/^t:/, "").toLowerCase()));
    try {
      expect(isScaleType("t:Alias")).toBe(true);
      expect(isScaleType("t:Scale")).toBe(true);
    } finally {
      resetTypeKey();
    }
    expect(isScaleType("t:Alias")).toBe(false);
  });
  it("levelTypeName: a standard kind keeps its spelling, any other word is a Level", () => {
    expect(levelTypeName("goal")).toBe("Goal");
    expect(levelTypeName("  STATUS ")).toBe("Status");
    expect(levelTypeName("Budget")).toBe("Level");
    expect(levelTypeName("")).toBe("Level");
  });
  it("isLegacyQualifierRow: an option-definition type that is a part of the Value itself", () => {
    const val = "https://example.test/base/e/val1";
    const r = row("q1", "ScaleQualifierDefinition", { partOf: { "@id": val }, name: "Role" });
    expect(isLegacyQualifierRow(r, val)).toBe(true);
    expect(isLegacyQualifierRow(r, "https://example.test/base/e/other")).toBe(false);
    expect(isLegacyQualifierRow(r)).toBe(false);
    expect(isLegacyQualifierRow(row("q2", "ScaleQualifier", { partOf: { "@id": val } }), val)).toBe(false);
  });
  it("isPartOfParent: whole address, then last path piece; no parent means no check", () => {
    const r = row("a", "Goal", { partOf: { "@id": "https://one.example.test/base/e/val1" } });
    expect(isPartOfParent(r, "https://one.example.test/base/e/val1")).toBe(true);
    expect(isPartOfParent(r, "https://two.example.test/base/e/val1")).toBe(true);
    expect(isPartOfParent(r, "https://one.example.test/base/e/val2")).toBe(false);
    expect(isPartOfParent(r, null)).toBe(true);
    expect(isPartOfParent(r, undefined)).toBe(true);
    expect(isPartOfParent(row("b", "Goal", {}), "x")).toBe(false);
    expect(isPartOfParent(row("c", "Goal", { partOf: "https://example.test/base/e/val1" }), "https://example.test/base/e/val1")).toBe(true);
  });
  it("nextOrderOf: one past the highest order among the rows of the type", () => {
    const rows = [row("a", "Meter", { elementOrder: 2 }), row("b", "Meter", { elementOrder: "4" }), row("c", "Goal", { elementOrder: 9 }), row("d", "Meter", {})];
    expect(nextOrderOf(rows, isMeterType)).toBe(5);
    expect(nextOrderOf([], isMeterType)).toBe(1);
    expect(nextOrderOf(rows, isLevelType)).toBe(10);
  });
});

describe("numbers", () => {
  it.each([
    ["0,001", 1],
    ["-0,001", -1],
    ["1,0000", 1],
    ["1e3", null],
    ["1,000", 1000],
    ["1,5", 1.5],
    ["1.000,5", 1000.5],
    ["1,000.5", 1000.5],
    ["1,000,000", 1000000],
    ["", null],
    [" 5 ", 5],
    ["-", null],
    ["5.", null],
    ["+5", null],
    ["1.2.3", null],
    ["1,00,0", null],
  ])("parseNumberText(%j) is %j", (text, n) => {
    expect(parseNumberText(text)).toBe(n);
  });
  it("levelNumberTyped: the trimmed text a level carries, else undefined", () => {
    expect(levelNumberTyped({ valueText: " 5-10 " })).toBe("5-10");
    expect(levelNumberTyped({ valueText: "  " })).toBeUndefined();
    expect(levelNumberTyped({ valueText: 5 })).toBeUndefined();
    expect(levelNumberTyped(null)).toBeUndefined();
    expect(levelNumberTyped(levelOfTyped("approx. 5"))).toBe("approx. 5");
  });
  it("localToday and localDay: the local calendar day of the instant given, year not padded", () => {
    expect(localToday(new Date(2027, 0, 5, 23, 59))).toBe("2027-01-05");
    expect(localDay(new Date(2027, 11, 31, 0, 0))).toBe("2027-12-31");
    expect(localDay(new Date(2027, 0, 5, 0, 0))).toBe("2027-01-05");
    expect(localToday(new Date(999, 0, 2))).toBe("999-01-02");
    expect(localToday()).toMatch(/^\d{4,}-\d{2}-\d{2}$/);
  });
  it("parseLevelDate: ISO, or day month year; a day that does not exist is null", () => {
    expect(parseLevelDate("2027-01-30")).toBe("2027-01-30");
    expect(parseLevelDate("30 Jan 2027")).toBe("2027-01-30");
    expect(parseLevelDate("30 jan. 2027")).toBe("2027-01-30");
    expect(parseLevelDate("2027-02-30")).toBeNull();
    expect(parseLevelDate("1 Foo 2027")).toBeNull();
    expect(parseLevelDate("2027-1-3")).toBeNull();
    expect(parseLevelDate("x")).toBeNull();
  });
  it("latestChange: the newest updatedAt among the record and its parts", () => {
    expect(latestChange({ updatedAt: 3 }, [{ updatedAt: 7 }, { updatedAt: "9" }])?.getTime()).toBe(7);
    expect(latestChange(undefined, [{ updatedAt: Number.NaN }])).toBeNull();
  });
});

describe("blanks and empty data", () => {
  it("blankLevelQualifier, blankLevel, blankEndpointPart, blankVariable, emptyValueCard", () => {
    expect(blankLevelQualifier()).toEqual({ when: "", variables: {}, conditions: [], side: "" });
    expect(blankLevel()).toEqual({ kind: "Goal", value: null, qualifier: blankLevelQualifier(), source: {}, note: "" });
    expect(blankLevel("Wish").kind).toBe("Wish");
    expect(blankEndpointPart()).toEqual({ typeIri: "", typeLabel: "", words: "" });
    expect(blankVariable("N")).toEqual({ name: "N", definition: "", defaultOption: "", options: [], source: {} });
    const d = emptyValueCard();
    expect(d.scale).toEqual({ text: "", unit: "", rate: "", context: "", direction: "higher", source: {} });
    expect(d.levels).toEqual([]);
    expect(d.endpoint.subject).toEqual(blankEndpointPart());
    expect(emptyValueCard()).not.toBe(d);
    expect(emptyValueCard().endpoint.subject).not.toBe(d.endpoint.subject);
  });
  it("levelIsBlank, qualifierIsBlank, meterLineIsBlank, meterIsBlank", () => {
    expect(levelIsBlank(blankLevel())).toBe(true);
    expect(levelIsBlank({ ...blankLevel(), value: 0 })).toBe(false);
    expect(levelIsBlank({ ...blankLevel(), note: " " })).toBe(true);
    expect(levelIsBlank({ ...blankLevel(), note: "n" })).toBe(false);
    expect(levelIsBlank({ ...blankLevel(), source: { text: "s" } })).toBe(false);
    expect(levelIsBlank({ ...blankLevel(), qualifier: { ...blankLevelQualifier(), side: "low" } })).toBe(false);
    expect(levelIsBlank({ ...blankLevel(), qualifier: { ...blankLevelQualifier(), variables: { A: "ALL" } } })).toBe(false);
    expect(levelIsBlank({ ...blankLevel(), ...levelOfTyped("approx. 5"), value: null })).toBe(false);
    expect(qualifierIsBlank(blankVariable("  "))).toBe(true);
    expect(qualifierIsBlank(blankVariable("N"))).toBe(false);
    expect(meterLineIsBlank({ kind: "human", method: " ", source: {} })).toBe(true);
    expect(meterLineIsBlank({ kind: "human", method: "m", source: {} })).toBe(false);
    expect(meterLineIsBlank({ kind: "human", method: "", source: { text: "s" } })).toBe(false);
    expect(meterIsBlank({ qualifier: "", lines: [{ kind: "ai", method: "", source: {} }] })).toBe(true);
    expect(meterIsBlank({ qualifier: "Live", lines: [] })).toBe(false);
    expect(meterIsBlank({ qualifier: "", lines: [{ kind: "ai", method: "m", source: {} }] })).toBe(false);
  });
  it("valueLinesEmpty: which lines have nothing in them", () => {
    expect(valueLinesEmpty(emptyValueCard())).toEqual({ scale: true, scaleVariables: true, endpoint: true, valueMeters: true, valueLevels: true });
    const d = { ...emptyValueCard(), levels: [blankLevel()], meters: [{ qualifier: "", lines: [] }], variables: [blankVariable("N")] };
    d.scale.unit = "min";
    d.endpoint.text = "words";
    expect(valueLinesEmpty(d)).toEqual({ scale: false, scaleVariables: false, endpoint: false, valueMeters: false, valueLevels: false });
    const e = emptyValueCard();
    e.endpoint.subject = { typeIri: "https://example.test/base/t/App", typeLabel: "", words: "" };
    expect(valueLinesEmpty(e).endpoint).toBe(false);
  });
});

describe("the hidden members: raw, rec, lkey, others", () => {
  it("carryRaw copies raw, rec and lkey from the previous object; they are not enumerable", () => {
    const rec = row("r1", "Goal", {});
    const prev = Object.defineProperty(Object.defineProperty({ kind: "Goal" }, "raw", { value: { future: "x" }, enumerable: false, writable: true, configurable: true }), "rec", { value: rec, enumerable: false, writable: true, configurable: true });
    setLevelKey(prev, "r1");
    const spread = { ...prev, kind: "Wish" };
    expect(Object.keys(spread)).toEqual(["kind"]);
    expect(levelKey(spread)).toBeUndefined();
    const next = carryRaw(spread, prev);
    expect(next).toBe(spread);
    expect((next as { raw?: unknown }).raw).toEqual({ future: "x" });
    expect(recOf(next)).toBe(rec);
    expect(levelKey(next)).toBe("r1");
    expect(Object.keys(next)).toEqual(["kind"]);
  });
  it("carryRaw keeps what the new object already holds, and does nothing for a missing previous", () => {
    const prev = carryRaw({ a: 1 }, Object.defineProperty({}, "raw", { value: { from: "prev" }, enumerable: false }));
    const next = Object.defineProperty({ a: 2 }, "raw", { value: { from: "next" }, enumerable: false });
    carryRaw(next, prev);
    expect((next as { raw?: unknown }).raw).toEqual({ from: "next" });
    expect((carryRaw({ a: 3 }, null) as { raw?: unknown }).raw).toBeUndefined();
    expect((carryRaw({ a: 3 }, undefined) as { raw?: unknown }).raw).toBeUndefined();
  });
  it("the hidden members do not survive JSON.stringify or structuredClone", () => {
    const lvl = readLevelRecord(row("r1", "Goal", { scaleNumber: "5", future: "keep" }))!;
    expect(recOf(lvl)).toBeDefined();
    expect(levelKey(lvl)).toBe("r1");
    const meter = readLegacyMeters([{ qualifier: "Live", future: "keep" }])[0]!;
    expect((meter as unknown as { raw?: unknown }).raw).toEqual({ qualifier: "Live", future: "keep" });
    const viaJson = JSON.parse(JSON.stringify(lvl));
    expect(recOf(viaJson)).toBeUndefined();
    expect(levelKey(viaJson)).toBeUndefined();
    expect(JSON.parse(JSON.stringify(meter)).raw).toBeUndefined();
    const cloned = structuredClone(lvl);
    expect(recOf(cloned)).toBeUndefined();
    expect(levelKey(cloned)).toBeUndefined();
    expect((structuredClone(meter) as unknown as { raw?: unknown }).raw).toBeUndefined();
    expect(Object.keys(lvl)).not.toContain("raw");
    expect(Object.keys(lvl)).not.toContain("rec");
    expect(Object.keys(lvl)).not.toContain("lkey");
  });
  it("levelKey and setLevelKey: a non-empty string only", () => {
    expect(levelKey(null)).toBeUndefined();
    expect(levelKey({})).toBeUndefined();
    expect(levelKey(Object.defineProperty({}, "lkey", { value: "" }))).toBeUndefined();
    expect(levelKey(Object.defineProperty({}, "lkey", { value: 5 }))).toBeUndefined();
    const l = {};
    expect(setLevelKey(l, "new:1")).toBe(l);
    expect(levelKey(l)).toBe("new:1");
    expect(Object.keys(l)).toEqual([]);
  });
  it("aliasLevelKey and resolveLevelKey: module state, so the keys here are used by this test only", () => {
    expect(resolveLevelKey("new:pin-1")).toBe("new:pin-1");
    aliasLevelKey("new:pin-1", "rec-pin-1");
    expect(resolveLevelKey("new:pin-1")).toBe("rec-pin-1");
    aliasLevelKey("new:pin-1", "rec-pin-2");
    expect(resolveLevelKey("new:pin-1")).toBe("rec-pin-2");
    expect(resolveLevelKey("rec-pin-2")).toBe("rec-pin-2");
  });
  it("withOthers, othersOf and carryOthers: unparsed items ride on the array, not enumerable, as a copy", () => {
    const list = withOthers([1, 2], ["x"]);
    expect(list).toEqual([1, 2]);
    expect(Object.keys(list)).toEqual(["0", "1"]);
    expect(othersOf(list)).toEqual(["x"]);
    expect(othersOf(list)).not.toBe(othersOf(list));
    expect(JSON.parse(JSON.stringify(list))).toEqual([1, 2]);
    expect(othersOf(structuredClone(list))).toEqual([]);
    expect(withOthers([3], [])).toEqual([3]);
    expect(othersOf(withOthers([3], []))).toEqual([]);
    expect(othersOf(null)).toEqual([]);
    expect(othersOf(undefined)).toEqual([]);
    const next = carryOthers([9], list);
    expect(othersOf(next)).toEqual(["x"]);
    expect(othersOf(carryOthers([9], null))).toEqual([]);
  });
  it("a read list carries the items it could not read", () => {
    const meters = readLegacyMeters(JSON.stringify([{ qualifier: "Live" }, 7]));
    expect(meters.map((m) => m.qualifier)).toEqual(["Live"]);
    expect(othersOf(meters)).toEqual([7]);
  });
});

describe("levelLike with an injected today", () => {
  const lvl = (kind: string, value: number | null, when = ""): ReturnType<typeof blankLevel> => ({ ...blankLevel(kind), value, qualifier: { ...blankLevelQualifier(), when } });
  const from = { ...blankLevel("Goal"), qualifier: { when: "2027-01-01", variables: { Country: ["No", "Se"] as string[] }, conditions: ["c"], side: "low" as const } };
  it("Status gets the injected today and the set's latest Status value", () => {
    const l = levelLike(from, "Status", { members: [lvl("Status", 4, "2026-01-01"), lvl("Status", 7, "2026-06-01")], axisMid: 50, today: "2030-02-03" });
    expect(l.kind).toBe("Status");
    expect(l.qualifier.when).toBe("2030-02-03");
    expect(l.value).toBe(7);
    expect(l.qualifier.variables).toEqual({ Country: ["No", "Se"] });
    expect(l.qualifier.variables.Country).not.toBe(from.qualifier.variables.Country);
    expect(l.qualifier.conditions).toEqual(["c"]);
    expect(l.qualifier.side).toBe("low");
    expect(l.source).toEqual({});
    expect(l.note).toBe("");
  });
  it("without a today, Status gets the local day", () => {
    const l = levelLike(from, "status", { members: [], axisMid: 10 });
    expect(l.qualifier.when).toBe(localToday());
    expect(l.kind).toBe("status");
  });
  it("Past gets no date; another kind gets the date of the latest Tolerable/Goal/Wish; none if there is none", () => {
    expect(levelLike(from, "Past", { members: [lvl("Goal", 1, "2028-01-01")], axisMid: 0 }).qualifier.when).toBe("");
    expect(levelLike(from, "Wish", { members: [lvl("Goal", 1, "2028-01-01"), lvl("Tolerable", 1, "2029-01-01")], axisMid: 0 }).qualifier.when).toBe("2029-01-01");
    expect(levelLike(from, "Wish", { members: [lvl("Status", 1, "2028-01-01")], axisMid: 0 }).qualifier.when).toBe("");
  });
  it("the value is the middle of Tolerable and Goal, else the axis middle; snap and click-to-place override", () => {
    expect(levelLike(from, "Wish", { members: [lvl("Tolerable", 10), lvl("Goal", 20)], axisMid: 99 }).value).toBe(15);
    expect(levelLike(from, "Wish", { members: [lvl("Tolerable", 10)], axisMid: 99 }).value).toBe(99);
    expect(levelLike(from, "Wish", { members: [], axisMid: 99, snap: (v) => Math.round(v / 10) * 10 }).value).toBe(100);
    const placed = levelLike(from, "Goal", { members: [lvl("Status", 3)], axisMid: 99, when: "2031-01-01", value: 42 });
    expect(placed.qualifier.when).toBe("2031-01-01");
    expect(placed.value).toBe(42);
    expect(levelLike(from, "Status", { members: [], axisMid: 1, when: "", today: "2030-02-03" }).qualifier.when).toBe("");
  });
});

describe("level lines: text helpers", () => {
  it("quoteValue quotes a value that holds a comma, brace or quote", () => {
    expect(quoteValue("Norway")).toBe("Norway");
    expect(quoteValue("a,b")).toBe('"a,b"');
    expect(quoteValue("a{b")).toBe('"a{b"');
    expect(quoteValue('a"b')).toBe('"a\\"b"');
    expect(quoteValue("a\\b")).toBe("a\\b");
  });
  it("splitOutsideBraces splits on commas outside braces and quotes, and does not trim", () => {
    expect(splitOutsideBraces("a, b")).toEqual(["a", " b"]);
    expect(splitOutsideBraces("a = {b, c}, d")).toEqual(["a = {b, c}", " d"]);
    expect(splitOutsideBraces('x = "a, b", y')).toEqual(['x = "a, b"', " y"]);
    expect(splitOutsideBraces('a"b, c')).toEqual(['a"b', " c"]);
    expect(splitOutsideBraces("")).toEqual([""]);
  });
  it("levelGroupKey: levels with the same date, choices (order-free), conditions and side share a key", () => {
    const q = (v: Record<string, string | string[]>) => ({ ...blankLevel(), qualifier: { when: "2027-01-01", variables: v, conditions: ["c"], side: "" as const } });
    expect(levelGroupKey(q({ A: ["y", "x"], B: "1" }))).toBe(levelGroupKey(q({ B: "1", A: ["x", "y"] })));
    expect(levelGroupKey(q({ A: "x" }))).not.toBe(levelGroupKey(q({ A: "y" })));
    expect(levelGroupKey(blankLevel())).toBe('["",[],[],""]');
  });
  it("levelHasQualifierValue: unset and ALL take in everything", () => {
    const l = (v: Record<string, string | string[]>) => ({ ...blankLevel(), qualifier: { ...blankLevelQualifier(), variables: v } });
    expect(levelHasQualifierValue(l({}), "Country", "Norway")).toBe(true);
    expect(levelHasQualifierValue(l({ Country: "ALL" }), "country", "Norway")).toBe(true);
    expect(levelHasQualifierValue(l({ Country: ["Norway", "Sweden"] }), "COUNTRY", "sweden")).toBe(true);
    expect(levelHasQualifierValue(l({ Country: "Norway" }), "Country", "Sweden")).toBe(false);
  });
  it("levelsUsingQualifier picks the levels that set the qualifier, without case", () => {
    const a = { ...blankLevel("Goal"), qualifier: { ...blankLevelQualifier(), variables: { Country: "No" } } };
    const b = blankLevel("Wish");
    expect(levelsUsingQualifier([a, b], "country")).toEqual([a]);
    expect(levelsUsingQualifier([b], "country")).toEqual([]);
  });
  it("qualifierValues and packQualifierValues are the qualifier-values peer's", () => {
    expect(qualifierValues([" a ", "", "b"])).toEqual(["a", "b"]);
    expect(packQualifierValues(["ALL"])).toBe("ALL");
    expect(packQualifierValues(["a", "ALL"])).toBe("a");
  });
});

describe("Scale: names, rows, tags, reference", () => {
  it("scaleQualifierNames: the [Name] words of text, unit, rate and context, in that order, once each", () => {
    expect(scaleQualifierNames({ text: "per [Task]", unit: "[Unit] and [task]", rate: "[Rate]", context: "[Ctx] [rate]" })).toEqual(["Task", "Unit", "Rate", "Ctx"]);
    expect(scaleQualifierNames({})).toEqual([]);
  });
  it("qualifierRows: one row per Scale name in Scale order, then the defined names the Scale lacks", () => {
    const data = { scale: { ...emptyValueCard().scale, text: "per [Task] in [Country]" }, variables: [variable("country"), variable("Old"), variable("  ")] };
    const rows = qualifierRows(data);
    expect(rows.map((r) => [r.name, r.index, r.inScale])).toEqual([
      ["Task", null, true],
      ["Country", 0, true],
      ["Old", 1, false],
    ]);
    expect(rows[0]!.variable).toEqual(blankVariable("Task"));
    expect(rows[1]!.variable).toBe(data.variables[0]);
  });
  it("withScaleQualifiers: the rows' variables, Scale order first; the other data untouched", () => {
    const data = { ...emptyValueCard(), scale: { ...emptyValueCard().scale, text: "[B] [A]" }, variables: [variable("A", ["x"])] };
    const out = withScaleQualifiers(data);
    expect(out.variables.map((v) => v.name)).toEqual(["B", "A"]);
    expect(out.variables[1]).toBe(data.variables[0]);
    expect(out.scale).toBe(data.scale);
  });
  it("renameCandidate: exactly one defined name the Scale lacks and exactly one Scale name with no record", () => {
    const scale = { ...emptyValueCard().scale, text: "[New]" };
    expect(renameCandidate({ scale, variables: [variable("Old")] })).toEqual({ from: "Old", to: "New" });
    expect(renameCandidate({ scale, variables: [variable("Old"), variable("Other")] })).toBeNull();
    expect(renameCandidate({ scale, variables: [variable("New")] })).toBeNull();
    expect(renameCandidate({ scale: emptyValueCard().scale, variables: [] })).toBeNull();
  });
  it("scaleTag, qualifierTag, optionDefTag, meterTag, meterLineTag", () => {
    expect(scaleTag(" V ")).toBe("V.Scale");
    expect(scaleTag("")).toBe("Scale");
    expect(qualifierTag(" V ", variable("User type"))).toBe("V.Q.Usertype");
    expect(qualifierTag("V", variable(""))).toBe("V.Q.Unnamed");
    expect(optionDefTag("V.Q.C", "Norway ")).toBe("V.Q.C.Norway");
    expect(optionDefTag("V.Q.C", "")).toBe("V.Q.C.Option");
    expect(meterTag("V", { qualifier: "After Release", lines: [] })).toBe("V.Meter.AfterRelease");
    expect(meterTag("V", { qualifier: "", lines: [] })).toBe("V.Meter");
    expect(meterLineTag("V.Meter", { kind: "human", method: "", source: {} })).toBe("V.Meter.Human");
    expect(meterLineTag("V.Meter", { kind: "ai", method: "", source: {} })).toBe("V.Meter.AI");
    expect(meterLineTag("V.Meter", { kind: "instrument", method: "", source: {} })).toBe("V.Meter.Instrument");
  });
  it("scaleRefOf: the address a:hasScale points at, or empty for no reference", () => {
    expect(scaleRefOf(null)).toBe("");
    expect(scaleRefOf({})).toBe("");
    expect(scaleRefOf({ hasScale: { "@id": " https://example.test/base/e/s1 " } })).toBe("https://example.test/base/e/s1");
    expect(scaleRefOf({ "a:hasScale": JSON.stringify([{ "@id": "x" }]) })).toBe("x");
    expect(scaleRefOf({ hasScale: { "a:unit": "min" } })).toBe("");
  });
  it("readScaleRecord and scaleCreateFacts round-trip a Scale record", () => {
    const s = { ...emptyValueCard().scale, text: "words", unit: "min", direction: "target" as const };
    const facts = scaleCreateFacts(s, "V.Scale", "https://example.test/base/e/val");
    expect(facts).toEqual({ unitTag: "V.Scale", partOf: { "@id": "https://example.test/base/e/val" }, description: "words", unit: "min", scaleDirection: "target" });
    expect(readScaleRecord(row("s1", "Scale", facts))).toEqual(s);
    expect(scaleDirectionOf({ scale: s })).toBe("target");
    expect(scaleDirectionOf(null)).toBe("higher");
    expect(scaleDirectionOf({ scale: { direction: "sideways" as never } })).toBe("higher");
  });
});

describe("qualifier and option-definition records", () => {
  const qual = row("q1", "ScaleQualifier", { partOf: { "@id": "https://example.test/base/e/val1" }, name: "Country", qualifierOptions: ["Norway", { "a:name": "Sweden" }, "norway"] });
  it("qualifierRowOptionNames reads strings and older option objects, once each", () => {
    expect(qualifierRowOptionNames(qual)).toEqual(["Norway", "Sweden"]);
    expect(qualifierRowOptionNames(row("q2", "ScaleQualifierDefinition", { options: [{ "a:name": "Old" }] }))).toEqual(["Old"]);
    expect(qualifierRowOptionNames(row("q3", "ScaleQualifier", {}))).toEqual([]);
  });
  it("qualifierOptionNames: the names of a variable's options, once each, empty ones dropped", () => {
    expect(qualifierOptionNames({ ...variable("C", ["Norway", "norway", "", "Sweden"]) })).toEqual(["Norway", "Sweden"]);
  });
  it("optionDefRowsOf: the definition records that are a part of the qualifier", () => {
    const mine = row("d1", "ScaleQualifierDefinition", { partOf: { "@id": "https://example.test/base/e/q1" }, name: "Norway" });
    const other = row("d2", "ScaleQualifierDefinition", { partOf: { "@id": "https://example.test/base/e/q9" }, name: "X" });
    const notDef = row("d3", "Goal", { partOf: { "@id": "https://example.test/base/e/q1" } });
    expect(optionDefRowsOf(qual, [mine, other, notDef, qual])).toEqual([mine]);
    expect(optionDefRowsOf({ ...qual, entityUri: undefined }, [mine])).toEqual([]);
  });
  it("optionDefCreateFacts and optionDefPatch", () => {
    expect(optionDefCreateFacts({ name: " Norway ", definition: "the country" }, "V.Q.C.Norway", "https://example.test/base/e/q1", 2)).toEqual({
      unitTag: "V.Q.C.Norway",
      partOf: { "@id": "https://example.test/base/e/q1" },
      elementOrder: 2,
      name: "Norway",
      definition: "the country",
    });
    expect(optionDefCreateFacts({ name: "", definition: " " }, "t", "p", 1)).toEqual({ unitTag: "t", partOf: { "@id": "p" }, elementOrder: 1 });
    const d = row("d1", "ScaleQualifierDefinition", { name: "Norway", definition: "old" });
    expect(optionDefPatch(d, { name: "Norway", definition: "old" })).toEqual({});
    expect(optionDefPatch(d, { name: "Norway", definition: "new" })).toEqual({ definition: "new" });
    expect(optionDefPatch(d, { name: "", definition: "old" })).toEqual({ name: null });
  });
  it("readLegacyVariables reads the older stored list of qualifiers; items that are not objects ride on others", () => {
    const vars = readLegacyVariables([{ name: "C", options: [{ name: "N" }] }, "x"]);
    expect(vars).toEqual([{ name: "C", definition: "", defaultOption: "", options: [{ name: "N", definition: "" }], source: {} }]);
    expect(othersOf(vars)).toEqual(["x"]);
    expect(readLegacyVariables(null)).toEqual([]);
  });
});

describe("meter records", () => {
  it("meterCreateFacts and meterPatch", () => {
    expect(meterCreateFacts({ qualifier: " Live ", lines: [] }, "V.Meter.Live", "https://example.test/base/e/val1", 3)).toEqual({
      unitTag: "V.Meter.Live",
      partOf: { "@id": "https://example.test/base/e/val1" },
      elementOrder: 3,
      meterQualifier: "Live",
    });
    expect(meterCreateFacts({ qualifier: "", lines: [] }, "t", "p", 1)).toEqual({ unitTag: "t", partOf: { "@id": "p" }, elementOrder: 1 });
    const r = row("m1", "Meter", { meterQualifier: "Live" });
    expect(meterPatch(r, { qualifier: "Live", lines: [] })).toEqual({});
    expect(meterPatch(r, { qualifier: "", lines: [] })).toEqual({ meterQualifier: null });
  });
  it("meterLineCreateFacts and meterLinePatch", () => {
    const facts = meterLineCreateFacts({ kind: "ai", method: " runs it ", source: { text: "Ann" } }, "V.Meter.AI", "https://example.test/base/e/m1", 1);
    expect(facts).toMatchObject({ unitTag: "V.Meter.AI", meterAgentKind: "ai", meterMethod: "runs it" });
    expect(JSON.stringify(facts.lineSources)).toContain("Ann");
    expect(meterLineCreateFacts({ kind: "human", method: "", source: {} }, "t", "p", 1)).toEqual({ unitTag: "t", partOf: { "@id": "p" }, elementOrder: 1, meterAgentKind: "human" });
    const r = row("l1", "MeterLine", { meterAgentKind: "human", meterMethod: "old" });
    expect(meterLinePatch(r, { kind: "human", method: "old", source: {} })).toEqual({});
    expect(meterLinePatch(r, { kind: "human", method: "new", source: {} })).toEqual({ meterMethod: "new" });
  });
  it("readLegacyMeters reads the older stored list of meters", () => {
    const meters = readLegacyMeters([{ qualifier: "Live", lines: [{ meterAgentKind: "human", method: "m" }] }]);
    expect(meters).toHaveLength(1);
    expect(meters[0]!.qualifier).toBe("Live");
    expect(meters[0]!.lines.map((l) => [l.kind, l.method])).toEqual([["human", "m"]]);
    expect(readLegacyMeters("{{")).toEqual([]);
  });
});

describe("moving a bare condition into a variable", () => {
  const level = (conditions: string[], variables: Record<string, string | string[]> = {}) => ({ ...blankLevel("Goal"), qualifier: { ...blankLevelQualifier(), conditions, variables } });
  const data = () => ({ ...emptyValueCard(), variables: [variable("Country", ["Norway", "Sweden"])], levels: [level(["norway"]), level(["Norway", "Release 3"]), level(["Norway"], { Country: "Sweden" }), level([])] });
  it("movableConditions lists the option, how many levels hold it, and the condition as first seen last", () => {
    expect(movableConditions(data())).toEqual([{ variable: "Country", option: "Norway", condition: "Norway", count: 2 }]);
    expect(movableConditions(emptyValueCard())).toEqual([]);
  });
  it("moveConditionIntoVariable moves it on every level where it applies and keeps the rest", () => {
    const d = data();
    const [move] = movableConditions(d);
    const out = moveConditionIntoVariable(d, move!);
    expect(out.levels.map((l) => [l.qualifier.conditions, l.qualifier.variables])).toEqual([
      [[], { Country: "Norway" }],
      [["Release 3"], { Country: "Norway" }],
      [["Norway"], { Country: "Sweden" }],
      [[], {}],
    ]);
    expect(out.levels[2]).toBe(d.levels[2]);
    expect(movableConditions(out)).toEqual([]);
  });
});

describe("the package index", () => {
  it("exports the names of both files, and the types through the index", () => {
    expect(typeof api.readValueCard).toBe("function");
    expect(typeof api.parseLevelLine).toBe("function");
    expect(api.VALUE_TERMS).toBe(VALUE_TERMS);
    expect(api.ALL_VALUE).toBe("ALL");
    expect((api as Record<string, unknown>).eq).toBeUndefined();
    expect(parseLevelLine("Goal 5")?.value).toBe(5);
    expect(readQualifierRecord(row("q", "ScaleQualifier", { name: "N" })).name).toBe("N");
    expect(readValueCard({}).scale.direction).toBe("higher");
  });
});
