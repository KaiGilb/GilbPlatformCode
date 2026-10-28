import { describe, expect, it } from "vitest";
import {
  LEVEL_TERMS,
  formatLevelLine,
  levelCreateFacts,
  levelPatch,
  levelTag,
  levelTagTry,
  nextLevelOrder,
  parseLevelLine,
  readLegacyLevels,
  readLevelRecords,
  readValueCard,
  scaleVariableNames,
  sortLevels,
  scaleFacts,
  valueCardPatch,
} from "./planValue";
import type { BaseRecord } from "./baseRecord";
import type { ScaleVariable, ValueCardData } from "./planValueModel";

const KZ = { text: "Ann" };
const variables: ScaleVariable[] = [
  {
    name: "User type",
    definition: "",
    defaultOption: "Novice",
    options: [
      { name: "Novice", definition: "has never used this app; uses a smartphone at least weekly" },
      { name: "Senior 70+", definition: "" },
    ],
    source: {},
  },
  {
    name: "Task",
    definition: "",
    defaultOption: "Order.Place",
    options: [{ name: "Order.Place", definition: "find a product and place one paid order" }],
    source: {},
  },
  {
    name: "Device",
    definition: "",
    defaultOption: "Mobile",
    options: [{ name: "Mobile", definition: "a phone running iOS 17+ or Android 13+" }],
    source: KZ,
  },
];

const LINES = [
  "Past [2025-10-01, Release 1.0, Novice, Order.Place, Mobile] 14 <- Ann estimate",
  "Status [2026-10-27, Release 2.3, Novice, Order.Place, Mobile] 9 <- Ann estimate",
  "Tolerable [2027-06-30, Release 3.0, Novice, Order.Place, Mobile] 10 <- Ann estimate",
  "Goal [2027-06-30, Release 3.0, Novice, Order.Place, Mobile] 3 <- Ann estimate",
  "Tolerable [2027-06-30, Release 3.0, User type = Senior 70+, Order.Place, Mobile] 15 <- Ann estimate",
  "Goal [2027-06-30, Release 3.0, User type = Senior 70+, Order.Place, Mobile] 5 <- Ann estimate",
  "Wish [2027-06-30, Release 3.0, Novice, Order.Place, Mobile] 1 <- Ann example, requester to confirm",
];

function example(): ValueCardData {
  const levels = LINES.map((l) => parseLevelLine(l, variables)!);
  return {
    scale: {
      text: "minutes for a defined [User type] to learn to do a defined [Task] in the app, on a defined [Device], without help",
      unit: "minutes",
      rate: "per learner, per [Task]; the median over the learners tested",
      context: "from: first opening of the app, with no training; until: the [Task] is first done correctly, without help",
      direction: "lower",
      source: KZ,
    },
    variables,
    endpoint: {
      subject: { typeIri: "", typeLabel: "", words: "" },
      reference: { typeIri: "", typeLabel: "", words: "" },
      text: "Subject = mobile app, reference = AppUser",
      source: KZ,
    },
    meters: [
      {
        qualifier: "During Development",
        lines: [
          { kind: "human", method: "watches 5 Novice test users", source: KZ },
          { kind: "ai", method: "runs a clickable prototype", source: KZ },
          { kind: "instrument", method: "test recording software", source: KZ },
        ],
      },
      { qualifier: "After Release", lines: [{ kind: "human", method: "reads the analytics dashboard", source: KZ }] },
    ],
    levels,
  };
}

