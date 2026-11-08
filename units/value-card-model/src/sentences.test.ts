// The Scale has no sentence (Kai, 2026-11-08). The Endpoint sentence is still saved as a:description, and no old key is carried.
import { describe, expect, it } from "vitest";
import { readValueCard, scaleFacts, valueCardPatch } from "./planValue";

type P = Record<string, Record<string, unknown>>;

describe("the Scale has no sentence", () => {
  it("a unit is saved; a sentence is not written and does not come back", () => {
    const d = readValueCard({ hasScale: { "a:description": "How long it takes to [Task]", "a:unit": "min" } });
    expect("text" in d.scale).toBe(false);
    expect(JSON.stringify(d.scale)).not.toContain("How long");
    d.scale.unit = "sec";
    const facts = scaleFacts(d.scale)!;
    expect(facts["a:description"]).toBeUndefined();
    expect(facts["a:unit"]).toBe("sec");
    expect(JSON.stringify(readValueCard({ hasScale: facts }).scale)).not.toContain("How long");
    expect(readValueCard({ hasScale: facts }).scale.unit).toBe("sec");
  });

  it("a sentence alone (no unit) is not a Scale", () => {
    const d = readValueCard({ hasScale: { "a:description": "Just words", "a:scaleDirection": "higher" } });
    expect(scaleFacts(d.scale)).toBeNull();
  });

  it("the older scale / scaleText sentence keys are not read and are never written", () => {
    for (const old of ["scaleText", "scale"]) {
      const d = readValueCard({ hasScale: { [old]: "old words", "a:unit": "min" } });
      expect(JSON.stringify(d.scale)).not.toContain("old words");
      d.scale.unit = "sec";
      const entry = scaleFacts(d.scale)!;
      expect(entry["a:description"]).toBeUndefined();
      expect(entry["a:unit"]).toBe("sec");
      expect(JSON.stringify(entry)).not.toMatch(/scaleText|"a:scale"|old words/);
    }
  });

  it("a stored description is not read, even beside an older name", () => {
    const d = readValueCard({ hasScale: { "a:description": "new", scaleText: "old", "a:unit": "min" } });
    expect(d.scale.unit).toBe("min");
    expect(JSON.stringify(d.scale)).not.toContain("new");
    expect(JSON.stringify(d.scale)).not.toContain("old");
  });
});

describe("the Endpoint sentence moves to a:description", () => {
  it("the older endpointText moves to a:description on edit, even with no part typed", () => {
    const d = readValueCard({ endpoint: { endpointText: "kept words" } });
    const entry = (valueCardPatch(d) as P).endpoint;
    expect(entry["a:description"]).toBe("kept words");
    expect(JSON.stringify(entry)).not.toContain("endpointText");
    expect(readValueCard({ endpoint: entry }).endpoint.text).toBe("kept words");
  });

  it("the older a:definition moves too", () => {
    const d = readValueCard({ endpoint: { "a:definition": "def words" } });
    const entry = (valueCardPatch(d) as P).endpoint;
    expect(entry["a:description"]).toBe("def words");
    expect(JSON.stringify(entry)).not.toContain("definition");
  });
});
