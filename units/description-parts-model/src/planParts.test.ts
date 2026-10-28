// The small readers and rules of planParts: the clock stamp, the Keyword rules, the part's served fields, the order helpers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSUMPTION_ELEMENT,
  ASSUMPTION_KEPT,
  ASSUMPTION_WARNING,
  KEYWORD_MESSAGE,
  PARENT_NOT_A_PART,
  asGrid,
  assumptionHedge,
  comparePartTie,
  duplicatePartTag,
  isAssumptionPart,
  isPartType,
  keywordProblem,
  nextOrder,
  partBody,
  partKeyword,
  partLineSources,
  partOrder,
  suggestKeyword,
  tagTaken,
  type PartRow,
} from "./planParts";

const row = (served: Record<string, unknown>, facts: Record<string, string> = {}): PartRow => ({
  id: "p1",
  typeUri: "t:SpecificationElement",
  facts,
  served: { facts: served },
});

describe("the sentences", () => {
  it("are verbatim", () => {
    expect(KEYWORD_MESSAGE).toBe("Keyword: letters only, starting with a capital, e.g. Sync");
    expect(ASSUMPTION_WARNING).toBe("An assumption is a plain claim a test can prove wrong: no may, might, could or expected to.");
    expect(ASSUMPTION_KEPT).toBe("Assumption is kept for the assumptions. Use + Assumption.");
    expect(ASSUMPTION_ELEMENT).toBe(
      "There is a part called Assumption that is not an assumption. Rename or remove it, then + Assumption works.",
    );
    expect(PARENT_NOT_A_PART).toBe("not written: its parent is not a part here");
  });
});

describe("asGrid", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  const base = { id: "r1", typeUri: "t:Function", facts: {}, opaqueFacts: [], etag: null };

  it("stamps a record with no updatedAt as just read, and leaves the record it was given alone", () => {
    const input = { ...base };
    const out = asGrid(input);
    expect(out.updatedAt).toBe(Date.parse("2026-01-02T03:04:05.000Z"));
    expect(out).toEqual({ ...base, updatedAt: 1767323045000 });
    expect(out).not.toBe(input);
    expect("updatedAt" in input).toBe(false);
  });

  it("reads the clock again for each record", () => {
    const first = asGrid({ ...base });
    vi.setSystemTime(new Date("2026-01-02T03:04:06.000Z"));
    const second = asGrid({ ...base });
    expect(second.updatedAt - first.updatedAt).toBe(1000);
  });

  it("returns the same object when updatedAt is a number, whatever the number", () => {
    const stamped = { ...base, updatedAt: 5 };
    expect(asGrid(stamped)).toBe(stamped);
    const zero = { ...base, updatedAt: 0 };
    expect(asGrid(zero)).toBe(zero);
    const nan = { ...base, updatedAt: Number.NaN };
    expect(asGrid(nan)).toBe(nan);
  });

  it("stamps again when updatedAt is not a number (a string, null)", () => {
    expect(asGrid({ ...base, updatedAt: "5" } as never).updatedAt).toBe(1767323045000);
    expect(asGrid({ ...base, updatedAt: null } as never).updatedAt).toBe(1767323045000);
  });
});

describe("keywordProblem", () => {
  it("accepts letters only, starting with a capital, after trimming", () => {
    for (const k of ["Sync", "S", "SyncUp", "SYNC", "  Sync  "]) expect(keywordProblem(k)).toBeNull();
  });

  it("refuses anything else with the Keyword sentence", () => {
    for (const k of ["sync", "", "  ", "Sync2", "Sync up", "Sync-up", "1Sync", "Sync.", "Éclair"]) expect(keywordProblem(k)).toBe(KEYWORD_MESSAGE);
  });

  it("reserves Assumption, in any case, on the top level only", () => {
    for (const k of ["Assumption", "assumption", "ASSUMPTION", "  assumption  "]) expect(keywordProblem(k, { topLevel: true })).toBe(ASSUMPTION_KEPT);
    expect(keywordProblem("Assumption")).toBeNull();
    expect(keywordProblem("assumption")).toBe(KEYWORD_MESSAGE);
    expect(keywordProblem("Assumptions", { topLevel: true })).toBeNull();
    expect(keywordProblem("Assumption", { topLevel: false })).toBeNull();
    expect(keywordProblem("Sync", { topLevel: true })).toBeNull();
  });
});

