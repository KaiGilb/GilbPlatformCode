// Pinned cases for planValueText and the readers and writers of line sources, meters, status lines and concept.
import { describe, expect, it } from "vitest";
import {
  planValueText,
  readLevelLines,
  readLineSources,
  readMeters,
  writeLevelLines,
  writeLineSource,
  writeMeters,
  writeConcept,
} from "./index";

const METERS = [
  { "a:meterAgentKind": "human", "a:method": "review" },
  { "a:meterAgentKind": "ai", "a:method": "scan" },
  { "a:meterAgentKind": "instrument", "a:method": "probe" },
];
const STATEMENTS = [
  { "a:status": "Noted", "a:statusWhen": "2026-01-02" },
  { "a:status": "Planned", "a:statusWhen": "2026-10-09" },
];

describe("planValueText", () => {
  it("reads a JSON string and the same value as an object", () => {
    const meters = "HumanAgent: review\nAiAgent: scan\nInstrument: probe";
    expect(planValueText("hasMeter", METERS)).toBe(meters);
    expect(planValueText("hasMeter", JSON.stringify(METERS))).toBe(meters);
    const status = "Status [2026-10-09] Planned\nPast [2026-01-02] Noted";
    expect(planValueText("levelStatements", STATEMENTS)).toBe(status);
    expect(planValueText("levelStatements", JSON.stringify(STATEMENTS))).toBe(status);
    const people = [{ "@id": "https://example.test/base/e/ann", "a:unitTag": "Owner.Ann" }];
    expect(planValueText("stakeholders", people)).toBe("Owner.Ann");
    expect(planValueText("stakeholders", JSON.stringify(people))).toBe("Owner.Ann");
    const concept = { "a:label": "Performance", "@id": "https://example.test/base/t/Performance" };
    expect(planValueText("concept", concept)).toBe("Performance");
    expect(planValueText("concept", JSON.stringify(concept))).toBe("Performance");
    const parent = { "@id": "https://h.example.test/base/e/parent-fn" };
    expect(planValueText("fvParent", parent)).toBe("parent-fn");
    expect(planValueText("fvParent", JSON.stringify(parent))).toBe("parent-fn");
    expect(planValueText("lineSources", [{}, {}, {}])).toBe("3 sources");
    expect(planValueText("lineSources", JSON.stringify([{}]))).toBe("1 source");
    expect(planValueText("stakeholders", "")).toBe("—");
    expect(planValueText("hasMeter", null)).toBe("—");
  });
});

const BLANK_METERS = {
  human: { method: "", source: {} },
  ai: { method: "", source: {} },
  instrument: { method: "", source: {} },
};

