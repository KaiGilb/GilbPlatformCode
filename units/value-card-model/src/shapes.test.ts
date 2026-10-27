/** Read fallbacks and write shapes of the Scale record, the qualifier records and a:scaleNumber. */
import { describe, expect, it } from "vitest";
import {
  levelCreateFacts,
  levelNumberText,
  levelPatch,
  parseLevelLine,
  plainNumberText,
  qualifierCreateFacts,
  qualifierPatch,
  readLevelRecord,
  readQualifierRecord,
  readValueCard,
  scaleCreateFacts,
  scaleFacts,
  scaleLinkPatch,
  scalePatch,
  scaleRowOf,
  valueCardPatch,
  VALUE_CHILD_TERMS,
} from "./planValue";
import type { ValueLevel } from "./planValueModel";
import type { BaseRecord } from "./baseRecord";

const row = (type: string, served: Record<string, unknown>, id = "r1"): BaseRecord =>
  ({
    id,
    entityUri: `https://h/base/e/${id}`,
    typeUri: `t:${type}`,
    facts: {},
    opaqueFacts: [],
    etag: '"e"',
    updatedAt: 1,
    servedKeys: Object.keys(served),
    served: { facts: served, context: undefined, etag: '"e"' },
  }) as unknown as BaseRecord;

const VALUE = "https://h/base/e/val1";
const PERSON = "https://example.test/base/t/Person";
/** An older stored name, built from its bare slug so no old `a:` name is written out in this file. */
const OLD = (slug: string) => `a:${slug}`;

/**
 * The server's PATCH ("application/merge-patch+json"): per attribute,
 * null deletes it and ANY other value (a nested object included) REPLACES the whole attribute value; there is no recursive merge into a
 * stored sub-object (RFC 7386's recursive merge into a stored sub-object is out of scope for the flat datom model).
 */
const serverPatch = (stored: Record<string, unknown>, patch: Record<string, unknown>) => {
  const out = { ...stored };
  for (const [k, v] of Object.entries(patch)) if (v === null) delete out[k]; else out[k] = v;
  return out;
};
const blankScale = () => readValueCard({}).scale;

