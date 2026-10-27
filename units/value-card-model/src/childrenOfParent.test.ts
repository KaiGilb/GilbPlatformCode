// Only a parent's own children are read; qualifier rename, merge and remove on levels.
import { describe, expect, it } from "vitest";
import {
  blankLevel,
  levelsSettingBoth,
  readLevelRecords,
  readMeterRecords,
  readQualifierRecords,
  removeLevelQualifier,
  renameLevelQualifier,
} from "./planValue";
import type { BaseRecord } from "./baseRecord";

const VAL = "https://h/base/e/val1";
const row = (id: string, type: string, facts: Record<string, unknown>): BaseRecord =>
  ({ id, entityUri: `https://h/base/e/${id}`, typeUri: `t:${type}`, facts: {}, opaqueFacts: [], etag: '"x"', updatedAt: 1, servedKeys: Object.keys(facts), served: { facts, context: undefined, etag: '"x"' } }) as unknown as BaseRecord;
const lvl = (vars: Record<string, string | string[]>) => ({ ...blankLevel("Goal"), qualifier: { when: "", variables: vars, conditions: [], side: "" as const } });

describe("only the parent's own children are read", () => {
  const rows = [
    row("a", "Goal", { partOf: { "@id": "https://h/base/e/OTHER" }, measurementValue: 3, elementOrder: 1 }),
    row("b", "Goal", { partOf: { "@id": VAL }, measurementValue: 4, elementOrder: 2 }),
    row("c", "Goal", { measurementValue: 5, elementOrder: 3 }),
  ];
  it("levels", () => {
    expect(readLevelRecords(rows, VAL).map((l) => l.value)).toEqual([4]);
  });
  it("no parent given: no check", () => {
    expect(readLevelRecords(rows)).toHaveLength(3);
  });
  it("qualifiers", () => {
    const q = [row("q1", "ScaleQualifierDefinition", { name: "A", partOf: { "@id": "https://h/base/e/x" } }), row("q2", "ScaleQualifierDefinition", { name: "B", partOf: { "@id": VAL } })];
    expect(readQualifierRecords(q, VAL).map((v) => v.name)).toEqual(["B"]);
  });
  it("meters and their lines", () => {
    const meters = [row("m1", "Meter", { qualifier: "Live", partOf: { "@id": VAL } }), row("m2", "Meter", { qualifier: "Stray", partOf: { "@id": "https://h/base/e/x" } })];
    const lines = [
      row("l1", "MeterLine", { meterAgentKind: "human", partOf: { "@id": "https://h/base/e/m1" } }),
      row("l2", "MeterLine", { meterAgentKind: "ai", partOf: { "@id": "https://h/base/e/m2" } }),
    ];
    const out = readMeterRecords(meters, () => lines, VAL);
    expect(out.map((m) => m.qualifier)).toEqual(["Live"]);
    expect(out[0]!.lines.map((l) => l.kind)).toEqual(["human"]);
  });
});

describe("qualifier rename, merge and remove on levels", () => {
  it("rename onto a name the level already has keeps both values", () => {
    const out = renameLevelQualifier(lvl({ Country: "Norway", Region: "North" }), "Country", "Region");
    expect(out.qualifier.variables).toEqual({ Region: ["Norway", "North"] });
  });
  it("rename onto a free name moves the choice", () => {
    expect(renameLevelQualifier(lvl({ Country: "Norway" }), "Country", "Region").qualifier.variables).toEqual({ Region: "Norway" });
  });
  it("levelsSettingBoth", () => {
    expect(levelsSettingBoth([lvl({ Country: "N" }), lvl({ Country: "N", Region: "R" })], "country", "region")).toBe(true);
    expect(levelsSettingBoth([lvl({ Country: "N" }), lvl({ Region: "R" })], "Country", "Region")).toBe(false);
  });
  it("removeLevelQualifier drops only that choice", () => {
    expect(removeLevelQualifier(lvl({ Country: "N", Region: "R" }), "country").qualifier.variables).toEqual({ Region: "R" });
    const same = lvl({ Region: "R" });
    expect(removeLevelQualifier(same, "Country")).toBe(same);
  });
});