describe("planValue level lines", () => {
  it("parses every example line and formats it back to the same level", () => {
    for (const line of LINES) {
      const level = parseLevelLine(line, variables);
      expect(level, line).not.toBeNull();
      expect(parseLevelLine(formatLevelLine(level!, variables), variables)).toEqual(level);
    }
    const senior = parseLevelLine(LINES[5]!, variables)!;
    expect(senior.qualifier.variables).toEqual({ "User type": "Senior 70+", Task: "Order.Place", Device: "Mobile" });
    expect(senior.qualifier.conditions).toEqual(["Release 3.0"]);
    expect(senior.source).toEqual({ text: "Ann" });
    expect(senior.note).toBe("estimate");
    expect(parseLevelLine(LINES[6]!, variables)!.note).toBe("example, requester to confirm");
  });

  it("parses a free-text qualifier and a long date", () => {
    const l = parseLevelLine("Goal [30 Jan 2027, If Russia Ukraine war is ended, in Stockholm, for Norwegians] 42")!;
    expect(l.qualifier.when).toBe("2027-01-30");
    expect(l.qualifier.conditions).toHaveLength(3);
    expect(l.value).toBe(42);
    expect(formatLevelLine(l)).toBe("Goal [2027-01-30, If Russia Ukraine war is ended, in Stockholm, for Norwegians] 42");
  });

  it("reads Name = Option variables on a Scale with per [Country] per [Age-Group]", () => {
    const names = scaleVariableNames("deaths per [Country] per [Age-Group]");
    expect(names).toEqual(["Country", "Age-Group"]);
    const vars: ScaleVariable[] = names.map((name) => ({ name, definition: "", defaultOption: "", options: [], source: {} }));
    const l = parseLevelLine("Goal [2027-01-30, Country = Sweden, Age-Group = 30-40] 7", vars)!;
    expect(l.qualifier.variables).toEqual({ Country: "Sweden", "Age-Group": "30-40" });
    expect(formatLevelLine(l, vars)).toBe("Goal [2027-01-30, Country = Sweden, Age-Group = 30-40] 7");
  });

  it("takes comma decimals, negatives, low/high, custom kinds and rejects junk", () => {
    expect(parseLevelLine("Budget 3,5")!.value).toBe(3.5);
    expect(parseLevelLine("fail [low] -2")!).toMatchObject({ kind: "Fail", value: -2, qualifier: { side: "low" } });
    expect(parseLevelLine("")).toBeNull();
    expect(parseLevelLine("Goal five")).toBeNull();
  });

  it("sorts by qualifier group first, then by kind", () => {
    const sorted = sortLevels(LINES.map((l) => parseLevelLine(l, variables)!)).map((l) => `${l.kind}${l.value}`);
    expect(sorted).toEqual(["Past14", "Status9", "Tolerable10", "Goal3", "Wish1", "Tolerable15", "Goal5"]);
  });
});

describe("planValue card round trip", () => {
  it("reads back exactly what valueCardPatch wrote (levels are their own records, never in the patch)", () => {
    const x = example();
    const patch = valueCardPatch(x);
    expect("valueLevels" in patch).toBe(false);
    // The Scale and Endpoint sentences are saved as a:description, so they come back.
    // The old stored lists (qualifier definitions, meters) are read-only: not in the patch.
    const without = { ...x, levels: [], variables: [], meters: [] };
    // The Scale is its own record (scaleFacts); the Value's patch holds the Endpoint only.
    expect(Object.keys(patch).sort()).toEqual(["endpoint"]);
    const whole = { ...patch, hasScale: scaleFacts(x.scale) };
    expect(readValueCard(whole)).toEqual(without);
    expect(valueCardPatch(readValueCard(whole))).toEqual(patch);
    const strings = Object.fromEntries(Object.entries(whole).map(([k, v]) => [`a:${k}`, JSON.stringify(v)]));
    expect(readValueCard(strings)).toEqual(without);
  });

  it("keeps members it does not own", () => {
    const scale = { ...scaleFacts(example().scale), future: "keep" };
    const again = scaleFacts(readValueCard({ hasScale: scale }).scale);
    expect((again as Record<string, unknown>).future).toBe("keep");
  });

  it("reads the older stored Scale (valueScale) and writes it only under a:hasScale", () => {
    const d = readValueCard({ valueScale: { unit: "min", rate: "per [Task]" } });
    expect(d.scale).toMatchObject({ unit: "min", rate: "per [Task]" });
    const patch = valueCardPatch(d);
    expect("valueScale" in patch).toBe(false);
    expect("hasScale" in patch).toBe(false);
    expect(scaleFacts(d.scale)).toMatchObject({ "a:unit": "min", "a:rate": "per [Task]" });
    expect(readValueCard({ hasScale: { "a:unit": "sec" }, valueScale: { unit: "min" } }).scale.unit).toBe("sec");
  });

  it("reads the old stored level list (read-only) and never writes it", () => {
    const d = readValueCard({ valueLevels: [{ "levelKind": "Goal", "levelValue": 3 }, "stray"] });
    expect(d.levels.map((l) => [l.kind, l.value])).toEqual([["Goal", 3]]);
    expect("valueLevels" in valueCardPatch(d)).toBe(false);
    expect(readLegacyLevels([{ "levelKind": "Goal" }, 7]).length).toBe(1);
  });

  it("the older Scale sentence (scaleText, and a:scale) is read from both and moved to a:description, never carried", () => {
    const d = readValueCard({ hasScale: { scaleText: "old", "a:unit": "min" } });
    expect(d.scale.text).toBe("old");
    expect(readValueCard({ hasScale: { "a:scale": "new", "a:unit": "min" } }).scale.text).toBe("new");
    const facts = scaleFacts(d.scale) as Record<string, unknown>;
    expect(facts.scaleText).toBeUndefined();
    expect(facts["a:description"]).toBe("old");
    expect(facts["a:scale"]).toBeUndefined();
    d.scale.unit = "sec";
    expect((scaleFacts(d.scale) as Record<string, unknown>)["a:unit"]).toBe("sec");
  });

  it("junk is empty data, never a throw", () => {
    for (const junk of [null, 5, "{{", [1, 2], { "@id": "x" }]) {
      const d = readValueCard({ valueScale: junk, valueLevels: junk, valueMeters: junk, scaleQualifierDefinitions: junk, endpoint: junk, valueEndpoint: junk });
      expect(d.levels).toEqual([]);
      expect(d.scale.text).toBe("");
    }
    // An empty Value shows Thing / Person; the patch of that read carries them (written only with a first Endpoint save).
    const empty = valueCardPatch(readValueCard({})) as Record<string, Record<string, Record<string, unknown>>>;
    expect(empty.endpoint["a:endpointSubject"]!["@id"]).toBe("https://ontology.example.test/base/t/Thing");
    expect(empty.endpoint["a:endpointReference"]!["@id"]).toBe("https://ontology.example.test/base/t/Person");
  });
});