describe("the Scale record", () => {
  it("the record's facts: tag, a:partOf, description, unit, rate, scaleContext, scaleDirection (always)", () => {
    const s = { ...blankScale(), text: "min to [Task]", unit: "min", rate: "per [Task]", context: "in [Country]", direction: "target" as const };
    expect(scaleCreateFacts(s, "V.Scale", VALUE)).toEqual({
      unitTag: "V.Scale",
      partOf: { "@id": VALUE },
      description: "min to [Task]",
      unit: "min",
      rate: "per [Task]",
      scaleContext: "in [Country]",
      scaleDirection: "target",
    });
    // direction alone is still written
    expect(scaleCreateFacts({ ...blankScale(), direction: "lower" }, "V.Scale", VALUE)).toMatchObject({ scaleDirection: "lower" });
  });

  it("the Value carries a:hasScale = {@id} and nothing else; the older valueScale key is nulled", () => {
    const value = row("Value", { hasScale: { "a:unit": "min" }, valueScale: { unit: "min" } }, "val1");
    expect(scaleLinkPatch(value, "https://h/base/e/s1")).toEqual({ hasScale: { "@id": "https://h/base/e/s1" }, valueScale: null });
    expect(scaleLinkPatch(row("Value", {}), "https://h/base/e/s1")).toEqual({ hasScale: { "@id": "https://h/base/e/s1" } });
    expect(scaleLinkPatch(value, null)).toEqual({ hasScale: null, valueScale: null });
  });

  it("migration against the server's merge: an old INLINE a:hasScale is stored as exactly {@id}, and the older key is gone", () => {
    const stored = { unitTag: "V", hasScale: { "a:unit": "min", "a:description": "words", "a:scaleDirection": "lower", future: "x" }, valueScale: { unit: "min" } };
    const after = serverPatch(stored, scaleLinkPatch(row("Value", stored, "val1"), "https://h/base/e/s1"));
    expect(after).toEqual({ unitTag: "V", hasScale: { "@id": "https://h/base/e/s1" } });
    expect(Object.keys(after.hasScale as object)).toEqual(["@id"]);
  });

  it("the other object-valued facts patched over older ones are stored exactly as written (the server replaces an attribute whole)", () => {
    // qualifier: the older option objects become the name strings
    const q = row("ScaleQualifier", { partOf: { "@id": VALUE }, name: "C", qualifierOptions: [{ "a:name": "N", "a:definition": "dn" }] }, "q2");
    const qAfter = serverPatch(q.served!.facts as Record<string, unknown>, qualifierPatch(q, { ...readQualifierRecord(q), definition: "x" }));
    expect(qAfter.qualifierOptions).toEqual(["N"]);
    // endpoint: written whole (the Value's patch holds only it)
    const d = readValueCard({ endpoint: { "a:endpointSubject": { "@id": PERSON }, "a:description": "old" } });
    d.endpoint.text = "new";
    const eAfter = serverPatch({ endpoint: { "a:endpointSubject": { "@id": PERSON }, "a:description": "old", [OLD("endpointText")]: "older" } }, valueCardPatch(d));
    // (once a part is typed the types carry the meaning and the sentence is dropped): the older inner keys do not survive
    expect(eAfter.endpoint).toEqual({ "a:endpointSubject": { "@id": PERSON } });
  });

  it("read order: the record via @id, then the inline a:hasScale, then the older keys", () => {
    const rec = row("Scale", { partOf: { "@id": VALUE }, unit: "from record", scaleDirection: "higher" }, "s1");
    const ref = { hasScale: { "@id": "https://h/base/e/s1" } };
    const found = scaleRowOf(ref, [rec], VALUE);
    expect(found?.id).toBe("s1");
    expect(readValueCard(ref, found).scale).toMatchObject({ unit: "from record", direction: "higher" });
    // record wins over inline and over the older key
    expect(readValueCard({ ...ref, valueScale: { unit: "old" } }, found).scale.unit).toBe("from record");
    // no record row: the inline Scale
    expect(readValueCard({ hasScale: { "a:unit": "inline" }, valueScale: { unit: "old" } }).scale.unit).toBe("inline");
    // neither: the older keys (and their older sentence keys)
    expect(readValueCard({ valueScale: { unit: "old", scaleText: "old words" } }).scale).toMatchObject({ unit: "old", text: "old words", direction: "lower" });
    // a pointer to a record that is not among the rows reads as no Scale (never as an inline one)
    expect(scaleRowOf(ref, [], VALUE)).toBeUndefined();
    expect(readValueCard(ref).scale.unit).toBe("");
  });

  it("a Scale record that is a part of another Value is not found", () => {
    const rec = row("Scale", { partOf: { "@id": "https://h/base/e/other" }, unit: "x" }, "s1");
    expect(scaleRowOf({ hasScale: { "@id": "https://h/base/e/s1" } }, [rec], VALUE)).toBeUndefined();
  });

  it("the patch of the record holds only what changed; an edit of a record with no stored direction states it", () => {
    const rec = row("Scale", { partOf: { "@id": VALUE }, description: "w", unit: "min", scaleDirection: "higher" }, "s1");
    const s = readValueCard({ hasScale: { "@id": "x" } }, rec).scale;
    expect(scalePatch(rec, s)).toEqual({});
    expect(scalePatch(rec, { ...s, unit: "sec" })).toEqual({ unit: "sec" });
    expect(scalePatch(rec, { ...s, rate: "per [Task]", unit: "" })).toEqual({ rate: "per [Task]", unit: null });
    const noDir = row("Scale", { partOf: { "@id": VALUE }, unit: "min" }, "s2");
    expect(scalePatch(noDir, { ...blankScale(), unit: "sec", direction: "lower" })).toMatchObject({ unit: "sec", scaleDirection: "lower" });
  });

  it("the older inline Scale's unknown members ride along onto the new record", () => {
    const d = readValueCard({ hasScale: { "a:unit": "min", future: "keep" } });
    expect(scaleFacts(d.scale)).toMatchObject({ "a:unit": "min", future: "keep" });
  });
});