describe("suggestKeyword", () => {
  it("takes the first word, letters only, first letter a capital", () => {
    expect(suggestKeyword("walking on legs")).toBe("Walking");
    expect(suggestKeyword("  walking")).toBe("Walking");
    expect(suggestKeyword("walk.")).toBe("Walk");
    expect(suggestKeyword("x-ray vision")).toBe("Xray");
  });

  it("leaves the rest of the word as typed", () => {
    expect(suggestKeyword("wALKING")).toBe("WALKING");
    expect(suggestKeyword("Walking")).toBe("Walking");
  });

  it("is empty when the first word has no letter, even if a later word has", () => {
    expect(suggestKeyword("")).toBe("");
    expect(suggestKeyword("   ")).toBe("");
    expect(suggestKeyword("123 abc")).toBe("");
    expect(suggestKeyword("éé abc")).toBe("");
  });
});

describe("assumptionHedge", () => {
  it("finds may, might, could and 'expected to' as whole words, in any case", () => {
    for (const t of ["The floor may be flat.", "It might rain", "Could be", "COULD", "It is expected to hold", "may", "the tray, may."]) {
      expect(assumptionHedge(t)).toBe(true);
    }
  });

  it("does not find them inside another word, or 'expected' alone", () => {
    for (const t of ["maybe", "mayor", "mighty", "couldn't", "The floor is flat.", "expected", "expected  to", "", "unexpected to"]) {
      expect(assumptionHedge(t), t).toBe(false);
    }
    expect(assumptionHedge("may-be")).toBe(true);
  });
});

describe("partKeyword", () => {
  it("is the last dot-separated piece of the tag", () => {
    expect(partKeyword("Walk.Step.Lift")).toBe("Lift");
    expect(partKeyword("Walk")).toBe("Walk");
  });

  it("skips empty pieces", () => {
    expect(partKeyword("Walk.")).toBe("Walk");
    expect(partKeyword(".Walk")).toBe("Walk");
    expect(partKeyword("Walk..Step")).toBe("Step");
    expect(partKeyword("")).toBe("");
    expect(partKeyword("...")).toBe("");
  });
});

describe("partBody / partOrder / partLineSources", () => {
  it("partBody reads the served body, then the flat one, and gives '' for anything that is not a string", () => {
    expect(partBody(row({ body: "on legs" }))).toBe("on legs");
    expect(partBody(row({}, { body: "flat" }))).toBe("flat");
    expect(partBody(row({ body: "served" }, { body: "flat" }))).toBe("served");
    expect(partBody(row({ "a:body": "prefixed" }))).toBe("prefixed");
    expect(partBody(row({ body: 5 }))).toBe("");
    expect(partBody(row({ body: null }, { body: "flat" }))).toBe("");
    expect(partBody({ id: "x", typeUri: "t:Assumption", facts: {} })).toBe("");
  });

  it("partOrder reads a number as it is, and a numeric string through Number()", () => {
    expect(partOrder(row({ elementOrder: 2 }))).toBe(2);
    expect(partOrder(row({ elementOrder: 0 }))).toBe(0);
    expect(partOrder(row({ elementOrder: -3.5 }))).toBe(-3.5);
    expect(partOrder(row({ elementOrder: "4" }))).toBe(4);
    expect(partOrder(row({ elementOrder: " 4 " }))).toBe(4);
    expect(partOrder(row({ elementOrder: "1e2" }))).toBe(100);
    expect(partOrder(row({}, { elementOrder: "7" }))).toBe(7);
    expect(partOrder(row({ "a:elementOrder": 3 }))).toBe(3);
  });

  it("partOrder is NaN when missing, blank, or not a number", () => {
    expect(partOrder(row({}))).toBeNaN();
    expect(partOrder(row({ elementOrder: "" }))).toBeNaN();
    expect(partOrder(row({ elementOrder: "   " }))).toBeNaN();
    expect(partOrder(row({ elementOrder: "abc" }))).toBeNaN();
    expect(partOrder(row({ elementOrder: "0,001" }))).toBeNaN();
    expect(partOrder(row({ elementOrder: true }))).toBeNaN();
    expect(partOrder(row({ elementOrder: null }))).toBeNaN();
    expect(partOrder(row({ elementOrder: [1] }))).toBeNaN();
    expect(partOrder(row({ elementOrder: Number.NaN }))).toBeNaN();
  });

  it("partOrder does not make a non-finite number NaN, although its comment says so", () => {
    expect(partOrder(row({ elementOrder: Number.POSITIVE_INFINITY }))).toBe(Number.POSITIVE_INFINITY);
    expect(partOrder(row({ elementOrder: "Infinity" }))).toBe(Number.POSITIVE_INFINITY);
  });

  it("partLineSources reads a:lineSources in whatever spelling it was served", () => {
    const who = "https://vault.example.test/vault/e/ann";
    const members = { sourceOf: "a:body", statedBy: { "@id": who } };
    expect(partLineSources(row({ lineSources: members }))["a:body"]).toEqual({ statedBy: who });
    expect(partLineSources(row({ lineSources: [members] }))["a:body"]).toEqual({ statedBy: who });
    expect(partLineSources(row({ lineSources: [{ sourceOf: "a:body", source: "Dr Ames" }] }))["a:body"]).toEqual({ text: "Dr Ames" });
    expect(partLineSources(row({}))).toEqual({});
    expect(partLineSources(row({ lineSources: "junk" }))).toEqual({});
  });
});

