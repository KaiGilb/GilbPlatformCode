// A list write keeps every member and key the card did not edit.
import { describe, expect, it } from "vitest";
import {
  carryMeter,
  readLevelLines,
  readMeters,
  withLineOthers,
  writeLevelLines,
  writeLineSource,
  writeMeters,
} from "./index";


const SH = "https://p.example.test/vault/e/stakeholder-1";
const SH2 = "https://p.example.test/vault/e/stakeholder-2";

describe("writeMeters(readMeters(x)) keeps a served list", () => {
  it("deep-equals a list with unknown keys, an unknown kind, and bare keys", () => {
    const prefixed = [
      { "a:meterAgentKind": "human", "a:method": "Looks", "a:detail": "2026-10-20", "a:confidence": "high" },
      { "a:meterAgentKind": "sensor", "a:method": "Door switch", "a:index": "left on" },
    ];
    expect(writeMeters(readMeters(prefixed))).toEqual(prefixed);

    const bare = [
      { meterAgentKind: "ai", method: "Script", detail: "2026-10-21" },
      { meterAgentKind: "sensor", method: "Door switch" },
    ];
    expect(writeMeters(readMeters(bare))).toEqual(bare);
  });

  it("editing one meter's method changes only a:method on that member", () => {
    const stored = [
      { "a:meterAgentKind": "human", "a:method": "Looks", "a:detail": "2026-10-20", "a:index": "kept" },
      { "a:meterAgentKind": "ai", "a:method": "Script", "a:confidence": "high" },
    ];
    const meters = readMeters(stored);
    meters.human = carryMeter({ ...meters.human, method: "Watches" }, meters.human);
    const written = writeMeters(meters) as Record<string, unknown>[];
    expect(written[0]).toEqual({ ...stored[0], "a:method": "Watches" });
    expect(written[1]).toEqual(stored[1]);
  });
});

describe("writeLevelLines keeps members it did not edit", () => {
  it("status plus past keeps every member and unknown key", () => {
    const stored = [
      { "a:status": "Planned", "a:statusWhen": "2026-10-01", "a:index": "first note" },
      { "a:detail": "2026-10-02", "a:index": "not a status line" },
      { status: "Developed", statusWhen: "2026-10-20", detail: "2026-10-20" },
    ];
    const read = readLevelLines(stored);
    const lines = withLineOthers(read.status ? [read.status, ...read.past] : [], read.others ?? []);
    const written = writeLevelLines(lines) as Record<string, unknown>[];
    expect(written).toHaveLength(stored.length);
    for (const member of stored) {
      expect(written).toContainEqual(member);
    }
  });
});

describe("writeLineSource leaves an untouched member equal to the one it was served", () => {
  it("a no-op edit returns the served member, and a new source replaces a statedBy list", () => {
    const one = { "a:sourceOf": "a:level", "a:statedBy": { "@id": SH }, "a:detail": "2026-10-20" };
    expect(writeLineSource([one], "a:level", { statedBy: SH })).toEqual([one]);
    const listed = { "a:sourceOf": "a:level", "a:statedBy": [{ "@id": SH }, { "@id": SH2 }], "a:detail": "2026-10-20" };
    const replaced = writeLineSource([listed], "a:level", { statedBy: SH2 }) as Record<string, unknown>[];
    expect(replaced[0]).toEqual({
      "a:detail": "2026-10-20",
      "a:sourceOf": "a:level",
      "a:statedBy": { "@id": SH2 },
    });
  });
});