describe("Endpoint member key", () => {
  it("writes a:endpoint (not valueEndpoint); the old free text (definition, endpointText) is read, never written anew", () => {
    const data = readValueCard({ valueEndpoint: JSON.stringify({ definition: "old text" }) });
    expect(data.endpoint.text).toBe("old text");
    data.endpoint.subject = { typeIri: "https://example.test/base/t/MobileApp", typeLabel: "Mobile app", words: "" };
    const patch = valueCardPatch(data) as Record<string, Record<string, unknown>>;
    expect(patch.valueEndpoint).toBeUndefined();
    expect(patch.endpoint["a:endpointSubject"]).toMatchObject({ "a:label": "Mobile app" });
    expect(patch.endpoint.definition).toBeUndefined();
    expect(patch.endpoint["a:definition"]).toBeUndefined();
    const carried = readValueCard({ endpoint: { endpointText: "kept" } });
    expect(carried.endpoint.text).toBe("kept");
    // The old sentence moves to a:description (the old key is never carried).
    const moved = (valueCardPatch(carried) as Record<string, Record<string, unknown>>).endpoint;
    expect(moved.endpointText).toBeUndefined();
    expect(moved["a:description"]).toBe("kept");
  });

  it("drops the old endpointText key from a rewritten a:endpoint container once a part is typed", () => {
    const data = readValueCard({ endpoint: { endpointText: "Subject = x, reference = y" } });
    data.endpoint.subject = { typeIri: "https://example.test/base/t/AppUser", typeLabel: "AppUser", words: "" };
    const patch = valueCardPatch(data) as Record<string, Record<string, unknown>>;
    expect(patch.endpoint["a:endpointSubject"]).toMatchObject({ "a:label": "AppUser" });
    expect("endpointText" in patch.endpoint).toBe(false);
  });

  it("reads a:endpoint in preference to the older stored endpoint", () => {
    const data = readValueCard({
      endpoint: { endpointText: "new" },
      valueEndpoint: { endpointText: "old" },
    });
    expect(data.endpoint.text).toBe("new");
  });

  it("the part words are a:description; the older part text is still read", () => {
    const iri = "https://example.test/base/t/MobileApp";
    const old = readValueCard({ valueEndpoint: { "a:endpointSubject": { "@id": iri, text: "old words" } } });
    expect(old.endpoint.subject.words).toBe("old words");
    const now = readValueCard({ endpoint: { "a:endpointSubject": { "@id": iri, "a:description": "new words" } } });
    expect(now.endpoint.subject.words).toBe("new words");
    const patch = valueCardPatch(old) as Record<string, Record<string, Record<string, unknown>>>;
    expect(patch.endpoint["a:endpointSubject"]["a:description"]).toBe("old words");
    expect(patch.endpoint["a:endpointSubject"].text).toBeUndefined();
  });

  it("round-trips typed Subject and Reference parts and keeps the old text", () => {
    const iri = "https://example.test/base/t/MobileApp";
    const data = readValueCard({
      valueEndpoint: JSON.stringify({
        endpointText: "Subject = mobile app, reference = AppUser",
        "a:endpointSubject": { "@id": iri, "a:label": "Mobile app", text: "mobile app" },
      }),
    });
    expect(data.endpoint.subject).toEqual({ typeIri: iri, typeLabel: "Mobile app", words: "mobile app" });
    expect(data.endpoint.reference.typeIri).toBe("");
    expect(data.endpoint.text).toBe("Subject = mobile app, reference = AppUser");
    const patch = valueCardPatch(data) as Record<string, Record<string, Record<string, unknown>>>;
    expect(patch.endpoint["a:endpointSubject"]["@id"]).toBe(iri);
    expect(patch.endpoint["a:endpointReference"]).toBeUndefined();
  });

  it("reads a record written before: text kept, both parts empty", () => {
    const data = readValueCard({ valueEndpoint: JSON.stringify({ endpointText: "Subject = x, reference = y" }) });
    expect(data.endpoint.text).toBe("Subject = x, reference = y");
    expect(data.endpoint.subject.typeIri).toBe("");
  });
});

