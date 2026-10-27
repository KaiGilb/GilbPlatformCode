// a:scaleNumber is the author's TEXT end to end (model, patch, display); what it draws at is read from it.
import { describe, expect, it } from "vitest";
import {
  levelCreateFacts,
  levelDrawNumber,
  levelLineSegments,
  levelNumberDisplay,
  levelOfText,
  levelOfTyped,
  levelPatch,
  levelRangeEnds,
  readLevelRecord,
  readQualifierRecords,
} from "./planValue";
import type { ValueLevel } from "./planValueModel";
import type { BaseRecord } from "./baseRecord";

const row = (type: string, served: Record<string, unknown>, id = "r1"): BaseRecord =>
  ({ id, entityUri: `https://h/base/e/${id}`, typeUri: `t:${type}`, facts: {}, opaqueFacts: [], etag: '"e"', updatedAt: 1, servedKeys: Object.keys(served), served: { facts: served, context: undefined, etag: '"e"' } }) as unknown as BaseRecord;
const VAL = "https://h/base/e/val1";
const goal = (n: unknown) => row("Goal", { unitTag: "Speed.Goal", partOf: { "@id": VAL }, elementOrder: 1, scaleNumber: n });

describe("draw number: commas and dots (the text is kept as written)", () => {
  it("one comma, no dot, exactly 3 digits after: thousands", () => {
    expect(levelDrawNumber("1,000")).toBe(1000);
    expect(levelDrawNumber("12,500")).toBe(12500);
  });
  it("one comma, no dot, 1, 2 or 4+ digits after: decimal comma", () => {
    expect(levelDrawNumber("1,5")).toBe(1.5);
    expect(levelDrawNumber("3,25")).toBe(3.25);
    expect(levelDrawNumber("1,2345")).toBe(1.2345);
  });
  it("both marks: the LAST is the decimal", () => {
    expect(levelDrawNumber("1.000,5")).toBe(1000.5);
    expect(levelDrawNumber("1,000.5")).toBe(1000.5);
  });
  it("several commas, no dot: thousands", () => {
    expect(levelDrawNumber("1,000,000")).toBe(1000000);
  });
  it("a plain dot decimal is unchanged", () => {
    expect(levelDrawNumber("1.5")).toBe(1.5);
  });
});

describe("draw number: ranges and words", () => {
  it("ranges draw at their midpoint and have two ends; words are not drawn", () => {
    expect(levelDrawNumber("5-10")).toBe(7.5);
    expect(levelDrawNumber("5 to 10")).toBe(7.5);
    expect(levelRangeEnds("10-5")).toEqual([5, 10]);
    expect(levelRangeEnds("5")).toBeNull();
    expect(levelDrawNumber("approx. 5")).toBeNull();
    expect(levelDrawNumber("1 000 000")).toBe(1000000);
  });
});

describe("the text survives reading, patching and showing", () => {
  for (const t of ["1,5", "1,000", "1.000,5", "5-10", "approx. 5", "1 000 000", "5.50"]) {
    it(`"${t}": read as written, written back as written, an edit of the note leaves the number out of the patch`, () => {
      const r = goal(t);
      const lvl = readLevelRecord(r)!;
      expect(levelNumberDisplay(lvl)).toBe(t);
      expect(levelCreateFacts(lvl, "Speed.Wish", VAL, 1).scaleNumber).toBe(t);
      expect(Object.keys(levelPatch(r, { ...lvl, note: "n" }))).not.toContain("scaleNumber");
      expect(levelLineSegments(lvl).map((s) => s.text).join("")).toContain(t);
    });
  }
  it("a 24-digit number is shown as written, never as an exponent", () => {
    const lvl = readLevelRecord(goal("123456789012345678901234"))!;
    const shown = levelLineSegments(lvl).map((s) => s.text).join("");
    expect(shown).toContain("123456789012345678901234");
    expect(shown).not.toMatch(/e\+/);
    expect(levelNumberDisplay({ ...lvl, valueText: undefined })).not.toMatch(/e\+/);
  });
  it("a JSON number from an older record still reads and shows plainly", () => {
    const lvl = readLevelRecord(goal(5))!;
    expect(lvl.value).toBe(5);
    expect(levelNumberDisplay(lvl)).toBe("5");
  });
  it("typed text: a number is written plainly as before, other text is kept", () => {
    expect(levelOfTyped("1,000")).toEqual({ value: 1000, valueText: undefined });
    expect(levelOfTyped("5.50")).toEqual({ value: 5.5, valueText: "5.50" });
    expect(levelOfTyped("5-10")).toEqual({ value: 7.5, valueText: "5-10" });
    expect(levelOfTyped("abc")).toEqual({ value: null, valueText: "abc" });
    expect(levelOfTyped(" ")).toEqual({ value: null, valueText: undefined });
    expect(levelOfText("7")).toEqual({ value: 7, valueText: undefined });
  });
  it("a drag that moves the value makes the plain number the text; clearing clears", () => {
    const lvl = readLevelRecord(goal("5-10"))!;
    const dragged = { ...lvl, value: 9 } as ValueLevel;
    expect(levelCreateFacts(dragged, "t", VAL, 1).scaleNumber).toBe("9");
    const cleared = { ...lvl, ...levelOfTyped("") } as ValueLevel;
    expect("scaleNumber" in levelCreateFacts(cleared, "t", VAL, 1)).toBe(false);
  });
});

describe("one variable row while an older one is replaced", () => {
  it("the older t:ScaleQualifierDefinition is hidden when a t:ScaleQualifier of the same name is a part of the Value", () => {
    const old = row("ScaleQualifierDefinition", { unitTag: "S.Q.Country", partOf: { "@id": VAL }, elementOrder: 1, name: "Country", qualifierOptions: [{ "a:name": "Norway" }] }, "old1");
    const fresh = row("ScaleQualifier", { unitTag: "S.Q.Country", partOf: { "@id": VAL }, elementOrder: 1, name: "Country", qualifierOptions: ["Norway"] }, "new1");
    expect(readQualifierRecords([old], VAL).map((v) => v.name)).toEqual(["Country"]);
    const both = readQualifierRecords([old, fresh], VAL);
    expect(both.map((v) => v.name)).toEqual(["Country"]);
    expect((both[0] as unknown as { lkey?: string }).lkey).toBe("new1");
  });
});
