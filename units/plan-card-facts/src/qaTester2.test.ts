// Hostile cases for the list writers: two writers, one list.
import { describe, expect, it } from "vitest";
import { readMeters, writeMeters, writeLineSource, readLevelLines, writeLevelLines } from "./index";


describe("list writers keep every member another writer stored (a member the person did not edit goes back byte for byte)", () => {
  it("writeMeters(readMeters(x)) keeps two members of the same known kind (two writers each stored a human meter)", () => {
    const served = [
      { "a:meterAgentKind": "human", "a:method": "Ask the walker", "a:statedBy": { "@id": "https://a.example.test/e/ann" } },
      { "a:meterAgentKind": "human", "a:method": "Watch the walker", "a:statedBy": { "@id": "https://a.example.test/e/bob" } },
    ];
    const out = writeMeters(readMeters(served));
    expect(JSON.stringify(out)).toContain("Ask the walker");
    expect(JSON.stringify(out)).toContain("Watch the walker");
  });

  it("writeLineSource on a:body keeps a second a:body member another writer added, when the person's source is unchanged", () => {
    const served = [
      { "a:sourceOf": "a:body", "a:statedBy": { "@id": "https://a.example.test/e/ann" } },
      { "a:sourceOf": "a:body", "a:statedBy": { "@id": "https://a.example.test/e/bob" }, "a:detail": "agent run 7" },
    ];
    const out = writeLineSource(served, "a:body", { statedBy: "https://a.example.test/e/ann" });
    expect(JSON.stringify(out)).toContain("agent run 7");
  });

  it("writeLevelLines(readLevelLines(x)) keeps two lines with the same date and status (two writers)", () => {
    const served = [
      { "a:status": "Developed", "a:statusWhen": "2026-10-20", "a:detail": "by agent A" },
      { "a:status": "Developed", "a:statusWhen": "2026-10-20", "a:detail": "by agent B" },
    ];
    const read = readLevelLines(served);
    const lines = read.status ? [read.status, ...read.past] : [];
    const out = writeLevelLines(lines);
    expect(JSON.stringify(out)).toContain("by agent A");
    expect(JSON.stringify(out)).toContain("by agent B");
  });
});

