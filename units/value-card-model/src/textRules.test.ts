// The Value card text rules.
import { describe, expect, it } from "vitest";
import * as PV from "./planValue";
import type { ScaleVariable } from "./planValueModel";

const country: ScaleVariable = {
  name: "Country",
  definition: "",
  defaultOption: "",
  options: [{ name: "Norway", definition: "" }, { name: "Sweden", definition: "" }, { name: "Foo, Bar", definition: "" }, { name: "Br{ace}", definition: "" }],
  source: {},
};

describe("thousands separators and decimal commas", () => {
  it("reads 1,000 as 1000 and 1,000,000 as 1000000", () => {
    expect(PV.parseLevelLine("Goal 1,000")!.value).toBe(1000);
    expect(PV.parseLevelLine("Goal 1,000,000")!.value).toBe(1000000);
  });
  it("reads a comma followed by 1-2 or 4+ digits as a decimal comma", () => {
    expect(PV.parseLevelLine("Goal 9,5")!.value).toBe(9.5);
    expect(PV.parseLevelLine("Goal 3,25")!.value).toBe(3.25);
    expect(PV.parseLevelLine("Goal 3,1415")!.value).toBe(3.1415);
  });
  it("takes the last mark as the decimal when both appear", () => {
    expect(PV.parseNumberText("1,000.5")).toBe(1000.5);
    expect(PV.parseNumberText("1.000,5")).toBe(1000.5);
  });
  it("applies to stored string values", () => {
    const d = PV.readValueCard({ [PV.VALUE_SLUGS.levels]: [{ "levelKind": "Goal", "levelValue": "1,000" }] });
    expect(d.levels[0]!.value).toBe(1000);
  });
  it("is not a number: junk and mixed groups", () => {
    expect(PV.parseNumberText("1,00,0")).toBeNull();
    expect(PV.parseNumberText("abc")).toBeNull();
    expect(PV.parseNumberText("1.2.3")).toBeNull();
  });
});

describe("Infinity is rejected", () => {
  it("a 400-digit number is not a level", () => {
    expect(PV.parseLevelLine("Goal " + "9".repeat(400))).toBeNull();
    expect(Number.isFinite(PV.parseNumberText("9".repeat(400)) as number)).toBe(false);
  });
});

describe("quoted qualifier values round-trip", () => {
  it("writes a value with a comma quoted and reads it back", () => {
    const l = PV.parseLevelLine('Goal [Country = "Foo, Bar"] 3', [country])!;
    expect(l.qualifier.variables.Country).toBe("Foo, Bar");
    expect(l.qualifier.conditions).toEqual([]);
    const text = PV.formatLevelLine(l, [country]);
    expect(text).toBe('Goal [Country = "Foo, Bar"] 3');
    expect(PV.parseLevelLine(text, [country])).toEqual(l);
  });
  it("quotes inside a set", () => {
    const l = PV.parseLevelLine('Goal [Country = {"Foo, Bar", Norway}] 3', [country])!;
    expect(l.qualifier.variables.Country).toEqual(["Foo, Bar", "Norway"]);
    const text = PV.formatLevelLine(l, [country]);
    expect(text).toContain('{"Foo, Bar", Norway}');
    expect(PV.parseLevelLine(text, [country])).toEqual(l);
  });
  it("a value with braces round-trips", () => {
    const l = PV.parseLevelLine('Goal [Country = "Br{ace}"] 3', [country])!;
    expect(l.qualifier.variables.Country).toBe("Br{ace}");
    expect(PV.parseLevelLine(PV.formatLevelLine(l, [country]), [country])).toEqual(l);
  });
});

describe("ALL is exclusive in pasted text", () => {
  it("{ALL, Norway} gives ALL alone and a warning", () => {
    const r = PV.parseLevelLineWarn("Goal [Country = {ALL, Norway}] 3", [country]);
    expect(r.level!.qualifier.variables.Country).toBe("ALL");
    expect(r.warnings.join(" ")).toContain("ALL replaces the other values");
  });
  it("no warning without a mix", () => {
    expect(PV.parseLevelLineWarn("Goal [Country = {Norway, Sweden}] 3", [country]).warnings).toEqual([]);
  });
});

describe("the repair offer is only for real lists", () => {
  it("offers 2-20 short items", () => {
    expect(PV.listLikeDefinition("Norway, Sweden")).toEqual(["Norway", "Sweden"]);
    expect(PV.listLikeDefinition(Array.from({ length: 20 }, (_, i) => `v${i}`).join(", "))).toHaveLength(20);
  });
  it("never offers a sentence, a long item, more than 3 words, 21 items, or text ending with a period", () => {
    expect(PV.listLikeDefinition("a person who, when old, falls over a lot")).toBeNull();
    expect(PV.listLikeDefinition("Norway, Sweden.")).toBeNull();
    expect(PV.listLikeDefinition("one two three four, five")).toBeNull();
    expect(PV.listLikeDefinition("abcdefghijklmnopqrstuvwxyz, b")).toBeNull();
    expect(PV.listLikeDefinition(Array.from({ length: 21 }, (_, i) => `v${i}`).join(", "))).toBeNull();
    expect(PV.listLikeDefinition("Norway")).toBeNull();
  });
});
