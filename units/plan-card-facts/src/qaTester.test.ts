// Library level: served-shape round trips and list writers.
import { describe, expect, it } from "vitest";
import {
  readConcept,
  readLevelLines,
  readLineSources,
  readMeters,
  writeConcept,
  writeLevelLines,
  writeLineSource,
  writeMeters,
} from "./index";

// The vault's framing: a one-member list is the bare object,
// inner keys lose `a:`; a list of two or more is an array (accepted either way by the readers).
function stripA(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripA);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k.startsWith("a:") ? k.slice(2) : k] = stripA(val);
  return out;
}
function served(written: unknown): unknown {
  const s = stripA(written);
  return Array.isArray(s) && s.length === 1 ? s[0] : s;
}
const SH = "https://p.example.test/vault/e/stakeholder-1";
const SH2 = "https://p.example.test/vault/e/stakeholder-2";

describe("served-shape round trips (each record type the card writes)", () => {
  it("Function/Solution record lists: hasMeter, levelStatements, lineSources, concept round-trip through the served shape", () => {
    const meters = { human: { method: "Looks", source: { statedBy: SH } }, ai: { method: "", source: {} }, instrument: { method: "", source: {} } };
    expect(readMeters(served(writeMeters(meters)))).toEqual(meters);
    const two = { human: { method: "Looks", source: {} }, ai: { method: "Script", source: { text: "Ann" } }, instrument: { method: "", source: {} } };
    expect(readMeters(served(writeMeters(two)))).toEqual(two);
    const lines = [
      { status: "Developed", when: "2026-10-25", source: { statedBy: SH } },
      { status: "Planned", when: "2026-10-01", source: {} },
    ];
    const back = readLevelLines(served(writeLevelLines(lines)));
    expect([back.status, ...back.past]).toEqual(lines);
    const one = readLevelLines(served(writeLevelLines([lines[0]!])));
    expect(one.status).toEqual(lines[0]);
    const ls = writeLineSource(undefined, "a:level", { statedBy: SH });
    expect(readLineSources(served(ls))).toEqual({ "a:level": { statedBy: SH } });
    const concept = { label: "Walking", id: "https://example.test/base/t/Walking" };
    expect(readConcept(served(writeConcept(concept)))).toEqual(concept);
  });

});

describe("list writers keep every member and field they did not mean to change (no silent overwrite)", () => {
  // A member list another writer (an AI agent) wrote with one field this app does not know.
  it("writeLineSource keeps an unknown field on the member it re-writes and on other members", () => {
    const stored = [
      { "a:sourceOf": "a:body", "a:source": "Dr Ames", "a:confidence": "high" },
      { "a:sourceOf": "a:level", "a:statedBy": { "@id": SH }, "a:detail": "2026-10-20" },
    ];
    const next = writeLineSource(served(stored), "a:body", { statedBy: SH2 }) as Record<string, unknown>[];
    const level = next.find((m) => m["a:sourceOf"] === "a:level")!;
    expect(level["a:detail"]).toBe("2026-10-20");
  });

  it("writeLineSource keeps a member whose statedBy names two parties", () => {
    const stored = [
      { "a:sourceOf": "a:level", "a:statedBy": [{ "@id": SH }, { "@id": SH2 }] },
      { "a:sourceOf": "a:concept", "a:source": "Ann" },
    ];
    const next = writeLineSource(stored, "a:concept", "Zen") as Record<string, unknown>[];
    expect(next.some((m) => m["a:sourceOf"] === "a:level")).toBe(true);
  });

  it("writeMeters(readMeters(x)) keeps a meter member of a kind it does not know", () => {
    const stored = [
      { "a:meterAgentKind": "human", "a:method": "Looks" },
      { "a:meterAgentKind": "sensor", "a:method": "Door switch" },
    ];
    const meters = readMeters(stored);
    meters.ai = { method: "Script", source: {} };
    const out = JSON.stringify(writeMeters(meters));
    expect(out).toContain("Door switch");
  });

  it("writeLevelLines keeps an unknown field on a Past line", () => {
    const stored = [{ "a:status": "Developed", "a:statusWhen": "2026-10-20", "a:index": "shipped to M1" }];
    const read = readLevelLines(stored);
    const lines = [{ status: "In-Production", when: "2026-10-25", source: {} }, read.status!, ...read.past];
    expect(JSON.stringify(writeLevelLines(lines))).toContain("shipped to M1");
  });
});

