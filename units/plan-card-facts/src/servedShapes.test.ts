// The vault serves one inline member as a bare object, and drops the `a:` prefix.
import { describe, expect, it } from "vitest";
import { readLevelLines, readLineSources, readMeters, servedList } from "./index";


const PERSON_A = "https://a.example.test/vault/e/person-a";
const PERSON_B = "https://b.example.test/vault/e/person-b";
const A = "https://example.test/base/a";

const HUMAN_METER = { meterAgentKind: "human", method: "Test meter" };
const INSTRUMENT_METER = { meterAgentKind: "instrument", statedBy: { "@id": PERSON_A } };
const BARE_STATUS = { statedBy: { "@id": PERSON_B }, status: "Developed", statusWhen: "2026-10-25" };
const BARE_SOURCES = { sourceOf: "a:body", statedBy: { "@id": PERSON_B } };

function iriMember(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fields)) out[`${A}/${name}`] = value;
  return out;
}

describe("served plan lines", () => {
  it("reads a human meter and an instrument meter from the object the vault serves", () => {
    expect(readMeters(HUMAN_METER).human).toEqual({ method: "Test meter", source: {} });
    expect(readMeters(INSTRUMENT_METER).instrument).toEqual({ method: "", source: { statedBy: PERSON_A } });
    expect(servedList(null)).toEqual([]);
    expect(servedList(undefined)).toEqual([]);
    expect(servedList({ "@id": PERSON_A })).toEqual([]);
    expect(servedList({ "@value": "x" })).toEqual([]);
    expect(servedList(HUMAN_METER)).toEqual([HUMAN_METER]);
    expect(servedList([{ "@id": PERSON_A }, HUMAN_METER])).toHaveLength(2);
  });

  it("reads a bare status, and a two-member bare array as Status then Past", () => {
    const walk = readLevelLines(BARE_STATUS);
    expect(walk.status).toEqual({ status: "Developed", when: "2026-10-25", source: { statedBy: PERSON_B } });
    expect(walk.past).toEqual([]);
    const two = readLevelLines([
      { status: "Noted", statusWhen: "2026-01-02" },
      { status: "Planned", statusWhen: "2026-10-09" },
    ]);
    expect(two.status).toEqual({ status: "Planned", when: "2026-10-09", source: {} });
    expect(two.past).toEqual([{ status: "Noted", when: "2026-01-02", source: {} }]);
  });

  it("reads a bare line source for a:body", () => {
    expect(readLineSources(BARE_SOURCES)).toEqual({ "a:body": { statedBy: PERSON_B } });
  });

  it("accepts a: keys, full IRIs, and a JSON string of either", () => {
    const metersA = [{ "a:meterAgentKind": "human", "a:method": "Test meter" }];
    const metersIri = [iriMember({ meterAgentKind: "human", method: "Test meter" })];
    expect(readMeters(metersA).human.method).toBe("Test meter");
    expect(readMeters(metersIri).human.method).toBe("Test meter");
    expect(readMeters(JSON.stringify(metersA)).human.method).toBe("Test meter");
    expect(readMeters(JSON.stringify(metersIri)).human.method).toBe("Test meter");

    const linesA = [{ "a:status": "Developed", "a:statusWhen": "2026-10-25", "a:statedBy": { "@id": PERSON_B } }];
    const linesIri = [iriMember({ status: "Developed", statusWhen: "2026-10-25", statedBy: { "@id": PERSON_B } })];
    expect(readLevelLines(linesA).status).toEqual({ status: "Developed", when: "2026-10-25", source: { statedBy: PERSON_B } });
    expect(readLevelLines(linesIri).status).toEqual(readLevelLines(linesA).status);
    expect(readLevelLines(JSON.stringify(linesA)).status).toEqual(readLevelLines(linesA).status);
    expect(readLevelLines(JSON.stringify(linesIri)).status).toEqual(readLevelLines(linesA).status);

    const sourcesA = [{ "a:sourceOf": "a:body", "a:statedBy": { "@id": PERSON_B } }];
    const sourcesIri = [iriMember({ sourceOf: "a:body", statedBy: { "@id": PERSON_B } })];
    expect(readLineSources(sourcesA)).toEqual({ "a:body": { statedBy: PERSON_B } });
    expect(readLineSources(sourcesIri)).toEqual(readLineSources(sourcesA));
    expect(readLineSources(JSON.stringify(sourcesA))).toEqual(readLineSources(sourcesA));
    expect(readLineSources(JSON.stringify(BARE_SOURCES))).toEqual(readLineSources(sourcesA));
    expect(readLineSources(JSON.stringify(sourcesIri))).toEqual(readLineSources(sourcesA));
  });
});

