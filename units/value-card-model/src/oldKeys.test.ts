// Old keys are never written; old records read right and are rewritten on edit; ALL round trips.
import { describe, expect, it } from "vitest";
import { writeLineSource } from "@kaigilb/gilbplatformcode-plan-card-facts";
import {
  levelCreateFacts,
  levelPatch,
  meterLineCreateFacts,
  meterLinePatch,
  meterPatch,
  qualifierCreateFacts,
  qualifierPatch,
  readLevelRecord,
  readMeterLineRecord,
  readQualifierRecord,
  readValueCard,
  valueCardPatch,
  emptyValueCard,
} from "./planValue";
import type { BaseRecord } from "./baseRecord";

const OLD = [
  "valueLevels", "levelKind", "levelValue", "levelVariables", "levelConditions", "scaleQualifierDefinitions", "valueMeters", "lines",
  "valueScale", "valueEndpoint", "endpointText", "text", "scaleText", "measurementValue", "qualifierCondition", "options", "measurementMethod",
];
const row = (type: string, served: Record<string, unknown>): BaseRecord =>
  ({
    id: "r1",
    entityUri: "https://example.test/base/e/r1",
    typeUri: `t:${type}`,
    facts: Object.fromEntries(Object.entries(served).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])),
    opaqueFacts: [],
    etag: '"e1"',
    updatedAt: 1,
    servedKeys: Object.keys(served),
    served: { facts: served, context: undefined, etag: '"e1"' },
  }) as unknown as BaseRecord;
const apply = (served: Record<string, unknown>, patch: Record<string, unknown>) => {
  const out = { ...served };
  for (const [k, v] of Object.entries(patch)) if (v === null) delete out[k]; else out[k] = v;
  return out;
};
const keysDeep = (v: unknown, acc: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, acc));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { acc.push(k.replace(/^a:/, "")); keysDeep(x, acc); }
  return acc;
};

describe("old keys are never written", () => {
  it("create facts and patches of every card record write no old key", () => {
    const lvl = { kind: "Goal", value: 5, qualifier: { when: "2027-06-30", variables: { Country: "ALL", Who: ["a", "b"] }, conditions: ["c"], side: "low" as const }, source: { text: "s" }, note: "n" };
    const q = { name: "Country", definition: "d", defaultOption: "Norway", options: [{ name: "Norway", definition: "" }], source: { text: "s" } };
    const line = { kind: "human" as const, method: "m", source: { text: "s" } };
    const all = [
      levelCreateFacts(lvl, "T.Goal", "https://h/e/p", 1),
      qualifierCreateFacts(q as never, "T.Q.Country", "https://h/e/p", 1),
      meterLineCreateFacts(line, "T.Meter.Human", "https://h/e/p", 1),
      valueCardPatch({ ...emptyValueCard(), scale: { text: "sentence", unit: "min", rate: "", context: "", direction: "higher", source: {} }, endpoint: { subject: { typeIri: "https://x/t/App", typeLabel: "App", words: "w" }, reference: { typeIri: "", typeLabel: "", words: "" }, text: "old free text", source: {} } }),
    ];
    const used = all.flatMap((x) => keysDeep(x));
    expect(used.filter((k) => OLD.includes(k))).toEqual([]);
  });
});

