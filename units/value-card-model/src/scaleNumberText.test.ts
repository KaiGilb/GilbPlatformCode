import { describe, expect, it } from "vitest";
import { levelCreateFacts, levelPatch, readLevelRecord, VALUE_CHILD_TERMS } from "./planValue";
import type { BaseRecord } from "./baseRecord";

const row = (type: string, served: Record<string, unknown>, id = "r1"): BaseRecord =>
  ({ id, entityUri: `https://h/base/e/${id}`, typeUri: `t:${type}`, facts: {}, opaqueFacts: [], etag: '"e"', updatedAt: 1, servedKeys: Object.keys(served), served: { facts: served, context: undefined, etag: '"e"' } }) as unknown as BaseRecord;
void VALUE_CHILD_TERMS;

describe("a:scaleNumber text that is not a plain number", () => {
  for (const text of ["5-10", "approx. 5", "1 000 000"]) {
    it(`"${text}": a level re-created from what the card read (kind change / move) keeps the stored number text`, () => {
      const r = row("Goal", { unitTag: "Speed.Goal", partOf: { "@id": "https://h/base/e/val1" }, elementOrder: 1, scaleNumber: text });
      const lvl = readLevelRecord(r)!;
      const facts = levelCreateFacts(lvl, "Speed.Wish", "https://h/base/e/val1", 1) as Record<string, unknown>;
      expect(facts.scaleNumber, JSON.stringify(facts)).toBe(text);
    });
  }
  it("editing only the note of a level with text '5-10' leaves a:scaleNumber out of the patch", () => {
    const r = row("Goal", { unitTag: "Speed.Goal", partOf: { "@id": "https://h/base/e/val1" }, elementOrder: 1, scaleNumber: "5-10" });
    const lvl = { ...readLevelRecord(r)!, note: "n" };
    expect(Object.keys(levelPatch(r, lvl))).not.toContain("scaleNumber");
  });
});
