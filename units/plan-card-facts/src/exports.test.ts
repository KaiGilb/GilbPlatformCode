// Pinning tests: every export has at least one, and the odd cases are pinned as the code does them.
import { describe, expect, it } from "vitest";
import {
  PLAN_SHOWN_FIELDS,
  PLAN_STATUS_WORDS,
  asPlanSource,
  carryLine,
  carryMeter,
  lineOthers,
  localToday,
  memberValue,
  planSourceEmpty,
  planSourceEqual,
  planValueText,
  readConcept,
  readLevelLines,
  readLineSources,
  readMeters,
  rowServedFact,
  sameServedList,
  servedList,
  sourceWithDerivedFrom,
  sourceWithStatedBy,
  sourceWithText,
  withLineOthers,
  writeConcept,
  writeLevelLines,
  writeLineSource,
  writeMeters,
  type PlanConcept,
  type PlanLevelLine,
  type PlanMeterDraft,
  type PlanMeterKind,
  type PlanMeters,
  type PlanSourceValue,
} from "./index";

const A = "https://a.example.test/vault/e/ann";
const B = "https://b.example.test/vault/e/bob";

describe("constants", () => {
  it("PLAN_SHOWN_FIELDS is the six structured lines", () => {
    expect([...PLAN_SHOWN_FIELDS]).toEqual(["stakeholders", "concept", "fvParent", "hasMeter", "levelStatements", "lineSources"]);
    expect(PLAN_SHOWN_FIELDS.has("body")).toBe(false);
  });
  it("PLAN_STATUS_WORDS is the four status words, in order", () => {
    expect([...PLAN_STATUS_WORDS]).toEqual(["Planned", "Developed", "In-Production", "Retired"]);
  });
  it("the types compile for the shapes the functions take", () => {
    const kind: PlanMeterKind = "ai";
    const src: PlanSourceValue = { text: "t" };
    const draft: PlanMeterDraft = { method: "m", source: src };
    const meters: PlanMeters = { human: draft, ai: draft, instrument: draft };
    const line: PlanLevelLine = { status: "Planned", when: "2026-01-01", source: src };
    const concept: PlanConcept = { label: "L", id: "" };
    expect([kind, meters.human.method, line.status, concept.label]).toEqual(["ai", "m", "Planned", "L"]);
  });
});

describe("localToday", () => {
  it("is the local calendar date of the instant it is given, YYYY-MM-DD", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59, 59))).toBe("2026-01-05");
    expect(localToday(new Date(2026, 11, 31, 0, 0, 0))).toBe("2026-12-31");
    expect(localToday(new Date(2026, 2, 9, 0, 30))).toBe("2026-03-09");
  });
  it("reads local fields, not UTC ones", () => {
    const d = new Date(2026, 5, 15, 0, 5);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(localToday(d)).toBe(local);
    // Whatever the machine's zone, an instant just after local midnight is that local day.
    expect(localToday(new Date(2026, 5, 15, 0, 5))).toBe("2026-06-15");
  });
  it("pads month and day to two digits and does not pad the year", () => {
    expect(localToday(new Date(2026, 8, 3))).toBe("2026-09-03");
    const early = new Date(2000, 0, 1);
    early.setFullYear(900);
    expect(localToday(early)).toBe("900-01-01");
  });
  it("defaults to now", () => {
    const before = localToday(new Date());
    const got = localToday();
    const after = localToday(new Date());
    expect([before, after]).toContain(got);
  });
});

describe("memberValue", () => {
  it("a:<name> wins over the bare name", () => {
    expect(memberValue({ "a:x": 1, x: 2 }, "x")).toBe(1);
  });
  it("null and a missing key fall through; an empty string does not", () => {
    expect(memberValue({ "a:x": null, x: 2 }, "x")).toBe(2);
    expect(memberValue({ "a:x": undefined, x: 2 }, "x")).toBe(2);
    expect(memberValue({ "a:x": "", x: "y" }, "x")).toBe("");
    expect(memberValue({ x: null }, "x")).toBeUndefined();
  });
  it("the bare name comes before any full IRI", () => {
    expect(memberValue({ x: "bare", "https://e.example.test/a/x": "iri" }, "x")).toBe("bare");
  });
  it("a full IRI ending /a/<name> is preferred over one ending /<name>, whichever comes first", () => {
    expect(memberValue({ "https://e.example.test/x": "plain", "https://e.example.test/a/x": "typed" }, "x")).toBe("typed");
    expect(memberValue({ "https://e.example.test/a/x": "typed", "https://e.example.test/x": "plain" }, "x")).toBe("typed");
    expect(memberValue({ "https://e.example.test/x": "plain" }, "x")).toBe("plain");
    expect(memberValue({ "http://e.example.test/a/x": "http" }, "x")).toBe("http");
  });
  it("a key that is not a full IRI is not matched by its ending; a null IRI value is skipped", () => {
    expect(memberValue({ "p/x": 1, "/a/x": 2 }, "x")).toBeUndefined();
    expect(memberValue({ "https://e.example.test/a/x": null, "https://e.example.test/x": "plain" }, "x")).toBe("plain");
  });
  it("anything but a plain object is undefined", () => {
    for (const bad of [null, undefined, [], [{ x: 1 }], "x", 3] as never[]) expect(memberValue(bad, "x")).toBeUndefined();
  });
});

