// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

const g = globalThis as { __speedProof?: unknown };

async function loadProof() {
  vi.resetModules();
  return import("../src/proof");
}

describe("M meter unit", () => {
  test("M1 the exposed reading is this module's proof, at the initial counts plus writes", async () => {
    const { proof } = await loadProof();
    expect(g.__speedProof).toBe(proof);
    expect(g.__speedProof).toEqual({
      requests: { records: 0, patch: 0, other: 0 },
      answered: { records: 0, patch: 0 },
      log: [],
      lastPaint: null,
      start: null,
      writes: [],
    });
  });

  test("M2 countRequest keeps all 600 log entries (no cap)", async () => {
    const { meter, proof } = await loadProof();
    for (let i = 0; i < 600; i++) meter.countRequest("records", "GET", `https://example.test/${i}`);
    expect(proof.log).toHaveLength(600);
    expect(proof.log[0]).toEqual({ route: "records", method: "GET", url: "https://example.test/0" });
    expect(proof.log[599]).toEqual({ route: "records", method: "GET", url: "https://example.test/599" });
  });

  test("M3 subscribePaint fires on setPaint and on setStart, and the getters return what was set", async () => {
    const { subscribePaint, setPaint, setStart, getPaint, getStart } = await loadProof();
    let calls = 0;
    subscribePaint(() => { calls += 1; });
    const paint = { page: "entries", ms: 12, source: "memory" as const };
    setPaint(paint);
    expect(calls).toBe(1);
    expect(getPaint()).toEqual(paint);
    const start = { disk: true, hydrated: false, ms: 12, entries: 500, at: "x" };
    setStart(start);
    expect(calls).toBe(2);
    expect(getStart()).toEqual(start);
  });

  test("M4 startLine is the same string as before", async () => {
    const { startLine } = await loadProof();
    expect(startLine({ disk: true, hydrated: false, ms: 12, entries: 500, at: "x" })).toBe("start: disk yes, hydrated no, 500 entries, 12 ms");
  });
});
