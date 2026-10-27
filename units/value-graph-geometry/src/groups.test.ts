// A level with ONE qualifier choice is stored as a list and served back as a lone object; every stored shape
// must land in the same set.
import { describe, expect, it } from "vitest";
import { emptyValueCard, readLevelRecord } from "@kaigilb/gilbplatformcode-value-card-model";
import type { BaseRecord, ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { groupLevels } from "./geometry";

const row = (kind: string, served: Record<string, unknown>): BaseRecord =>
  ({
    id: "r1",
    entityUri: "https://example.test/base/e/r1",
    typeUri: `t:${kind}`,
    facts: Object.fromEntries(Object.entries(served).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])),
  }) as unknown as BaseRecord;

const LONE = { "a:name": "Brand", "a:qualifierOptions": ["Volvo"] };

describe("exactly two sets, Brand = Volvo and Brand = Tesla", () => {
  const rows = [
    row("Status", { scaleNumber: 146, levelQualifierChoice: LONE }),
    row("Tolerable", { scaleNumber: 84, levelQualifierChoice: LONE }),
    row("Goal", { scaleNumber: 200, levelQualifierChoice: LONE }),
    row("Status", { scaleNumber: 243, levelQualifierChoice: [{ "a:name": "Brand", "a:qualifierOptions": ["Tesla"] }] }),
    row("Tolerable", { scaleNumber: 90, levelQualifierChoice: { "a:name": "Brand", "a:qualifierOptions": ["Tesla"] } }),
    row("Goal", { scaleNumber: 300, levelQualifierChoice: JSON.stringify({ "a:name": "Brand", "a:qualifierOptions": ["Tesla"] }) }),
  ];
  const data: ValueCardData = { ...emptyValueCard(), levels: rows.map((r) => readLevelRecord(r)!) };
  it("the sets (legend, Arrow rows and + New all come from groupLevels)", () => {
    const sets = groupLevels(data);
    expect(sets.map((s) => s.label)).toEqual(["Brand = Volvo", "Brand = Tesla"]);
    expect(sets.map((s) => s.indexes.length)).toEqual([3, 3]);
  });
});