describe("servedList", () => {
  it("null, undefined and the empty string are []", () => {
    expect(servedList(null)).toEqual([]);
    expect(servedList(undefined)).toEqual([]);
    expect(servedList("")).toEqual([]);
    expect(servedList("   ")).toEqual([]);
  });
  it("an array contributes its object members (including an @id link); non-objects and nested arrays are dropped", () => {
    expect(servedList([{ a: 1 }, "x", 3, null, [1], { "@id": A }, { "@value": "v" }])).toEqual([{ a: 1 }, { "@id": A }, { "@value": "v" }]);
  });
  it("one plain object is [raw]; a lone @id link, a lone @value object and scalars are []", () => {
    expect(servedList({ a: 1 })).toEqual([{ a: 1 }]);
    expect(servedList({ "@id": A })).toEqual([]);
    expect(servedList({ "@value": "x" })).toEqual([]);
    expect(servedList(3)).toEqual([]);
    expect(servedList(true)).toEqual([]);
    expect(servedList({ "@id": A, x: 1 })).toEqual([{ "@id": A, x: 1 }]);
  });
  it("a JSON string of either is the same; junk and a bare word are []", () => {
    expect(servedList('[{"a":1},{"b":2}]')).toEqual([{ a: 1 }, { b: 2 }]);
    expect(servedList(' {"a":1} ')).toEqual([{ a: 1 }]);
    expect(servedList('{"@id":"x"}')).toEqual([]);
    expect(servedList("{bad")).toEqual([]);
    expect(servedList("abc")).toEqual([]);
    expect(servedList('"[1]"')).toEqual([]);
  });
  it("returns the members themselves, not copies", () => {
    const m = { a: 1 };
    expect(servedList([m])[0]).toBe(m);
  });
});

describe("sameServedList", () => {
  it("a:, bare and full-IRI spellings of the same content are the same", () => {
    expect(sameServedList([{ "a:status": "Planned" }], [{ status: "Planned" }])).toBe(true);
    expect(sameServedList([{ "a:status": "Planned" }], [{ "https://e.example.test/a/status": "Planned" }])).toBe(true);
    expect(sameServedList([{ status: "Planned" }], [{ "https://e.example.test/status": "Planned" }])).toBe(true);
  });
  it("one object and a one-member array match; a JSON string matches its value", () => {
    expect(sameServedList({ status: "Planned" }, [{ status: "Planned" }])).toBe(true);
    expect(sameServedList(JSON.stringify([{ status: "Planned" }]), { "a:status": "Planned" })).toBe(true);
  });
  it("key order does not matter, member order does", () => {
    expect(sameServedList([{ a: 1, b: 2 }], [{ b: 2, a: 1 }])).toBe(true);
    expect(sameServedList([{ a: 1 }, { b: 2 }], [{ b: 2 }, { a: 1 }])).toBe(false);
  });
  it("null values are ignored; different content or length is different", () => {
    expect(sameServedList([{ a: 1, b: null }], [{ a: 1 }])).toBe(true);
    expect(sameServedList([{ a: 1 }], [{ a: 2 }])).toBe(false);
    expect(sameServedList([{ a: 1 }], [{ a: 1 }, { a: 1 }])).toBe(false);
  });
  it("when a: and bare both name a key, the a: one is the content", () => {
    expect(sameServedList([{ "a:x": 1, x: 2 }], [{ x: 1 }])).toBe(true);
  });
  it("nested members are compared the same way", () => {
    expect(sameServedList([{ s: { "a:t": 1 } }], [{ s: { t: 1 } }])).toBe(true);
  });
  it("two junk values are both the empty list, so they are the same", () => {
    expect(sameServedList(null, "nope")).toBe(true);
    expect(sameServedList(null, [{ a: 1 }])).toBe(false);
  });
});

describe("rowServedFact", () => {
  it("a served fact wins over the flat map, including a served null", () => {
    expect(rowServedFact({ served: { facts: { x: "served" } }, facts: { x: "flat" } }, "x")).toBe("served");
    expect(rowServedFact({ served: { facts: { x: null } }, facts: { x: "flat" } }, "x")).toBeNull();
  });
  it("a served a:<name> or full-IRI key is found by memberValue", () => {
    expect(rowServedFact({ served: { facts: { "a:x": "p" } }, facts: { x: "flat" } }, "x")).toBe("p");
    expect(rowServedFact({ served: { facts: { "https://e.example.test/a/x": "i" } } }, "x")).toBe("i");
  });
  it("falls to the flat map when the served facts do not have it", () => {
    expect(rowServedFact({ served: { facts: { y: 1 } }, facts: { x: "flat" } }, "x")).toBe("flat");
    expect(rowServedFact({ facts: { x: "flat" } }, "x")).toBe("flat");
    expect(rowServedFact({ facts: { "a:x": "p" } }, "x")).toBe("p");
    expect(rowServedFact({ served: null, facts: { x: "" } }, "x")).toBe("");
  });
  it("undefined when neither has it", () => {
    expect(rowServedFact({}, "x")).toBeUndefined();
    expect(rowServedFact({ served: { facts: {} }, facts: null }, "x")).toBeUndefined();
    expect(rowServedFact({ served: { facts: { x: undefined } } }, "x")).toBeUndefined();
  });
});