import { latestChange as latestChangeV10 } from "./planValue";
describe("latestChange", () => {
  it("a part newer than the record wins", () => {
    expect(latestChangeV10({ updatedAt: 1000 }, [{ updatedAt: 5000 }, { updatedAt: 2000 }])?.getTime()).toBe(5000);
  });
  it("the record wins when newest", () => {
    expect(latestChangeV10({ updatedAt: 9000 }, [{ updatedAt: 5000 }])?.getTime()).toBe(9000);
  });
  it("none known is null", () => {
    expect(latestChangeV10({}, [{}])).toBeNull();
    expect(latestChangeV10(null, [])).toBeNull();
  });
});

describe("multi-value qualifiers", () => {
  const country: ScaleVariable = {
    name: "Country",
    definition: "",
    defaultOption: "",
    options: [
      { name: "Norway", definition: "" },
      { name: "Sweden", definition: "" },
    ],
    source: {},
  };
  it("parses and formats Country = ALL", () => {
    const l = parseLevelLine("Goal [Country = ALL] 3", [country])!;
    expect(l.qualifier.variables.Country).toBe("ALL");
    expect(formatLevelLine(l, [country])).toBe("Goal [Country = ALL] 3");
    expect(parseLevelLine("Goal [Country = all] 3", [country])!.qualifier.variables.Country).toBe("ALL");
  });
  it("round-trips a set of values", () => {
    const line = "Goal [2027-06-30, Country = {Norway, Sweden}] 3";
    const l = parseLevelLine(line, [country])!;
    expect(l.qualifier.when).toBe("2027-06-30");
    expect(l.qualifier.variables.Country).toEqual(["Norway", "Sweden"]);
    expect(formatLevelLine(l, [country])).toBe(line);
  });
});


