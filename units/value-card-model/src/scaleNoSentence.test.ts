// The Scale has no sentence (Kai, 2026-11-08): it is not read, not written, and not a source of qualifier names.
import { describe, expect, it } from "vitest";
import { emptyValueCard, readScaleRecord, readValueCard, scaleCreateFacts, scaleFacts, scalePatch, scaleQualifierNames } from "./planValue";
import type { BaseRecord } from "./baseRecord";

const SENTENCE = "coder time to create a working [App] from a cold start";
const PARENT = "https://h/base/e/val1";

const row = (served: Record<string, unknown>): BaseRecord =>
  ({
    id: "s1",
    entityUri: "https://h/base/e/s1",
    typeUri: "t:Scale",
    facts: {},
    opaqueFacts: [],
    etag: '"e"',
    updatedAt: 1,
    servedKeys: Object.keys(served),
    served: { facts: served, context: undefined, etag: '"e"' },
  }) as unknown as BaseRecord;

/** Enumerable card data only. The carried raw is not part of what the card shows. */
function dump(v: unknown, seen = new Set<unknown>()): string {
  if (v == null || typeof v !== "object") return String(v ?? "");
  if (seen.has(v)) return "";
  seen.add(v);
  return Object.keys(v as object)
    .map((k) => `${k}=${dump((v as Record<string, unknown>)[k], seen)}`)
    .join("\n");
}

function keysDeep(v: unknown, acc: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, acc));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    acc.push(k);
    keysDeep(x, acc);
  }
  return acc;
}

function assertNoSentenceKeys(facts: unknown) {
  const keys = keysDeep(facts);
  for (const banned of ["description", "a:description", "scale", "a:scale", "scaleText"]) {
    expect(keys, banned).not.toContain(banned);
  }
  expect(JSON.stringify(facts)).not.toContain("scaleText");
  expect(JSON.stringify(facts)).not.toContain(SENTENCE);
  expect(JSON.stringify(facts)).not.toContain("[App]");
}

describe("the Scale has no sentence", () => {
  it("readScaleRecord keeps unit and context and drops the sentence", () => {
    const got = readScaleRecord(row({ description: SENTENCE, unit: "minutes", scaleContext: "from go until test", scaleDirection: "higher" }));
    expect(got.unit).toBe("minutes");
    expect(got.context).toBe("from go until test");
    expect("text" in got).toBe(false);
    expect(Object.keys(got)).not.toContain("text");
    const shown = dump(got);
    expect(shown).not.toContain(SENTENCE);
    expect(shown).not.toContain("coder time");
    expect(shown).not.toContain("cold start");
    expect(shown).not.toContain("[App]");
  });

  it("scaleFacts and scaleCreateFacts never write a sentence", () => {
    const fresh = { ...emptyValueCard().scale, unit: "minutes", rate: "per [Task]", context: "from go until test", direction: "lower" as const };
    const fromOld = readScaleRecord(row({ description: SENTENCE, scale: "older words", scaleText: "oldest words", unit: "minutes", scaleDirection: "higher" }));
    for (const s of [fresh, fromOld]) {
      assertNoSentenceKeys(scaleFacts(s));
      assertNoSentenceKeys(scaleCreateFacts(s, "V.Scale", PARENT));
    }
    expect(scaleFacts(fromOld)).toMatchObject({ "a:unit": "minutes" });
    expect(scaleCreateFacts(fresh, "V.Scale", PARENT)).toMatchObject({ unit: "minutes", rate: "per [Task]", scaleContext: "from go until test" });
  });

  describe("scalePatch", () => {
    const stored = () => row({ description: SENTENCE, unit: "minutes", scaleDirection: "higher" });

    it("an unchanged card yields an empty patch", () => {
      const rec = stored();
      expect(scalePatch(rec, readScaleRecord(rec))).toEqual({});
    });

    it("a unit edit also clears a stored description", () => {
      const rec = stored();
      expect(scalePatch(rec, { ...readScaleRecord(rec), unit: "hours" })).toEqual({ unit: "hours", description: null });
    });

    it("a context edit clears a stored scaleText", () => {
      const rec = row({ scaleText: "old words only", scaleDirection: "higher" });
      const patch = scalePatch(rec, { ...readScaleRecord(rec), context: "from go until test" });
      expect(patch.scaleContext).toBe("from go until test");
      expect(patch.scaleText).toBeNull();
      expect("description" in patch).toBe(false);
    });

    it("a context edit of a Scale with no sentence does not mention description", () => {
      const rec = row({ unit: "minutes", scaleContext: "before", scaleDirection: "higher" });
      const patch = scalePatch(rec, { ...readScaleRecord(rec), context: "from go until test" });
      expect(patch.scaleContext).toBe("from go until test");
      expect("description" in patch).toBe(false);
      expect("scale" in patch).toBe(false);
      expect("scaleText" in patch).toBe(false);
    });
  });

  it("qualifier names come from Unit, Rate and Context, not from an old description", () => {
    expect(scaleQualifierNames({ unit: "minutes", rate: "per [Task]", context: "for [Device]" })).toEqual(["Task", "Device"]);
    const named = readScaleRecord(row({ description: SENTENCE, unit: "minutes", scaleDirection: "higher" }));
    expect(scaleQualifierNames(named)).not.toContain("App");
    expect(scaleQualifierNames(named)).toEqual([]);
  });

  it("an inline old Scale does not carry a:description onto the written entry", () => {
    const d = readValueCard({
      hasScale: { "a:description": SENTENCE, "a:unit": "minutes", "a:scaleDirection": "higher", future: "keep" },
    });
    const entry = scaleFacts(d.scale)!;
    expect(entry["a:unit"]).toBe("minutes");
    expect(entry.future).toBe("keep");
    expect(entry["a:description"]).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain("description");
    expect(JSON.stringify(entry)).not.toContain(SENTENCE);
  });

  it("an inline old Scale does not carry scaleText onto the written entry", () => {
    const d = readValueCard({
      hasScale: { scaleText: "old words", "a:unit": "minutes", "a:scaleDirection": "higher" },
    });
    const entry = scaleFacts(d.scale)!;
    expect(entry["a:unit"]).toBe("minutes");
    expect(JSON.stringify(entry)).not.toContain("scaleText");
  });

  it("an inline old Scale does not carry a bare scale key onto the written entry", () => {
    const d = readValueCard({
      hasScale: { scale: "old words", "a:unit": "minutes", "a:scaleDirection": "higher" },
    });
    const entry = scaleFacts(d.scale)!;
    expect(entry["a:unit"]).toBe("minutes");
    expect(Object.keys(entry)).not.toContain("scale");
  });
});