describe("source values", () => {
  it("asPlanSource: a string is the words; an object is trimmed to its three keys; anything else is empty", () => {
    expect(asPlanSource("  words ")).toEqual({ text: "words" });
    expect(asPlanSource("   ")).toEqual({});
    expect(asPlanSource({ text: " t ", statedBy: ` ${A} `, derivedFrom: ` ${B}`, junk: 1 })).toEqual({ text: "t", statedBy: A, derivedFrom: B });
    expect(asPlanSource({ text: " ", statedBy: "", derivedFrom: 3 })).toEqual({});
    expect(asPlanSource({ statedBy: { "@id": A } })).toEqual({});
    for (const bad of [null, undefined, 3, true, [], ["x"]] as never[]) expect(asPlanSource(bad)).toEqual({});
  });
  it("asPlanSource writes its keys in the order text, statedBy, derivedFrom", () => {
    expect(Object.keys(asPlanSource({ derivedFrom: "d", statedBy: "s", text: "t" }))).toEqual(["text", "statedBy", "derivedFrom"]);
  });
  it("planSourceEmpty", () => {
    expect(planSourceEmpty({})).toBe(true);
    expect(planSourceEmpty("")).toBe(true);
    expect(planSourceEmpty("  ")).toBe(true);
    expect(planSourceEmpty(null)).toBe(true);
    expect(planSourceEmpty(undefined)).toBe(true);
    expect(planSourceEmpty({ text: " ", statedBy: " " })).toBe(true);
    expect(planSourceEmpty("words")).toBe(false);
    expect(planSourceEmpty({ statedBy: A })).toBe(false);
    expect(planSourceEmpty({ derivedFrom: B })).toBe(false);
  });
  it("planSourceEqual compares the normalised sources", () => {
    expect(planSourceEqual("t", { text: "t" })).toBe(true);
    expect(planSourceEqual({ text: " t " }, { text: "t" })).toBe(true);
    expect(planSourceEqual({ derivedFrom: B, text: "t" }, { text: "t", derivedFrom: B })).toBe(true);
    expect(planSourceEqual(null, {})).toBe(true);
    expect(planSourceEqual({ text: "t", junk: 1 }, { text: "t" })).toBe(true);
    expect(planSourceEqual({ text: "t" }, { text: "u" })).toBe(false);
    expect(planSourceEqual({ statedBy: A }, { derivedFrom: A })).toBe(false);
  });
  it("sourceWithText sets the words and keeps the links; an empty string clears the words only", () => {
    expect(sourceWithText({ text: "old", statedBy: A, derivedFrom: B }, " new ")).toEqual({ statedBy: A, derivedFrom: B, text: "new" });
    expect(JSON.stringify(sourceWithText({ text: "a", statedBy: "s", derivedFrom: "d" }, "b"))).toBe('{"statedBy":"s","derivedFrom":"d","text":"b"}');
    expect(sourceWithText({ text: "old", statedBy: A }, "")).toEqual({ statedBy: A });
    expect(sourceWithText("old", "new")).toEqual({ text: "new" });
    expect(sourceWithText("old", "  ")).toEqual({});
    expect(sourceWithText(null, "x")).toEqual({ text: "x" });
    expect(sourceWithText(undefined, "")).toEqual({});
  });
  it("sourceWithStatedBy drops the words, keeps derivedFrom, and an empty uri clears the link", () => {
    expect(sourceWithStatedBy({ text: "t", statedBy: A, derivedFrom: B }, ` ${B} `)).toEqual({ derivedFrom: B, statedBy: B });
    expect(JSON.stringify(sourceWithStatedBy({ derivedFrom: "d" }, "s"))).toBe('{"derivedFrom":"d","statedBy":"s"}');
    expect(sourceWithStatedBy({ text: "t", statedBy: A, derivedFrom: B }, "")).toEqual({ derivedFrom: B });
    expect(sourceWithStatedBy("words", A)).toEqual({ statedBy: A });
    expect(sourceWithStatedBy(null, "  ")).toEqual({});
  });
  it("sourceWithDerivedFrom keeps the person and the words, and an empty uri clears the link", () => {
    expect(sourceWithDerivedFrom({ text: "t", statedBy: A }, B)).toEqual({ statedBy: A, derivedFrom: B, text: "t" });
    expect(JSON.stringify(sourceWithDerivedFrom({ text: "t", statedBy: "s" }, "d"))).toBe('{"statedBy":"s","derivedFrom":"d","text":"t"}');
    expect(sourceWithDerivedFrom({ text: "t", statedBy: A, derivedFrom: B }, " ")).toEqual({ statedBy: A, text: "t" });
    expect(sourceWithDerivedFrom("words", B)).toEqual({ derivedFrom: B, text: "words" });
  });
});