describe("old level record is rewritten on edit", () => {
  const served = {
    unitTag: "S.Goal.Norway.2027-06-30",
    partOf: { "@id": "https://h/e/p" },
    elementOrder: 1,
    levelValue: 5,
    levelWhen: "2027-06-30",
    levelConditions: ["cond"],
    levelVariables: JSON.stringify({ Country: "Norway", Who: ["ALL"] }),
    lineSources: writeLineSource([], "a:measurementValue", { text: "src" }),
  };
  it("a note edit moves every old key to its live name and leaves no old key", () => {
    const r = row("Goal", served);
    const level = readLevelRecord(r)!;
    expect(level.value).toBe(5);
    expect(level.qualifier.variables).toEqual({ Country: "Norway", Who: "ALL" });
    expect(level.source.text).toBe("src");
    const patch = levelPatch(r, { ...level, note: "x" });
    const after = apply(served, patch);
    expect(Object.keys(after).filter((k) => OLD.includes(k))).toEqual([]);
    expect(JSON.stringify(after.lineSources)).not.toContain("measurementValue");
    const back = readLevelRecord(row("Goal", after))!;
    expect(back.value).toBe(5);
    expect(back.qualifier.variables).toEqual({ Country: "Norway", Who: "ALL" });
    expect(back.qualifier.conditions).toEqual(["cond"]);
    expect(back.source.text).toBe("src");
  });
  it("ALL is stored as a name with no a:qualifierOptions and read back as ALL", () => {
    const lvl = { kind: "Goal", value: 1, qualifier: { when: "", variables: { Country: "ALL" }, conditions: [], side: "" as const }, source: {}, note: "" };
    const facts = levelCreateFacts(lvl, "t", "https://h/e/p", 1);
    expect(facts.levelQualifierChoice).toEqual([{ "a:name": "Country" }]);
    const back = readLevelRecord(row("Goal", { ...facts }))!;
    expect(back.qualifier.variables).toEqual({ Country: "ALL" });
    // switching ALL -> Norway -> ALL on an existing record writes a patch both ways
    const r = row("Goal", facts);
    const p1 = levelPatch(r, { ...back, qualifier: { ...back.qualifier, variables: { Country: "Norway" } } });
    expect(p1.levelQualifierChoice).toEqual([{ "a:name": "Country", "a:qualifierOptions": ["Norway"] }]);
  });
  it("an old record with a PlanguageLevel type: an edit writes no old type word and keeps its custom label", () => {
    const r = row("PlanguageLevel", { unitTag: "S.Mid", partOf: { "@id": "https://h/e/p" }, elementOrder: 1, label: "Mid", levelValue: 3 });
    const level = readLevelRecord(r)!;
    expect(level.kind).toBe("Mid");
    const patch = levelPatch(r, { ...level, value: 4 });
    expect(patch).toEqual({ scaleNumber: "4", levelValue: null });
  });
  it("a qualifier definition with only the old a:options is rewritten on edit", () => {
    const s = { unitTag: "S.Q.C", partOf: { "@id": "https://h/e/p" }, elementOrder: 1, name: "Country", options: [{ "a:name": "Norway" }] };
    const r = row("ScaleQualifierDefinition", s);
    const v = readQualifierRecord(r);
    expect(v.options.map((o) => o.name)).toEqual(["Norway"]);
    const patch = qualifierPatch(r, { ...v, definition: "d" });
    expect(patch.options).toBeNull();
    // The option NAMES are written, one string each.
    expect(patch.qualifierOptions).toEqual(["Norway"]);
  });
  it("a meter line with the old a:method and its source under the old key is rewritten on edit", () => {
    const s = { unitTag: "S.Meter.Human", partOf: { "@id": "https://h/e/m" }, elementOrder: 1, meterAgentKind: "human", method: "old", lineSources: writeLineSource([], "a:method", { text: "src" }) };
    const r = row("MeterLine", s);
    const line = readMeterLineRecord(r)!;
    expect(line.method).toBe("old");
    expect(line.source.text).toBe("src");
    const patch = meterLinePatch(r, { ...line, method: "new" });
    const after = apply(s, patch);
    expect(after.method).toBeUndefined();
    expect(after.meterMethod).toBe("new");
    expect(JSON.stringify(after.lineSources)).not.toContain('"a:method"');
  });
  it("a Meter with only the old a:qualifier is rewritten on edit", () => {
    const r = row("Meter", { unitTag: "S.Meter", partOf: { "@id": "https://h/e/p" }, elementOrder: 1, qualifier: "Lab" });
    expect(meterPatch(r, { qualifier: "Lab2", lines: [] } as never)).toEqual({ meterQualifier: "Lab2", qualifier: null });
  });
  it("a Value holding the older valueScale reads it, and writeScale keeps the unknown members", () => {
    const card = readValueCard({ valueScale: [{ "a:unit": "min", scaleText: "How long", "a:scaleDirection": "higher" }] });
    expect(card.scale.unit).toBe("min");
    expect(card.scale.text).toBe("How long");
    expect(card.scale.direction).toBe("higher");
  });
});

describe("the old Scale sentence key is not written into a:hasScale", () => {
  it("editing the unit of a Value that holds a valueScale with the old sentence key writes that key nowhere", () => {
    const card = readValueCard({ valueScale: [{ "a:unit": "min", scaleText: "How long", "a:scaleDirection": "higher" }] });
    card.scale.unit = "sec";
    const patch = valueCardPatch(card);
    expect(JSON.stringify(patch)).not.toContain("scaleText");
  });
});