describe("qualifier records", () => {
  const C = VALUE_CHILD_TERMS;
  it("the types: variable = t:ScaleQualifier, option definition = t:ScaleQualifierDefinition", () => {
    expect(C.qualifierType).toBe("t:ScaleQualifier");
    expect(C.optionDefType).toBe("t:ScaleQualifierDefinition");
  });

  it("a:qualifierOptions is the list of option NAMES; a definition is not in it", () => {
    const v = { name: "Country", definition: "d", defaultOption: "Norway", options: [{ name: "Norway", definition: "the country" }, { name: "Sweden", definition: "" }, { name: "norway", definition: "dup" }], source: {} };
    expect(qualifierCreateFacts(v, "V.Q.Country", VALUE, 1)).toEqual({
      unitTag: "V.Q.Country",
      partOf: { "@id": VALUE },
      elementOrder: 1,
      name: "Country",
      definition: "d",
      defaultOption: "Norway",
      qualifierOptions: ["Norway", "Sweden"],
    });
  });

  it("read: names as strings (definitions from the option records), the older option objects, and the older record type", () => {
    const q = row("ScaleQualifier", { partOf: { "@id": VALUE }, name: "Country", qualifierOptions: ["Norway", "Sweden"] }, "q1");
    const def = row("ScaleQualifierDefinition", { partOf: { "@id": "https://h/base/e/q1" }, name: "Norway", definition: "the country" }, "d1");
    expect(readQualifierRecord(q, [q, def]).options).toEqual([{ name: "Norway", definition: "the country" }, { name: "Sweden", definition: "" }]);
    expect(readQualifierRecord(q).options).toEqual([{ name: "Norway", definition: "" }, { name: "Sweden", definition: "" }]);
    const objects = row("ScaleQualifier", { partOf: { "@id": VALUE }, name: "C", qualifierOptions: [{ "a:name": "N", "a:definition": "dn" }] }, "q2");
    expect(readQualifierRecord(objects).options).toEqual([{ name: "N", definition: "dn" }]);
    const legacy = row("ScaleQualifierDefinition", { partOf: { "@id": VALUE }, name: "Role", qualifierOptions: [{ "a:name": "Boss", "a:definition": "decides" }] }, "q3");
    expect(readQualifierRecord(legacy, [legacy, def]).options).toEqual([{ name: "Boss", definition: "decides" }]);
  });

  it("an option record belongs to the variable it is a part of, not to another one", () => {
    const q1 = row("ScaleQualifier", { partOf: { "@id": VALUE }, name: "A", qualifierOptions: ["X"] }, "q1");
    const q2 = row("ScaleQualifier", { partOf: { "@id": VALUE }, name: "B", qualifierOptions: ["X"] }, "q2");
    const def = row("ScaleQualifierDefinition", { partOf: { "@id": "https://h/base/e/q2" }, name: "X", definition: "for B" }, "d1");
    expect(readQualifierRecord(q1, [q1, q2, def]).options[0]!.definition).toBe("");
    expect(readQualifierRecord(q2, [q1, q2, def]).options[0]!.definition).toBe("for B");
  });

  it("the patch writes name strings (not objects) and does not carry the definitions; option objects held are rewritten as names", () => {
    const q = row("ScaleQualifier", { partOf: { "@id": VALUE }, name: "Country", qualifierOptions: ["Norway"] }, "q1");
    const v = readQualifierRecord(q);
    expect(qualifierPatch(q, v)).toEqual({});
    expect(qualifierPatch(q, { ...v, options: [{ name: "Norway", definition: "d" }, { name: "Sweden", definition: "" }] })).toEqual({ qualifierOptions: ["Norway", "Sweden"] });
    expect(qualifierPatch(q, { ...v, options: [{ name: "Norway", definition: "d" }] })).toEqual({});
    const objects = row("ScaleQualifier", { partOf: { "@id": VALUE }, name: "C", qualifierOptions: [{ "a:name": "N" }] }, "q2");
    expect(qualifierPatch(objects, { ...readQualifierRecord(objects), definition: "x" })).toEqual({ definition: "x", qualifierOptions: ["N"] });
  });
});

describe("a:scaleNumber is text", () => {
  const lvl = (value: number | null): ValueLevel => ({ kind: "Goal", value, qualifier: { when: "", variables: {}, conditions: [], side: "" }, source: {}, note: "" });

  it("written as a string: String(value), as typed (decimals kept)", () => {
    expect(levelCreateFacts(lvl(5), "t", VALUE, 1).scaleNumber).toBe("5");
    expect(levelCreateFacts(lvl(5.25), "t", VALUE, 1).scaleNumber).toBe("5.25");
    expect(levelCreateFacts(lvl(-3), "t", VALUE, 1).scaleNumber).toBe("-3");
    expect("scaleNumber" in levelCreateFacts(lvl(null), "t", VALUE, 1)).toBe(false);
    // the author's own text is kept
    expect(levelCreateFacts(parseLevelLine("Goal 5.50")!, "t", VALUE, 1).scaleNumber).toBe("5.50");
    expect(levelCreateFacts(parseLevelLine("Goal 1000")!, "t", VALUE, 1).scaleNumber).toBe("1000");
    // ... but only while it is still the number
    const typed = parseLevelLine("Goal 5.50")!;
    expect(levelNumberText({ ...typed, value: 6 } as ValueLevel)).toBe("6");
  });

  it("never an exponent", () => {
    expect(plainNumberText(1e21)).toBe("1000000000000000000000");
    expect(plainNumberText(1e-7)).toBe("0.0000001");
    expect(plainNumberText(-1.5e25)).toBe("-15000000000000000000000000");
    expect(levelCreateFacts(lvl(1e21), "t", VALUE, 1).scaleNumber).toBe("1000000000000000000000");
    expect(String(levelCreateFacts(lvl(1e21), "t", VALUE, 1).scaleNumber)).not.toMatch(/e/i);
  });

  it("the reader accepts numbers and strings", () => {
    expect(readLevelRecord(row("Goal", { scaleNumber: 5 }))!.value).toBe(5);
    expect(readLevelRecord(row("Goal", { scaleNumber: "5.5" }))!.value).toBe(5.5);
    expect(readLevelRecord(row("Goal", { scaleNumber: "1000000000000000000000" }))!.value).toBe(1e21);
  });

  it("an old JSON number is rewritten as text with the next edit of that level, and is left alone otherwise", () => {
    const old = row("Goal", { partOf: { "@id": VALUE }, scaleNumber: 3, note: "a" }, "g");
    const l = readLevelRecord(old)!;
    expect(levelPatch(old, l)).toEqual({});
    expect(levelPatch(old, { ...l, note: "b" })).toEqual({ note: "b", scaleNumber: "3" });
    // the typed text is kept through a read-edit-write round trip
    const text = row("Goal", { partOf: { "@id": VALUE }, scaleNumber: "5.50" }, "g2");
    expect(levelPatch(text, readLevelRecord(text)!)).toEqual({});
    expect(levelPatch(text, { ...readLevelRecord(text)!, note: "n" })).toEqual({ note: "n" });
  });
});