describe("the hidden raw (carryMeter, carryLine)", () => {
  const raw = { "a:meterAgentKind": "human", "a:method": "m", "a:detail": "kept" };
  it("carryMeter hides the previous draft's raw on the next one, as a property that is not enumerable", () => {
    const prev = readMeters([raw]).human;
    const next = carryMeter({ method: "changed", source: {} }, prev);
    expect(Object.keys(next)).toEqual(["method", "source"]);
    expect(JSON.stringify(next)).toBe('{"method":"changed","source":{}}');
    expect(JSON.stringify(next)).not.toContain("raw");
    expect((next as PlanMeterDraft).raw).toEqual(raw);
    const d = Object.getOwnPropertyDescriptor(next, "raw")!;
    expect(d.enumerable).toBe(false);
    expect(d.writable).toBe(true);
    expect(d.configurable).toBe(true);
  });
  it("carryLine does the same for a status line", () => {
    const prev = readLevelLines([{ "a:status": "Planned", "a:statusWhen": "2026-01-01", "a:detail": "kept" }]).status!;
    const next = carryLine({ status: "Developed", when: "2026-02-02", source: {} }, prev);
    expect(Object.keys(next)).toEqual(["status", "when", "source"]);
    expect(JSON.stringify(next)).not.toContain("raw");
    expect((next as PlanLevelLine).raw).toEqual({ "a:status": "Planned", "a:statusWhen": "2026-01-01", "a:detail": "kept" });
    expect(Object.getOwnPropertyDescriptor(next, "raw")!.enumerable).toBe(false);
  });
  it("returns the same object it was given", () => {
    const next: PlanMeterDraft = { method: "", source: {} };
    expect(carryMeter(next, readMeters([raw]).human)).toBe(next);
    const line: PlanLevelLine = { status: "", when: "", source: {} };
    expect(carryLine(line, null)).toBe(line);
  });
  it("the carried raw is the same object, not a copy", () => {
    const prev = readMeters([raw]).human;
    const next = carryMeter({ method: "", source: {} }, prev);
    expect((next as PlanMeterDraft).raw).toBe(prev.raw);
  });
  it("does nothing when there is no previous raw, or the next already has one", () => {
    const a = carryMeter({ method: "m", source: {} }, null);
    expect(Object.getOwnPropertyDescriptor(a, "raw")).toBeUndefined();
    const b = carryMeter({ method: "m", source: {} }, undefined);
    expect(Object.getOwnPropertyDescriptor(b, "raw")).toBeUndefined();
    const c = carryMeter({ method: "m", source: {} }, { method: "x", source: {} });
    expect(Object.getOwnPropertyDescriptor(c, "raw")).toBeUndefined();
    const own = { method: "m", source: {}, raw: { mine: 1 } };
    const d = carryMeter(own, readMeters([raw]).human);
    expect(d.raw).toEqual({ mine: 1 });
    expect(Object.getOwnPropertyDescriptor(d, "raw")!.enumerable).toBe(true);
  });
  it("a previous raw that is not a plain object is ignored", () => {
    for (const bad of ["x", 3, [1], null] as unknown[]) {
      const next = carryMeter({ method: "", source: {} }, { method: "", source: {}, raw: bad } as never);
      expect(Object.getOwnPropertyDescriptor(next, "raw")).toBeUndefined();
    }
  });
  it("the hidden raw does not survive a spread, JSON, or structured clone", () => {
    const prev = readMeters([raw]).human;
    expect(prev.raw).toEqual(raw);
    expect({ ...prev }.raw).toBeUndefined();
    expect(JSON.parse(JSON.stringify(prev)).raw).toBeUndefined();
    expect((structuredClone(prev) as PlanMeterDraft).raw).toBeUndefined();
    const line = readLevelLines([{ "a:status": "Planned", "a:statusWhen": "2026-01-01" }]).status!;
    expect(line.raw).toBeDefined();
    expect(Object.keys(line)).toEqual(["status", "when", "source"]);
    expect(JSON.stringify(line)).not.toContain("raw");
    expect(structuredClone(line).raw).toBeUndefined();
    expect({ ...line }.raw).toBeUndefined();
  });
});

describe("lineOthers and withLineOthers", () => {
  it("lineOthers: null, undefined and an array with no others are []", () => {
    expect(lineOthers(null)).toEqual([]);
    expect(lineOthers(undefined)).toEqual([]);
    expect(lineOthers([])).toEqual([]);
    const lines = [] as PlanLevelLine[];
    (lines as unknown as { others: unknown }).others = "not a list";
    expect(lineOthers(lines)).toEqual([]);
  });
  it("lineOthers returns a copy of the list that rides on the array", () => {
    const others = [{ x: 1 }];
    const lines = withLineOthers([] as PlanLevelLine[], others);
    const got = lineOthers(lines);
    expect(got).toEqual([{ x: 1 }]);
    expect(got).not.toBe(others);
    expect(got).not.toBe(lineOthers(lines));
  });
  it("withLineOthers: an empty list leaves the array untouched", () => {
    const lines = [] as PlanLevelLine[];
    expect(withLineOthers(lines, [])).toBe(lines);
    expect("others" in lines).toBe(false);
  });
  it("withLineOthers: sets an enumerable, writable `others` copy on the array and returns the same array", () => {
    const lines = [{ status: "Planned", when: "2026-01-01", source: {} }] as PlanLevelLine[];
    const others = [{ x: 1 }];
    const out = withLineOthers(lines, others);
    expect(out).toBe(lines);
    expect((out as unknown as { others: unknown[] }).others).toEqual([{ x: 1 }]);
    expect((out as unknown as { others: unknown[] }).others).not.toBe(others);
    const d = Object.getOwnPropertyDescriptor(out, "others")!;
    expect(d.enumerable).toBe(true);
    expect(d.writable).toBe(true);
    expect(Object.keys(out)).toEqual(["0", "others"]);
    expect(JSON.stringify(out)).not.toContain("others");
  });
  it("readLevelLines' others and withLineOthers make writeLevelLines return them last", () => {
    const stored = [{ "a:note": "not a status line" }, { "a:status": "Planned", "a:statusWhen": "2026-01-01" }];
    const read = readLevelLines(stored);
    const lines = withLineOthers([read.status!, ...read.past], read.others ?? []);
    expect(writeLevelLines(lines)).toEqual([stored[1], stored[0]]);
  });
});

