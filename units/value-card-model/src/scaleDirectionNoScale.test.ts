/** A new Value with levels but no Scale is accepted as is. */
import { describe, expect, it } from "vitest";
import { emptyValueCard, readValueCard, scaleDirectionOf, scaleFacts } from "./planValue";
import type { ValueLevel } from "./planValueModel";

const lv = (kind: string, value: number): ValueLevel => ({ kind, value, qualifier: { when: "", variables: {}, conditions: [], side: "" }, source: {}, note: "" });
const stored = (d: { scale: Parameters<typeof scaleFacts>[0] }) => scaleFacts(d.scale);

describe("a new Value with levels but no Scale", () => {
  it("reads higher, stores no direction while no Scale is written, and stores it at the first Scale write", () => {
    const d = { ...emptyValueCard(), levels: [lv("Goal", 5), lv("Past", 2)] };
    expect(scaleDirectionOf(d)).toBe("higher");
    expect(stored(d)).toBeNull();
    d.scale = { ...d.scale, unit: "min" };
    expect(stored(d)!["a:scaleDirection"]).toBe("higher");
    expect(readValueCard({ hasScale: stored(d) }).scale.direction).toBe("higher");
  });
});