describe("levels as records", () => {
  const row = (id: string, type: string, served: Record<string, unknown>): BaseRecord =>
    ({ id, entityUri: `https://h/e/${id}`, typeUri: `t:${type}`, facts: {}, opaqueFacts: [], etag: '"e"', servedKeys: [], served: { facts: served } }) as unknown as BaseRecord;

  it("the tag is <ValueTag>.<Kind>[.<choices>][.<Side>][.<Date>]", () => {
    const l = parseLevelLine("Goal [2027-06-30, User type = Senior 70+] 5", variables)!;
    expect(levelTag("QA-Usability.Learn", l, ["User type"])).toBe("QA-Usability.Learn.Goal.Senior70+.2027-06-30");
    expect(levelTag("V", parseLevelLine("Goal 5")!)).toBe("V.Goal");
    expect(levelTag("V", parseLevelLine("Fail [low] 5")!)).toBe("V.Fail.Low");
    expect(levelTag("V", parseLevelLine("Goal [Country = ALL] 5", [])!)).toBe("V.Goal");
    const two = parseLevelLine("Goal [Country = {Norway, Sweden}] 5")!;
    two.qualifier.variables.Country = ["Norway", "Swe den"];
    expect(levelTag("V", two)).toBe("V.Goal.Norway-Swe" + "den");
    expect(levelTag("V", { ...parseLevelLine("Goal 1")!, kind: "My Budget" })).toBe("V.MyBudget");
    expect(levelTagTry("V.Goal", 1)).toBe("V.Goal");
    expect(levelTagTry("V.Goal", 3)).toBe("V.Goal.3");
  });

  it("creates with the kind as the type facts only, source in lineSources, custom word in a:label", () => {
    const l = parseLevelLine("Goal [2027-06-30, Release 3.0, Side low] 5 <- Ann est", [])!;
    const facts = levelCreateFacts(l, "V.Goal.2027-06-30", "https://h/e/val", 4);
    expect(facts).toMatchObject({
      unitTag: "V.Goal.2027-06-30",
      partOf: { "@id": "https://h/e/val" },
      elementOrder: 4,
      scaleNumber: "5",
      levelWhen: "2027-06-30",
      levelCondition: ["Release 3.0", "Side low"],
      note: "est",
    });
    expect(JSON.stringify(facts.lineSources)).toContain("Ann");
    const custom = levelCreateFacts(parseLevelLine("Budget 3")!, "V.Budget", "https://h/e/val", 1);
    expect(custom.label).toBe("Budget");
  });

  it("reads level records in element order and skips other parts", () => {
    const rows = [
      row("b", "Goal", { scaleNumber: 3, elementOrder: 2 }),
      row("p", "SpecificationElement", { elementOrder: 0 }),
      row("a", "Status", {
        scaleNumber: "9",
        elementOrder: 1,
        levelCondition: ["R1"],
        levelQualifierChoice: [{ "a:name": "Country", "a:qualifierOptions": ["No", "Se"] }, { "a:name": "Task", "a:qualifierOptions": ["ALL"] }, { "a:name": "Region" }],
        levelSide: "high",
      }),
      row("c", "Level", { label: "Budget", scaleNumber: 1, elementOrder: 3 }),
    ];
    const levels = readLevelRecords(rows);
    expect(levels.map((l) => [l.kind, l.value])).toEqual([["Status", 9], ["Goal", 3], ["Budget", 1]]);
    expect(levels[0]!.qualifier).toMatchObject({ conditions: ["R1"], variables: { Country: ["No", "Se"], Task: "ALL", Region: "ALL" }, side: "high" });
    // ALL is written with no a:qualifierOptions.
    expect(levelCreateFacts(levels[0]!, "V.Status", "https://h/e/val", 1).levelQualifierChoice).toEqual([{ "a:name": "Country", "a:qualifierOptions": ["No", "Se"] }, { "a:name": "Task" }, { "a:name": "Region" }]);
    expect(nextLevelOrder(rows)).toBe(4);
  });

  it("read fallback: a level record written under the older keys and type still reads", () => {
    const rows = [
      row("b", "Goal", { measurementValue: 3, elementOrder: 2, qualifierCondition: ["R1"], levelQualifierChoice: { Country: ["No", "Se"], Task: "Order" } }),
      row("c", "PlanguageLevel", { label: "Budget", measurementValue: 1, elementOrder: 3, levelVariables: { Country: "No" } }),
    ];
    const levels = readLevelRecords(rows);
    expect(levels.map((l) => [l.kind, l.value])).toEqual([["Goal", 3], ["Budget", 1]]);
    expect(levels[0]!.qualifier).toMatchObject({ conditions: ["R1"], variables: { Country: ["No", "Se"], Task: "Order" } });
    expect(levels[1]!.qualifier.variables).toEqual({ Country: "No" });
    expect(nextLevelOrder(rows)).toBe(4);
  });

  it("a patch holds only the facts that changed; null removes; nothing changed is empty", () => {
    const r = row("a", "Goal", { scaleNumber: 3, levelWhen: "2027-01-01", note: "x" });
    const l = readLevelRecords([r])[0]!;
    expect(levelPatch(r, l)).toEqual({});
    const patch = levelPatch(r, { ...l, value: 4, note: "", qualifier: { ...l.qualifier } });
    expect(patch).toEqual({ [LEVEL_TERMS.value.slice(2)]: "4", [LEVEL_TERMS.note.slice(2)]: null });
  });

  it("rewrite on edit: a level held under older keys gets the new keys and the old ones nulled, in the same patch", () => {
    const r = row("a", "PlanguageLevel", {
      label: "Budget",
      measurementValue: 3,
      qualifierCondition: ["R1"],
      levelQualifierChoice: { Country: "No" },
      levelSide: "high",
      lineSources: [{ "a:sourceOf": `a:${"measurementValue"}`, "a:source": "Ann" }],
    });
    const l = readLevelRecords([r])[0]!;
    expect(l.source).toEqual({ text: "Ann" });
    expect(levelPatch(r, l)).toEqual({});
    const patch = levelPatch(r, { ...l, note: "est" });
    expect(patch).toMatchObject({
      scaleNumber: "3",
      measurementValue: null,
      levelCondition: ["R1"],
      qualifierCondition: null,
      levelQualifierChoice: [{ "a:name": "Country", "a:qualifierOptions": ["No"] }],
      note: "est",
    });
    const sources = JSON.stringify(patch.lineSources);
    expect(sources).toContain("a:scaleNumber");
    expect(sources).not.toContain("measurementValue");
  });
});