describe("readLineSources and writeLineSource", () => {
  it("skips a member with no sourceOf, an empty source, and a blank key; a later duplicate wins", () => {
    expect(
      readLineSources([
        { "a:source": "orphan" },
        { "a:sourceOf": "a:x" },
        { "a:sourceOf": "  ", "a:source": "blank" },
        { "a:sourceOf": "y", "a:source": "bare key" },
        { "a:sourceOf": "a:z", "a:source": "first" },
        { "a:sourceOf": "a:z", "a:source": "second" },
      ]),
    ).toEqual({ "a:y": { text: "bare key" }, "a:z": { text: "second" } });
  });
  it("reads statedBy and derivedFrom as links, in a:, bare and full-IRI spellings", () => {
    expect(
      readLineSources([
        { "a:sourceOf": "a:x", "a:statedBy": { "@id": A }, "a:derivedFrom": B },
        { sourceOf: "a:y", statedBy: A },
        { "https://e.example.test/a/sourceOf": "a:w", "https://e.example.test/a/derivedFrom": { "@id": B } },
      ]),
    ).toEqual({ "a:x": { statedBy: A, derivedFrom: B }, "a:y": { statedBy: A }, "a:w": { derivedFrom: B } });
  });
  it("a link that is not an http(s) or urn address is dropped", () => {
    expect(readLineSources([{ "a:sourceOf": "a:x", "a:statedBy": "just a name" }])).toEqual({});
    expect(readLineSources([{ "a:sourceOf": "a:x", "a:statedBy": "urn:example:1" }])).toEqual({ "a:x": { statedBy: "urn:example:1" } });
  });
  it("writeLineSource with nothing stored makes the one member; the key is spelled a:", () => {
    expect(writeLineSource(null, "a:x", "hello")).toEqual([{ "a:sourceOf": "a:x", "a:source": "hello" }]);
    expect(writeLineSource(undefined, "x", "hello")).toEqual([{ "a:sourceOf": "a:x", "a:source": "hello" }]);
    expect(writeLineSource(null, " x ", { text: "t", statedBy: A, derivedFrom: B })).toEqual([
      { "a:sourceOf": "a:x", "a:source": "t", "a:statedBy": { "@id": A }, "a:derivedFrom": { "@id": B } },
    ]);
  });
  it("a blank key or an empty value adds no member", () => {
    expect(writeLineSource(null, "", "hello")).toEqual([]);
    expect(writeLineSource(null, "  ", "hello")).toEqual([]);
    expect(writeLineSource(null, "a:x", "")).toEqual([]);
    expect(writeLineSource(null, "a:x", {})).toEqual([]);
  });
  it("a lone @id link or a junk string is the empty list", () => {
    expect(writeLineSource({ "@id": A }, "a:x", "t")).toEqual([{ "a:sourceOf": "a:x", "a:source": "t" }]);
    expect(writeLineSource("{bad", "a:x", "t")).toEqual([{ "a:sourceOf": "a:x", "a:source": "t" }]);
  });
  it("members for other keys are copies, not the served objects; bare keys are spelled a:", () => {
    const served = [{ sourceOf: "a:body", source: "x", "@id": "n1" }];
    const out = writeLineSource(served, "a:level", "y") as Record<string, unknown>[];
    expect(out[0]).toEqual({ "a:sourceOf": "a:body", "a:source": "x", "@id": "n1" });
    expect(out[0]).not.toBe(served[0]);
    expect(out[1]).toEqual({ "a:sourceOf": "a:level", "a:source": "y" });
  });
  it("a member with no sourceOf, and a non-object item, are copied as served", () => {
    const out = writeLineSource([{ foo: 1 }, "junk", 3, { "a:sourceOf": "a:x", "a:source": "t" }], "a:x", "u");
    expect(out).toEqual([{ foo: 1 }, "junk", 3, { "a:sourceOf": "a:x", "a:source": "u" }]);
  });
  it("setting the value that is already there returns the served member whole, unknown fields included", () => {
    const m = { "a:sourceOf": "a:x", "a:source": "t", "a:detail": "d", other: 1 };
    expect(writeLineSource([m], "a:x", "t")).toEqual([m]);
    expect(writeLineSource([m], "x", { text: "t" })).toEqual([m]);
  });
  it("an edit keeps the member's unknown fields; clearing keeps the member only when an unknown field is on it", () => {
    const m = { "a:sourceOf": "a:x", "a:source": "t", "a:detail": "d" };
    expect(writeLineSource([m], "a:x", "u")).toEqual([{ "a:sourceOf": "a:x", "a:source": "u", "a:detail": "d" }]);
    expect(writeLineSource([m], "a:x", "")).toEqual([{ "a:sourceOf": "a:x", "a:detail": "d" }]);
    expect(writeLineSource([{ "a:sourceOf": "a:x", "a:source": "t" }], "a:x", "")).toEqual([]);
  });
  it("a string value on a member with a link keeps the link; a link-only value drops the words but keeps the other link", () => {
    expect(writeLineSource([{ "a:sourceOf": "a:x", "a:statedBy": { "@id": A } }], "a:x", "words")).toEqual([
      { "a:sourceOf": "a:x", "a:source": "words", "a:statedBy": { "@id": A } },
    ]);
    expect(writeLineSource([{ "a:sourceOf": "a:x", "a:source": "words", "a:derivedFrom": { "@id": B } }], "a:x", { statedBy: A })).toEqual([
      { "a:sourceOf": "a:x", "a:statedBy": { "@id": A }, "a:derivedFrom": { "@id": B } },
    ]);
  });
  it("{ text: '' } clears the words and keeps the links", () => {
    expect(writeLineSource([{ "a:sourceOf": "a:x", "a:source": "t", "a:statedBy": { "@id": A } }], "a:x", { text: "" })).toEqual([
      { "a:sourceOf": "a:x", "a:statedBy": { "@id": A } },
    ]);
  });
  it("an object value with none of the three keys removes the member", () => {
    expect(writeLineSource([{ "a:sourceOf": "a:x", "a:source": "t" }], "a:x", { junk: 1 } as never)).toEqual([]);
  });
});

