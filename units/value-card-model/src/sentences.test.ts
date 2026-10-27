// The Scale sentence and the Endpoint sentence are saved (a:description), and no old key is carried.
import { describe, expect, it } from "vitest";
import { readValueCard, scaleFacts, valueCardPatch } from "./planValue";

type P = Record<string, Record<string, unknown>>;

describe("the Scale sentence is saved", () => {
  it("a new Value (no old keys): type a Scale sentence, save, re-read", () => {
    const d = readValueCard({});
    d.scale.text = "How long it takes to [Task]";
    d.scale.unit = "min";
    const facts = scaleFacts(d.scale)!;
    expect(facts["a:description"]).toBe("How long it takes to [Task]");
    expect(readValueCard({ hasScale: facts }).scale.text).toBe("How long it takes to [Task]");
    expect(readValueCard({ hasScale: facts }).scale.unit).toBe("min");
  });

  it("a sentence alone (no unit) is still saved", () => {
    const d = readValueCard({});
    d.scale.text = "Just words";
    expect(readValueCard({ hasScale: scaleFacts(d.scale) }).scale.text).toBe("Just words");
  });

  it("the older scale / scaleText sentence keys are read, moved to a:description on write, and never carried", () => {
    for (const old of ["scaleText", "scale"]) {
      const d = readValueCard({ hasScale: { [old]: "old words", "a:unit": "min" } });
      expect(d.scale.text).toBe("old words");
      d.scale.unit = "sec";
      const entry = scaleFacts(d.scale)!;
      expect(entry["a:description"]).toBe("old words");
      expect(JSON.stringify(entry)).not.toMatch(/scaleText|"a:scale"/);
    }
  });

  it("description wins over the old names when both are held", () => {
    expect(readValueCard({ hasScale: { "a:description": "new", scaleText: "old" } }).scale.text).toBe("new");
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