describe("plan form readers and writers", () => {
  const sources = [
    { "a:sourceOf": "a:stakeholders", "a:source": "HumanAgent" },
    { "a:sourceOf": "a:level", "a:source": "Ann" },
    { "a:sourceOf": "a:body", "a:source": "HumanAgent" },
  ];

  it("round-trips line sources, one member per key, from an object and from a JSON string", () => {
    expect(readLineSources(sources)).toEqual({
      "a:stakeholders": { text: "HumanAgent" },
      "a:level": { text: "Ann" },
      "a:body": { text: "HumanAgent" },
    });
    expect(readLineSources(JSON.stringify(sources))).toEqual(readLineSources(sources));

    const replaced = writeLineSource(sources, "a:level", "AiWriter");
    expect(replaced).toEqual([
      { "a:sourceOf": "a:stakeholders", "a:source": "HumanAgent" },
      { "a:sourceOf": "a:level", "a:source": "AiWriter" },
      { "a:sourceOf": "a:body", "a:source": "HumanAgent" },
    ]);
    expect(writeLineSource(JSON.stringify(sources), "level", "AiWriter")).toEqual(replaced);

    const dup = [
      { "a:sourceOf": "a:level", "a:source": "A" },
      { "a:sourceOf": "a:body", "a:source": "B" },
      { "a:sourceOf": "a:level", "a:source": "C" },
    ];
    expect(writeLineSource(dup, "a:level", "D")).toEqual([
      { "a:sourceOf": "a:level", "a:source": "D" },
      { "a:sourceOf": "a:body", "a:source": "B" },
      { "a:sourceOf": "a:level", "a:source": "C" },
    ]);
    // The later kept member wins on read-back. The write itself keeps C.
    expect(readLineSources(writeLineSource(dup, "a:level", "D"))["a:level"]).toEqual({ text: "C" });

    expect(writeLineSource(sources, "a:level", "  ")).toEqual([
      { "a:sourceOf": "a:stakeholders", "a:source": "HumanAgent" },
      { "a:sourceOf": "a:body", "a:source": "HumanAgent" },
    ]);
    expect(readLineSources(writeLineSource(sources, "a:level", ""))).not.toHaveProperty("a:level");
  });

  it("round-trips the three meter kinds and omits an empty kind", () => {
    const filled = {
      human: { method: "asks for open", source: { text: "HumanAgent" } },
      ai: { method: "commands open", source: { text: "AiWriter" } },
      instrument: { method: "limit switch", source: { text: "AiWriter" } },
    };
    const wire = [
      { "a:meterAgentKind": "human", "a:method": "asks for open", "a:source": "HumanAgent" },
      { "a:meterAgentKind": "ai", "a:method": "commands open", "a:source": "AiWriter" },
      { "a:meterAgentKind": "instrument", "a:method": "limit switch", "a:source": "AiWriter" },
    ];
    expect(writeMeters(filled)).toEqual(wire);
    expect(readMeters(wire)).toEqual(filled);
    expect(readMeters(JSON.stringify(wire))).toEqual(filled);
    expect(writeMeters({ ...filled, instrument: { method: "  ", source: {} } })).toEqual(wire.slice(0, 2));
    expect(readMeters(wire.slice(0, 2)).instrument).toEqual({ method: "", source: {} });
  });

  it("treats the latest level line as Status and the rest as Past, newest first", () => {
    const wire = [
      { "a:status": "Noted", "a:statusWhen": "2019-05-01", "a:source": "Old" },
      { "a:status": "Planned", "a:statusWhen": "2020-01-01", "a:source": "HumanAgent" },
      { "a:status": "Developed", "a:statusWhen": "2026-10-24", "a:source": "Ann" },
    ];
    const read = readLevelLines(wire);
    expect(read.status).toEqual({ status: "Developed", when: "2026-10-24", source: { text: "Ann" } });
    expect(read.past).toEqual([
      { status: "Planned", when: "2020-01-01", source: { text: "HumanAgent" } },
      { status: "Noted", when: "2019-05-01", source: { text: "Old" } },
    ]);
    expect(readLevelLines(JSON.stringify(wire))).toEqual(read);

    const tie = [
      { "a:status": "Planned", "a:statusWhen": "2026-10-24", "a:source": "A" },
      { "a:status": "Developed", "a:statusWhen": "2026-10-24", "a:source": "B" },
    ];
    expect(readLevelLines(tie).status).toEqual({ status: "Developed", when: "2026-10-24", source: { text: "B" } });
    expect(readLevelLines(tie).past[0]).toEqual({ status: "Planned", when: "2026-10-24", source: { text: "A" } });

    const newestFirst = [
      { status: "Developed", when: "2026-10-24", source: { text: "Ann" } },
      { status: "Planned", when: "2020-01-01", source: { text: "HumanAgent" } },
    ];
    const stored = writeLevelLines(newestFirst);
    expect(stored).toEqual([
      { "a:status": "Planned", "a:statusWhen": "2020-01-01", "a:source": "HumanAgent" },
      { "a:status": "Developed", "a:statusWhen": "2026-10-24", "a:source": "Ann" },
    ]);
    expect(readLevelLines(stored).status?.status).toBe("Developed");
    expect(readLevelLines(stored).past.map((l) => l.status)).toEqual(["Planned"]);
  });

  it("returns empty for junk and never throws", () => {
    for (const junk of [null, undefined, 3, true, "nope", "{", "[}", "{bad", ""]) {
      expect(readLineSources(junk)).toEqual({});
      expect(readMeters(junk)).toEqual(BLANK_METERS);
      expect(readLevelLines(junk)).toEqual({ status: null, past: [] });
    }
    expect(writeLineSource("{", "a:level", "Ann")).toEqual([{ "a:sourceOf": "a:level", "a:source": "Ann" }]);
  });

  it("an empty list written for a new part's body is the create literal", () => {
    const me = "https://h.example.test/base/e/ann";
    expect(writeLineSource([], "a:body", "Dr Old")).toEqual([{ "a:sourceOf": "a:body", "a:source": "Dr Old" }]);
    expect(writeLineSource([], "a:body", { statedBy: me })).toEqual([{ "a:sourceOf": "a:body", "a:statedBy": { "@id": me } }]);
  });

  it("a link drops the text, text keeps a link, and an empty value removes the member", () => {
    const ann = "https://h.example.test/base/e/ann";
    const decision = "https://h.example.test/base/e/vdt-1";
    const linked = writeLineSource([{ "a:sourceOf": "a:level", "a:source": "Ann" }], "a:level", { statedBy: ann });
    expect(linked).toEqual([{ "a:sourceOf": "a:level", "a:statedBy": { "@id": ann } }]);
    expect(linked[0]).not.toHaveProperty("a:source");

    const kept = writeLineSource([{ "a:sourceOf": "a:level", "a:statedBy": { "@id": ann } }], "a:level", "Ann");
    expect(kept).toEqual([{ "a:sourceOf": "a:level", "a:source": "Ann", "a:statedBy": { "@id": ann } }]);

    const both = writeLineSource([], "a:level", { text: "Ann", statedBy: ann, derivedFrom: decision });
    expect(both).toEqual([
      {
        "a:sourceOf": "a:level",
        "a:source": "Ann",
        "a:statedBy": { "@id": ann },
        "a:derivedFrom": { "@id": decision },
      },
    ]);

    expect(writeLineSource(kept, "a:level", {})).toEqual([]);
    expect(readLineSources(writeLineSource(kept, "a:level", {}))).toEqual({});

    const ignored = [{ "a:sourceOf": "a:level", "a:source": { "@id": ann }, "a:derivedFrom": { "@id": decision } }];
    expect(readLineSources(ignored)["a:level"]).toEqual({ derivedFrom: decision });
    expect(readLineSources(ignored)["a:level"]).not.toHaveProperty("text");
    const rewritten = writeLineSource(ignored, "a:body", "X");
    // The level member is not the one being set, so it is copied. The object under a:source stays.
    expect(rewritten[0]).toEqual(ignored[0]);

    const siblings = writeLineSource(
      [
        { "a:sourceOf": "a:level", "a:source": "Ann", "a:statedBy": { "@id": ann } },
        { "a:sourceOf": "a:body", "a:source": "HumanAgent" },
      ],
      "a:body",
      "AiWriter",
    );
    expect(siblings[0]).toEqual({ "a:sourceOf": "a:level", "a:source": "Ann", "a:statedBy": { "@id": ann } });

    expect(
      writeMeters({
        human: { method: "asks", source: { statedBy: ann } },
        ai: { method: "", source: {} },
        instrument: { method: "", source: {} },
      }),
    ).toEqual([{ "a:meterAgentKind": "human", "a:method": "asks", "a:statedBy": { "@id": ann } }]);

    const fromDecision = readLevelLines([
      { "a:status": "Planned", "a:statusWhen": "2020-01-01", "a:derivedFrom": { "@id": decision } },
    ]);
    expect(fromDecision.status?.source).toEqual({ derivedFrom: decision });
    expect(fromDecision.status?.source).not.toHaveProperty("text");
  });

  it("writes a concept without a source inside it", () => {
    expect(writeConcept({ label: "Door", id: "https://example.test/base/t/Door" })).toEqual({
      "a:label": "Door",
      "@id": "https://example.test/base/t/Door",
    });
    expect(writeConcept({ label: "Door", id: "" })).toEqual({ "a:label": "Door" });
    expect(writeConcept({ label: "  ", id: "" })).toBeNull();
  });
});