describe("readMeters and writeMeters", () => {
  const BLANK = { method: "", source: {} };
  it("a missing kind is empty; the kind word is case-insensitive and trimmed", () => {
    const m = readMeters([{ "a:meterAgentKind": " AI ", "a:method": "scan" }]);
    expect(m.ai.method).toBe("scan");
    expect(m.human).toEqual(BLANK);
    expect(m.instrument).toEqual(BLANK);
    expect(m.others).toBeUndefined();
  });
  it("unknown kinds, a member with no kind, and non-object items go to others, in served order", () => {
    const m = readMeters([{ "a:meterAgentKind": "sensor", "a:method": "s" }, "junk", { "a:method": "no kind" }, 4]);
    expect(m.others).toEqual([{ "a:meterAgentKind": "sensor", "a:method": "s" }, "junk", { "a:method": "no kind" }, 4]);
  });
  it("a second member of a known kind goes to others; the first stays", () => {
    const m = readMeters([
      { "a:meterAgentKind": "human", "a:method": "first" },
      { "a:meterAgentKind": "human", "a:method": "second" },
    ]);
    expect(m.human.method).toBe("first");
    expect(m.others).toEqual([{ "a:meterAgentKind": "human", "a:method": "second" }]);
    expect(writeMeters(m)).toEqual([
      { "a:meterAgentKind": "human", "a:method": "first" },
      { "a:meterAgentKind": "human", "a:method": "second" },
    ]);
  });
  it("reads the method and source from a:, bare and IRI spellings; a method that is not a string is empty", () => {
    expect(readMeters([{ meterAgentKind: "human", method: "bare", statedBy: { "@id": A } }]).human).toEqual({ method: "bare", source: { statedBy: A } });
    expect(readMeters([{ "a:meterAgentKind": "ai", "a:method": 3 }]).ai.method).toBe("");
  });
  it("a lone @id link or @value object is no meter", () => {
    expect(readMeters({ "@id": A })).toEqual({ human: BLANK, ai: BLANK, instrument: BLANK });
    expect(readMeters({ "@value": "x" })).toEqual({ human: BLANK, ai: BLANK, instrument: BLANK });
  });
  it("each draft carries its served member as a hidden raw, a clone", () => {
    const stored = { "a:meterAgentKind": "human", "a:method": "m", "a:detail": "d" };
    const draft = readMeters([stored]).human;
    expect(draft.raw).toEqual(stored);
    expect(draft.raw).not.toBe(stored);
    expect(Object.keys(draft)).toEqual(["method", "source"]);
  });
  it("an untouched draft writes its served member back whole, spelling and unknown keys included", () => {
    const stored = [{ meterAgentKind: "human", method: "m", detail: "d" }];
    expect(writeMeters(readMeters(stored))).toEqual(stored);
  });
  it("an edited draft (carried) keeps unknown keys and rewrites the owned ones as a:", () => {
    const m = readMeters([{ meterAgentKind: "human", method: "old", note: "n" }]);
    m.human = carryMeter({ ...m.human, method: " new " }, m.human);
    expect(writeMeters(m)).toEqual([{ note: "n", "a:meterAgentKind": "human", "a:method": "new" }]);
  });
  it("an edited draft that lost its raw (a plain spread) writes only what the draft holds", () => {
    const m = readMeters([{ "a:meterAgentKind": "human", "a:method": "old", "a:note": "n" }]);
    const edited: PlanMeters = { ...m, human: { ...m.human, method: "new" } };
    expect(writeMeters(edited)).toEqual([{ "a:meterAgentKind": "human", "a:method": "new" }]);
  });
  it("clearing a carried draft removes the member unless an unknown key is on it", () => {
    const m = readMeters([{ "a:meterAgentKind": "human", "a:method": "old", "a:note": "n" }]);
    m.human = carryMeter({ method: "", source: {} }, m.human);
    expect(writeMeters(m)).toEqual([{ "a:note": "n", "a:meterAgentKind": "human" }]);
    const bare = readMeters([{ "a:meterAgentKind": "human", "a:method": "old" }]);
    bare.human = carryMeter({ method: "", source: {} }, bare.human);
    expect(writeMeters(bare)).toEqual([]);
  });
  it("a new draft: trimmed method, source facts, kind order human, ai, instrument; empty drafts are omitted", () => {
    const out = writeMeters({
      human: BLANK,
      ai: { method: "  scan ", source: { text: "t" } },
      instrument: { method: "", source: { derivedFrom: B } },
    });
    expect(out).toEqual([
      { "a:meterAgentKind": "ai", "a:method": "scan", "a:source": "t" },
      { "a:meterAgentKind": "instrument", "a:derivedFrom": { "@id": B } },
    ]);
    expect(writeMeters({ human: BLANK, ai: BLANK, instrument: BLANK })).toEqual([]);
  });
  it("others are appended after the known kinds, as copies", () => {
    const other = { "a:meterAgentKind": "sensor" };
    const m: PlanMeters = { human: { method: "h", source: {} }, ai: BLANK, instrument: BLANK, others: [other] };
    const out = writeMeters(m);
    expect(out).toEqual([{ "a:meterAgentKind": "human", "a:method": "h" }, other]);
    expect(out[1]).not.toBe(other);
  });
  it("a missing meters value or a missing kind writes nothing", () => {
    expect(writeMeters(undefined as never)).toEqual([]);
    expect(writeMeters({} as never)).toEqual([]);
  });
  it("junk reads as three empty kinds", () => {
    for (const junk of [null, undefined, 3, "x", "{", []]) expect(readMeters(junk)).toEqual({ human: BLANK, ai: BLANK, instrument: BLANK });
  });
});

