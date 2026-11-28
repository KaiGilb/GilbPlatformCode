// Runs every case of fixtures/time-lines.json: the file every consumer of the Time line runs against its own reader.
import { describe, expect, test } from "vitest";
import fixture from "../fixtures/time-lines.json";
import { extractTimeLines } from "./index";

interface Case { name: string; text: string; values: string[]; outText: string; note?: string }

describe("fixtures/time-lines.json", () => {
  test("has the agreed form and enough cases", () => {
    expect(fixture.schema).toBe(1);
    expect(fixture.cases.length).toBeGreaterThanOrEqual(40);
    const names = fixture.cases.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of fixture.cases as Case[]) {
      expect(typeof c.name).toBe("string");
      expect(typeof c.text).toBe("string");
      expect(Array.isArray(c.values)).toBe(true);
      expect(typeof c.outText).toBe("string");
      expect(Object.keys(c).every((k) => ["name", "text", "values", "outText", "note"].includes(k)), c.name).toBe(true);
    }
  });
  test("the two known limits are marked", () => {
    const noted = (fixture.cases as Case[]).filter((c) => c.note !== undefined);
    expect(noted.map((c) => c.note)).toEqual(["known limit, accepted 2026-11-27", "known limit, accepted 2026-11-27"]);
  });
  describe("each case", () => {
    test.each((fixture.cases as Case[]).map((c) => [c.name, c] as const))("%s", (_name, c) => {
      const r = extractTimeLines(c.text);
      expect(r.values).toEqual(c.values);
      expect(r.text).toBe(c.outText);
    });
  });
});
