// A level with ONE qualifier choice is stored as the list [{a:name, a:qualifierOptions}] (levelFacts/choiceWire),
// but a one-item list is served back as the lone object {a:name, a:qualifierOptions}; the older-map branch of
// choiceMap must not read its two keys as two variables.
import { describe, expect, it } from "vitest";
import { levelCreateFacts, levelPatch, readLevelRecord, readLegacyLevels } from "./planValue";
import type { BaseRecord } from "./baseRecord";
import type { ValueLevel } from "./planValueModel";

const row = (kind: string, served: Record<string, unknown>): BaseRecord =>
  ({
    id: "r1",
    entityUri: "https://example.test/base/e/r1",
    typeUri: `t:${kind}`,
    facts: Object.fromEntries(Object.entries(served).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])),
  }) as unknown as BaseRecord;

const LONE = { "a:name": "Brand", "a:qualifierOptions": ["Volvo"] };
const SHAPES: [string, unknown][] = [
  ["the list", [LONE]],
  ["one object not in a list", LONE],
  ["a JSON string of the list", JSON.stringify([LONE])],
  ["a JSON string of one object", JSON.stringify(LONE)],
  ["bare keys, lone object", { name: "Brand", qualifierOptions: ["Volvo"] }],
  ["the old map", { Brand: "Volvo" }],
  ["the old map with a list", { Brand: ["Volvo"] }],
];

describe("level qualifier choices: every stored shape reads as { Brand: Volvo }", () => {
  for (const [name, shape] of SHAPES) {
    it(name, () => {
      const lvl = readLevelRecord(row("Status", { scaleNumber: 146, levelQualifierChoice: shape }))!;
      expect(lvl.qualifier.variables).toEqual({ Brand: "Volvo" });
    });
  }
  it("the old levelVariables fact reads through the same reader, and a lone choice object there is never a map", () => {
    expect(readLevelRecord(row("Status", { levelVariables: { Brand: "Volvo" } }))!.qualifier.variables).toEqual({ Brand: "Volvo" });
    expect(readLevelRecord(row("Status", { levelVariables: LONE }))!.qualifier.variables).toEqual({ Brand: "Volvo" });
    const [old] = readLegacyLevels([{ levelKind: "Goal", levelVariables: JSON.stringify(LONE) }]);
    expect(old!.qualifier.variables).toEqual({ Brand: "Volvo" });
  });
  it("a choice with no options is ALL; several options stay a list", () => {
    expect(readLevelRecord(row("Goal", { levelQualifierChoice: { "a:name": "Brand" } }))!.qualifier.variables).toEqual({ Brand: "ALL" });
    expect(readLevelRecord(row("Goal", { levelQualifierChoice: { "a:name": "Brand", "a:qualifierOptions": ["Volvo", "Tesla"] } }))!.qualifier.variables).toEqual({
      Brand: ["Volvo", "Tesla"],
    });
  });
});

describe("writer and repair", () => {
  const level = (v: Record<string, string | string[]>): ValueLevel =>
    ({ kind: "Status", value: 146, qualifier: { when: "", variables: v, conditions: [], side: "" }, source: {}, note: "" }) as ValueLevel;
  it("writes only the list of { a:name, a:qualifierOptions? }", () => {
    const f = levelCreateFacts(level({ Brand: "Volvo" }), "T.Status", "https://example.test/base/e/v", 1);
    expect(f.levelQualifierChoice).toEqual([{ "a:name": "Brand", "a:qualifierOptions": ["Volvo"] }]);
    expect(f.levelVariables).toBeUndefined();
  });
  it("a level stored as a lone object or the old map is rewritten as the list on its next edit; the old key is nulled", () => {
    for (const held of [LONE, { Brand: "Volvo" }]) {
      const r = row("Status", { scaleNumber: 146, levelQualifierChoice: held });
      const edited = { ...readLevelRecord(r)!, value: 150 };
      const p = levelPatch(r, edited);
      expect(p.levelQualifierChoice).toEqual([{ "a:name": "Brand", "a:qualifierOptions": ["Volvo"] }]);
    }
    const old = row("Status", { levelValue: 146, levelVariables: { Brand: "Volvo" } });
    const p = levelPatch(old, { ...readLevelRecord(old)!, value: 150 });
    expect(p.levelVariables).toBeNull();
    expect(p.levelQualifierChoice).toEqual([{ "a:name": "Brand", "a:qualifierOptions": ["Volvo"] }]);
  });
});