describe("readLevelLines and writeLevelLines", () => {
  it("the latest date is Status, the rest are Past newest first; the date is cut to ten characters; the status word is trimmed", () => {
    const read = readLevelLines([
      { "a:status": " Planned ", "a:statusWhen": "2026-01-01T09:30:00Z" },
      { "a:status": "Developed", "a:statusWhen": "2026-05-05" },
      { "a:status": "Retired", "a:statusWhen": "2025-01-01" },
    ]);
    expect(read.status).toEqual({ status: "Developed", when: "2026-05-05", source: {} });
    expect(read.past.map((l) => l.when)).toEqual(["2026-01-01", "2025-01-01"]);
    expect(read.past[0]!.status).toBe("Planned");
  });
  it("a member with neither a date nor a status goes to others, with non-objects; others is absent when there are none", () => {
    const read = readLevelLines([{ "a:note": "x" }, "junk", { "a:status": "Planned" }]);
    expect(read.others).toEqual([{ "a:note": "x" }, "junk"]);
    expect(read.status).toEqual({ status: "Planned", when: "", source: {} });
    expect("others" in readLevelLines([{ "a:status": "Planned" }])).toBe(false);
  });
  it("a line with a date and no status, or a status and no date, is a line", () => {
    expect(readLevelLines([{ "a:statusWhen": "2026-01-01" }]).status).toEqual({ status: "", when: "2026-01-01", source: {} });
  });
  it("nothing stored is no Status and no Past", () => {
    expect(readLevelLines([])).toEqual({ status: null, past: [] });
    expect(readLevelLines({ "@id": A })).toEqual({ status: null, past: [] });
  });
  it("each line carries its served member as a hidden raw", () => {
    const stored = { "a:status": "Planned", "a:statusWhen": "2026-01-01", "a:detail": "d" };
    const line = readLevelLines([stored]).status!;
    expect(line.raw).toEqual(stored);
    expect(line.raw).not.toBe(stored);
    expect(Object.keys(line)).toEqual(["status", "when", "source"]);
  });
  it("an untouched line writes its member back whole, a time of day included", () => {
    const stored = [{ status: "Planned", statusWhen: "2026-01-01T09:30:00Z", detail: "d" }];
    expect(writeLevelLines(readLevelLines(stored).status ? [readLevelLines(stored).status!] : [])).toEqual(stored);
  });
  it("an edited carried line keeps unknown keys and writes the owned ones as a:", () => {
    const read = readLevelLines([{ status: "Planned", statusWhen: "2026-01-01", detail: "d" }]);
    const edited = carryLine({ ...read.status!, status: "Developed" }, read.status);
    expect(writeLevelLines([edited])).toEqual([{ detail: "d", "a:status": "Developed", "a:statusWhen": "2026-01-01" }]);
  });
  it("a new line: trimmed, with its source facts; an empty one is omitted; the list is stored oldest first", () => {
    expect(
      writeLevelLines([
        { status: " Developed ", when: " 2026-05-05 ", source: { statedBy: A } },
        { status: "", when: "", source: {} },
        { status: "Planned", when: "", source: {} },
        { status: "", when: "2025-01-01", source: { text: "t" } },
      ]),
    ).toEqual([
      { "a:statusWhen": "2025-01-01", "a:source": "t" },
      { "a:status": "Planned" },
      { "a:status": "Developed", "a:statusWhen": "2026-05-05", "a:statedBy": { "@id": A } },
    ]);
  });
  it("a missing line value writes nothing; junk reads as no lines", () => {
    expect(writeLevelLines([undefined as never])).toEqual([]);
    for (const junk of [null, 3, "x", "{"]) expect(readLevelLines(junk)).toEqual({ status: null, past: [] });
  });
});

describe("readConcept and writeConcept", () => {
  it("reads the label and the @id from an object, a:label or bare label, or a JSON string of it", () => {
    expect(readConcept({ "a:label": "Door", "@id": "https://e.example.test/base/t/Door" })).toEqual({ label: "Door", id: "https://e.example.test/base/t/Door" });
    expect(readConcept({ label: "Door" })).toEqual({ label: "Door", id: "" });
    expect(readConcept(JSON.stringify({ "a:label": "Door", "@id": "x" }))).toEqual({ label: "Door", id: "x" });
  });
  it("junk, an array, a plain word and non-string parts are the empty concept", () => {
    for (const junk of [null, undefined, 3, "word", "{", [], [{ label: "x" }], '["x"]']) expect(readConcept(junk)).toEqual({ label: "", id: "" });
    expect(readConcept({ "a:label": 3, "@id": 4 })).toEqual({ label: "", id: "" });
  });
  it("the label is not trimmed on read", () => {
    expect(readConcept({ "a:label": "  Door " }).label).toBe("  Door ");
  });
  it("writeConcept: label and id trimmed; @id only when given; null when both are empty; never a source", () => {
    expect(writeConcept({ label: " Door ", id: " https://e.example.test/t/Door " })).toEqual({ "a:label": "Door", "@id": "https://e.example.test/t/Door" });
    expect(writeConcept({ label: "", id: "x" })).toEqual({ "@id": "x" });
    expect(writeConcept({ label: "Door", id: "" })).toEqual({ "a:label": "Door" });
    expect(writeConcept({ label: " ", id: " " })).toBeNull();
    expect(writeConcept(undefined as never)).toBeNull();
    expect(writeConcept({ label: "Door", id: "" })).not.toHaveProperty("a:source");
  });
});