describe("nextOrder", () => {
  it("is one past the largest finite order, and 1 when there is none", () => {
    expect(nextOrder([1, 2, 3])).toBe(4);
    expect(nextOrder([3, 1])).toBe(4);
    expect(nextOrder([])).toBe(1);
    expect(nextOrder([Number.NaN])).toBe(1);
    expect(nextOrder([Number.NaN, 2, Number.POSITIVE_INFINITY])).toBe(3);
  });

  it("starts the maximum at 0: only negative or zero orders give 1", () => {
    expect(nextOrder([0])).toBe(1);
    expect(nextOrder([-5])).toBe(1);
    expect(nextOrder([-5, -2])).toBe(1);
    expect(nextOrder([2.5])).toBe(3.5);
  });
});

describe("tagTaken / duplicatePartTag / comparePartTie", () => {
  it("tagTaken compares the trimmed tag with the pool's tags (unitTag, else tag)", () => {
    const pool: { facts: Record<string, string> }[] = [{ facts: { unitTag: "Walk.Step" } }, { facts: { tag: "Walk.Run" } }, { facts: {} }];
    expect(tagTaken(pool, "Walk.Step")).toBe(true);
    expect(tagTaken(pool, "  Walk.Step  ")).toBe(true);
    expect(tagTaken(pool, "Walk.Run")).toBe(true);
    expect(tagTaken(pool, "walk.step")).toBe(false);
    expect(tagTaken(pool, "Walk.Other")).toBe(false);
    expect(tagTaken(pool, "")).toBe(false);
    expect(tagTaken(pool, "   ")).toBe(false);
    expect(tagTaken([], "Walk")).toBe(false);
  });

  it("duplicatePartTag is the duplicate-tag sentence of the links unit", () => {
    expect(duplicatePartTag("Walk.Step")).toBe('The tag "Walk.Step" is already used in this vault. Pick another.');
  });

  it("comparePartTie orders by tag (locale compare), then id", () => {
    expect(comparePartTie("A", "z", "B", "a")).toBeLessThan(0);
    expect(comparePartTie("B", "a", "A", "z")).toBeGreaterThan(0);
    expect(comparePartTie("A", "a", "A", "b")).toBe(-1);
    expect(comparePartTie("A", "b", "A", "a")).toBe(1);
    expect(comparePartTie("A", "a", "A", "a")).toBe(0);
    expect(comparePartTie("", "a", "", "b")).toBe(-1);
  });
});

describe("isAssumptionPart / isPartType", () => {
  it("isAssumptionPart is true for the type Assumption only", () => {
    expect(isAssumptionPart({ typeUri: "t:Assumption" })).toBe(true);
    expect(isAssumptionPart({ typeUri: "https://vault.example.test/base/t/Assumption" })).toBe(true);
    expect(isAssumptionPart({ typeUri: "t:SpecificationElement" })).toBe(false);
    expect(isAssumptionPart({ typeUri: "" })).toBe(false);
  });

  it("isPartType is true for a specification element and an assumption, not for another type that names a part-of", () => {
    expect(isPartType("t:SpecificationElement")).toBe(true);
    expect(isPartType("t:Assumption")).toBe(true);
    expect(isPartType("https://vault.example.test/base/t/SpecificationElement")).toBe(true);
    expect(isPartType("t:Function")).toBe(false);
    expect(isPartType("t:System")).toBe(false);
    expect(isPartType("")).toBe(false);
  });
});