describe("planValueText", () => {
  it("an unknown field: a string as it is, anything else and empty as a dash", () => {
    expect(planValueText("body", "words")).toBe("words");
    expect(planValueText("body", "")).toBe("—");
    expect(planValueText("body", null)).toBe("—");
    expect(planValueText("body", undefined)).toBe("—");
    expect(planValueText("body", 3)).toBe("—");
    expect(planValueText("body", { a: 1 })).toBe("—");
    expect(planValueText("body", "  spaced ")).toBe("  spaced ");
  });
  it("stakeholders: the unit tag, else the label, else the tag, else the end of the @id; joined with a comma", () => {
    const list = [
      { "a:unitTag": "Owner.Ann" },
      { "a:label": "Bob" },
      { tag: "T1" },
      { "@id": "https://e.example.test/vault/e/p9" },
      { "@id": "https://e.example.test/vault/e/" },
      "plain",
      "  ",
      {},
      3,
    ];
    expect(planValueText("stakeholders", list)).toBe("Owner.Ann, Bob, T1, p9, https://e.example.test/vault/e/, plain");
  });
  it("stakeholders: one object, a plain string, and nothing", () => {
    expect(planValueText("stakeholders", { "a:unitTag": "Owner.Ann" })).toBe("Owner.Ann");
    expect(planValueText("stakeholders", "  Ann ")).toBe("Ann");
    expect(planValueText("stakeholders", "   ")).toBe("—");
    expect(planValueText("stakeholders", [])).toBe("—");
    expect(planValueText("stakeholders", null)).toBe("—");
    expect(planValueText("stakeholders", 3)).toBe("—");
    expect(planValueText("stakeholders", '["a","b"]')).toBe("a, b");
  });
  it("concept: the label of an object; a dash for anything else", () => {
    expect(planValueText("concept", { "a:label": " Door " })).toBe("Door");
    expect(planValueText("concept", { label: "" })).toBe("—");
    expect(planValueText("concept", [{ label: "x" }])).toBe("—");
    expect(planValueText("concept", "Door")).toBe("—");
    expect(planValueText("concept", null)).toBe("—");
  });
  it("fvParent: the end of a link, as an @id object or a string", () => {
    expect(planValueText("fvParent", { "@id": "https://e.example.test/e/parent" })).toBe("parent");
    expect(planValueText("fvParent", "https://e.example.test/e/parent")).toBe("parent");
    expect(planValueText("fvParent", "parent")).toBe("parent");
    expect(planValueText("fvParent", "  ")).toBe("—");
    expect(planValueText("fvParent", [{ "@id": "x" }])).toBe("—");
    expect(planValueText("fvParent", {})).toBe("—");
    expect(planValueText("fvParent", { "@id": "https://e.example.test/e/" })).toBe("https://e.example.test/e/");
  });
  it("hasMeter: one line per known kind, in served order; no method leaves the colon; unknown kinds are skipped", () => {
    const list = [
      { "a:meterAgentKind": "Instrument", "a:method": "probe" },
      { "a:meterAgentKind": "sensor", "a:method": "skipped" },
      { "a:meterAgentKind": "ai" },
      { "a:meterAgentKind": "human", "a:method": "  " },
      { "a:method": "no kind" },
    ];
    expect(planValueText("hasMeter", list)).toBe("Instrument: probe\nAiAgent:\nHumanAgent:");
    expect(planValueText("hasMeter", [{ "a:meterAgentKind": "sensor" }])).toBe("—");
    expect(planValueText("hasMeter", [])).toBe("—");
  });
  it("levelStatements: newest first, Status then Past, the date cut to ten characters, the word trimmed", () => {
    const list = [
      { "a:status": "Planned", "a:statusWhen": "2026-01-02" },
      { "a:status": " Developed ", "a:statusWhen": "2026-10-09T08:00:00Z" },
      { "a:statusWhen": "2025-05-05" },
      { "a:status": "NoDate" },
    ];
    expect(planValueText("levelStatements", list)).toBe(
      "Status [2026-10-09] Developed\nPast [2026-01-02] Planned\nPast [2025-05-05] \nPast [] NoDate",
    );
    expect(planValueText("levelStatements", [])).toBe("—");
  });
  it("lineSources: a count of members", () => {
    expect(planValueText("lineSources", [])).toBe("—");
    expect(planValueText("lineSources", [{}])).toBe("1 source");
    expect(planValueText("lineSources", [{}, {}])).toBe("2 sources");
    expect(planValueText("lineSources", { "a:sourceOf": "a:x" })).toBe("1 source");
    expect(planValueText("lineSources", null)).toBe("—");
  });
});
