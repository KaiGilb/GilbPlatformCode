// Pinning tests: every export has at least one, and the odd cases are pinned as the code does them.
import { describe, expect, it } from "vitest";
import {
  IMPACT_ARROW,
  IMPACT_ON_TYPE,
  IMPACT_RELATION_TYPE,
  IMPACT_RESOURCE_ROLE,
  IMPACT_SOLUTION_ROLE,
  IMPACT_VALUE_ROLE,
  factsFromExtras,
  impactExtraFacts,
  impactNumbersText,
  impactsOnSolution,
  parseAmount,
  parseImpactFields,
  parseValueSide,
  resourceDrawShown,
  sameImpact,
  scaleUnitOf,
  sortImpacts,
  sourceFromImpactFacts,
  sourceToImpactFacts,
  splitPinned,
  valueEstimateShown,
  type ImpactBasis,
  type ImpactCommit,
  type ImpactLink,
  type ImpactStored,
  type ImpactTargetRole,
} from "./index";

const H = "https://vault.example.test";
const e = (id: string) => `${H}/base/e/${id}`;
const MINUS = "−";

const stored = (over: Partial<ImpactStored> = {}): ImpactStored => ({
  role: IMPACT_VALUE_ROLE,
  valueEstimate: "3 → 0.2",
  resourceDraw: "",
  unit: "seconds",
  basis: "estimate",
  source: {},
  ...over,
});

describe("constants", () => {
  it("are the wire vocabulary", () => {
    expect(IMPACT_ON_TYPE).toBe("t:ImpactOn");
    expect(IMPACT_SOLUTION_ROLE).toBe("role:solution");
    expect(IMPACT_VALUE_ROLE).toBe("role:value");
    expect(IMPACT_RESOURCE_ROLE).toBe("role:resource");
    expect(IMPACT_RELATION_TYPE).toBe("value-estimation");
  });
  it("IMPACT_ARROW is space, U+2192, space", () => {
    expect(IMPACT_ARROW).toBe(" → ");
    expect(IMPACT_ARROW.length).toBe(3);
    expect(IMPACT_ARROW.charCodeAt(1)).toBe(0x2192);
  });
  it("the types accept the shapes the functions take", () => {
    const role: ImpactTargetRole = IMPACT_RESOURCE_ROLE;
    const basis: ImpactBasis = "measured";
    const link: ImpactLink = { relation: "r", targetUri: e("v"), targetRole: IMPACT_VALUE_ROLE };
    const commit: ImpactCommit = { role, valueEstimate: "", resourceDraw: "+1", unit: "", basis };
    expect([role, basis, link.targetRole, commit.basis]).toEqual(["role:resource", "measured", "role:value", "measured"]);
  });
});

describe("impactsOnSolution", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    relation: `${H}/base/r/i1`,
    role: "role:solution",
    type: "t:ImpactOn",
    members: [{ member: e("v1"), role: "role:value" }],
    ...over,
  });
  it("reads the Values and Resources a Solution has impacts on, with the prefixed target role", () => {
    const members = [
      { member: e("v1"), role: "value" },
      { member: e("r1"), role: "role:resource" },
    ];
    expect(impactsOnSolution([row({ members })])).toEqual([
      { relation: `${H}/base/r/i1`, targetUri: e("v1"), targetRole: IMPACT_VALUE_ROLE },
      { relation: `${H}/base/r/i1`, targetUri: e("r1"), targetRole: IMPACT_RESOURCE_ROLE },
    ]);
  });
  it("takes the type in any spelling, and skips another or a missing type", () => {
    expect(impactsOnSolution([row({ type: `${H}/base/t/ImpactOn` })])).toHaveLength(1);
    expect(impactsOnSolution([row({ type: "ImpactOn" })])).toHaveLength(1);
    expect(impactsOnSolution([row({ type: "t:SolutionOf" })])).toEqual([]);
    expect(impactsOnSolution([row({ type: undefined })])).toEqual([]);
  });
  it("skips a row where the record is not the solution, a blank member and a member of another role", () => {
    expect(impactsOnSolution([row({ role: "role:value" })])).toEqual([]);
    expect(impactsOnSolution([row({ members: [{ member: "  ", role: "role:value" }] })])).toEqual([]);
    expect(impactsOnSolution([row({ members: [{ member: e("x"), role: "role:solution" }] })])).toEqual([]);
  });
  it("keeps the member address as served", () => {
    expect(impactsOnSolution([row({ members: [{ member: ` ${e("v1")} `, role: "value" }] })])[0]?.targetUri).toBe(` ${e("v1")} `);
  });
  it("null, undefined, no rows and a row with no members give nothing", () => {
    expect(impactsOnSolution(null)).toEqual([]);
    expect(impactsOnSolution(undefined)).toEqual([]);
    expect(impactsOnSolution([])).toEqual([]);
    expect(impactsOnSolution([row({ members: undefined })])).toEqual([]);
  });
});

describe("sortImpacts", () => {
  const link = (id: string, targetRole: ImpactTargetRole): ImpactLink => ({ relation: `r-${id}`, targetUri: e(id), targetRole });
  const tags: Record<string, string> = { [e("v1")]: "B", [e("v2")]: "A", [e("r1")]: "Z", [e("r2")]: "C" };
  it("puts Values first, then Resources, each side by tag", () => {
    const out = sortImpacts([link("r1", IMPACT_RESOURCE_ROLE), link("v1", IMPACT_VALUE_ROLE), link("r2", IMPACT_RESOURCE_ROLE), link("v2", IMPACT_VALUE_ROLE)], (u) => tags[u] ?? "");
    expect(out.map((l) => l.targetUri)).toEqual([e("v2"), e("v1"), e("r2"), e("r1")]);
  });
  it("ties on tag go by address; the input is not changed", () => {
    const input = [link("b", IMPACT_VALUE_ROLE), link("a", IMPACT_VALUE_ROLE)];
    const out = sortImpacts(input, () => "same");
    expect(out.map((l) => l.targetUri)).toEqual([e("a"), e("b")]);
    expect(input.map((l) => l.targetUri)).toEqual([e("b"), e("a")]);
    expect(out).not.toBe(input);
  });
  it("is empty for none", () => {
    expect(sortImpacts([], () => "")).toEqual([]);
  });
});

describe("valueEstimateShown", () => {
  it("a pinned string is itself, and pinned", () => {
    expect(valueEstimateShown("3 → 0.2")).toEqual({ text: "3 → 0.2", pinned: true });
    expect(valueEstimateShown("unmeasured → 5")).toEqual({ text: "unmeasured → 5", pinned: true });
    expect(valueEstimateShown("-1 → -2.5")).toEqual({ text: "-1 → -2.5", pinned: true });
  });
  it("is pinned on the trimmed string, and the text is as stored", () => {
    expect(valueEstimateShown("  3 → 0.2 ")).toEqual({ text: "  3 → 0.2 ", pinned: true });
  });
  it("any other string is itself, not pinned: an ASCII arrow, a right side of unmeasured, a unit on the end, a plus sign", () => {
    for (const s of ["3 -> 0.2", "3 → unmeasured", "3 → 0.2 seconds", "+3 → 4", "fast", "", "3→0.2", "3,5 → 4"]) {
      expect(valueEstimateShown(s), s).toEqual({ text: s, pinned: false });
    }
  });
  it("a number or a boolean is its string, not pinned", () => {
    expect(valueEstimateShown(5)).toEqual({ text: "5", pinned: false });
    expect(valueEstimateShown(0)).toEqual({ text: "0", pinned: false });
    expect(valueEstimateShown(true)).toEqual({ text: "true", pinned: false });
    expect(valueEstimateShown(false)).toEqual({ text: "false", pinned: false });
  });
  it("an object or a list is compact JSON, key order as stored, not pinned", () => {
    expect(valueEstimateShown({ level: 3, unit: "s", confidence: "high" })).toEqual({ text: '{"level":3,"unit":"s","confidence":"high"}', pinned: false });
    expect(valueEstimateShown({ unit: "s", level: 3 }).text).toBe('{"unit":"s","level":3}');
    expect(valueEstimateShown([1, 2])).toEqual({ text: "[1,2]", pinned: false });
  });
  it("null, undefined and other types are empty", () => {
    expect(valueEstimateShown(null)).toEqual({ text: "", pinned: false });
    expect(valueEstimateShown(undefined)).toEqual({ text: "", pinned: false });
    expect(valueEstimateShown(() => 1)).toEqual({ text: "", pinned: false });
  });
});

describe("resourceDrawShown", () => {
  it("a leading ASCII minus is U+2212", () => {
    expect(resourceDrawShown("-20")).toBe(`${MINUS}20`);
    expect(resourceDrawShown("-0.5")).toBe(`${MINUS}0.5`);
  });
  it("a leading plus stays, and so does anything else", () => {
    expect(resourceDrawShown("+200")).toBe("+200");
    expect(resourceDrawShown("200")).toBe("200");
    expect(resourceDrawShown("")).toBe("");
    expect(resourceDrawShown(`${MINUS}5`)).toBe(`${MINUS}5`);
  });
  it("only the first minus changes", () => {
    expect(resourceDrawShown("--5")).toBe(`${MINUS}-5`);
  });
});

describe("impactNumbersText", () => {
  it("a Resource: the amount, with the unit when there is one", () => {
    expect(impactNumbersText(stored({ role: IMPACT_RESOURCE_ROLE, resourceDraw: "-20", unit: "seconds" }))).toBe(`${MINUS}20 seconds`);
    expect(impactNumbersText(stored({ role: IMPACT_RESOURCE_ROLE, resourceDraw: "+200", unit: "" }))).toBe("+200");
  });
  it("a Resource ignores the value estimate", () => {
    expect(impactNumbersText(stored({ role: IMPACT_RESOURCE_ROLE, resourceDraw: "+1", valueEstimate: "9 → 9", unit: "" }))).toBe("+1");
  });
  it("a Value in the pinned form: the trimmed words and the unit", () => {
    expect(impactNumbersText(stored({ valueEstimate: " 3 → 0.2 ", unit: "seconds" }))).toBe("3 → 0.2 seconds");
    expect(impactNumbersText(stored({ valueEstimate: "3 → 0.2", unit: "" }))).toBe("3 → 0.2");
  });
  it("a Value in any other form: the shown text, with no unit and untrimmed", () => {
    expect(impactNumbersText(stored({ valueEstimate: " fast ", unit: "seconds" }))).toBe(" fast ");
    expect(impactNumbersText(stored({ valueEstimate: { level: 3 }, unit: "seconds" }))).toBe('{"level":3}');
    expect(impactNumbersText(stored({ valueEstimate: undefined, unit: "seconds" }))).toBe("");
  });
});

describe("parseValueSide", () => {
  it("unmeasured is itself, with spaces around it, and only in lower case", () => {
    expect(parseValueSide("unmeasured")).toBe("unmeasured");
    expect(parseValueSide("  unmeasured ")).toBe("unmeasured");
    expect(parseValueSide("Unmeasured")).toBeNull();
  });
  it("integers and decimals, signed or not; a leading plus is dropped", () => {
    expect(parseValueSide("3")).toBe("3");
    expect(parseValueSide("0.2")).toBe("0.2");
    expect(parseValueSide("-2")).toBe("-2");
    expect(parseValueSide("+4")).toBe("4");
    expect(parseValueSide(" 7 ")).toBe("7");
  });
  it("U+2212 is a minus", () => {
    expect(parseValueSide(`${MINUS}2`)).toBe("-2");
  });
  it("a comma is stored as a dot: \"1,5\" is 1.5, and \"1,000\" is 1.000 (a decimal, not a thousand)", () => {
    expect(parseValueSide("1,5")).toBe("1.5");
    expect(parseValueSide("1,000")).toBe("1.000");
  });
  it("a number with both a thousands comma and a decimal point is not a number here", () => {
    expect(parseValueSide("1,000.5")).toBeNull();
    expect(parseValueSide("1.000,5")).toBeNull();
  });
  it("junk is null", () => {
    for (const s of ["", " ", "abc", ".5", "5.", "1e3", "- 3", "++3", "3%", "1 2", "unmeasured 3", "∞"]) expect(parseValueSide(s), s).toBeNull();
  });
  it("a plus before a minus is dropped and leaves the negative number", () => {
    expect(parseValueSide("+-3")).toBe("-3");
  });
});

describe("parseAmount", () => {
  it("needs a sign; plus and minus both keep it", () => {
    expect(parseAmount("+200")).toBe("+200");
    expect(parseAmount("-20")).toBe("-20");
    expect(parseAmount(" +1.5 ")).toBe("+1.5");
  });
  it("U+2212 is a minus", () => {
    expect(parseAmount(`${MINUS}20`)).toBe("-20");
  });
  it("a comma is stored as a dot", () => {
    expect(parseAmount("+1,5")).toBe("+1.5");
    expect(parseAmount("-1,000")).toBe("-1.000");
  });
  it("no sign, no digits and junk are null", () => {
    for (const s of ["", "20", "0", "+", "-", "+.5", "+5.", "+1e3", "unmeasured", "+ 5", "+-5", "+1,000.5"]) expect(parseAmount(s), s).toBeNull();
  });
});

describe("parseImpactFields", () => {
  const fields = (over: Partial<{ status: string; expected: string; amount: string; unit: string; basis: ImpactBasis }> = {}) => ({
    status: "3",
    expected: "0.2",
    amount: "+200",
    unit: " seconds ",
    basis: "estimate" as ImpactBasis,
    ...over,
  });
  it("a Value: the pinned words status, arrow, expected; the unit trimmed; no draw", () => {
    expect(parseImpactFields(IMPACT_VALUE_ROLE, fields())).toEqual({
      role: IMPACT_VALUE_ROLE,
      valueEstimate: "3 → 0.2",
      resourceDraw: "",
      unit: "seconds",
      basis: "estimate",
    });
  });
  it("a Value may start from unmeasured but may not end at it", () => {
    expect(parseImpactFields(IMPACT_VALUE_ROLE, fields({ status: "unmeasured" }))?.valueEstimate).toBe("unmeasured → 0.2");
    expect(parseImpactFields(IMPACT_VALUE_ROLE, fields({ expected: "unmeasured" }))).toBeNull();
  });
  it("a Value with an unreadable side is null; the amount is ignored", () => {
    expect(parseImpactFields(IMPACT_VALUE_ROLE, fields({ status: "x" }))).toBeNull();
    expect(parseImpactFields(IMPACT_VALUE_ROLE, fields({ expected: "" }))).toBeNull();
    expect(parseImpactFields(IMPACT_VALUE_ROLE, fields({ amount: "junk" }))).not.toBeNull();
  });
  it("a Value normalises each side: a plus dropped, a comma to a dot", () => {
    expect(parseImpactFields(IMPACT_VALUE_ROLE, fields({ status: "+3", expected: "0,2" }))?.valueEstimate).toBe("3 → 0.2");
  });
  it("a Resource: the signed amount, no estimate; the status and expected are ignored", () => {
    expect(parseImpactFields(IMPACT_RESOURCE_ROLE, fields({ status: "junk", expected: "junk", basis: "measured" }))).toEqual({
      role: IMPACT_RESOURCE_ROLE,
      valueEstimate: "",
      resourceDraw: "+200",
      unit: "seconds",
      basis: "measured",
    });
  });
  it("a Resource without a sign is null", () => {
    expect(parseImpactFields(IMPACT_RESOURCE_ROLE, fields({ amount: "200" }))).toBeNull();
    expect(parseImpactFields(IMPACT_RESOURCE_ROLE, fields({ amount: "" }))).toBeNull();
  });
});

describe("splitPinned", () => {
  it("splits the pinned form at the arrow", () => {
    expect(splitPinned("3 → 0.2")).toEqual({ status: "3", expected: "0.2" });
    expect(splitPinned("  unmeasured → -5 ")).toEqual({ status: "unmeasured", expected: "-5" });
  });
  it("anything else is null", () => {
    for (const s of ["", "3", "3 -> 0.2", "3 → unmeasured", "3 → 0.2 seconds", "3→0.2", "fast", "3 → "]) expect(splitPinned(s), s).toBeNull();
  });
  it("is the inverse of the Value commit", () => {
    const commit = parseImpactFields(IMPACT_VALUE_ROLE, { status: "unmeasured", expected: "4", amount: "", unit: "", basis: "estimate" });
    expect(splitPinned(commit?.valueEstimate ?? "")).toEqual({ status: "unmeasured", expected: "4" });
  });
});

describe("sameImpact", () => {
  const commit = (over: Partial<ImpactCommit> = {}): ImpactCommit => ({
    role: IMPACT_VALUE_ROLE,
    valueEstimate: "3 → 0.2",
    resourceDraw: "",
    unit: "seconds",
    basis: "estimate",
    ...over,
  });
  it("a Value compares the estimate string; the draw does not count", () => {
    expect(sameImpact(stored(), commit())).toBe(true);
    expect(sameImpact(stored({ resourceDraw: "+9" }), commit())).toBe(true);
    expect(sameImpact(stored(), commit({ valueEstimate: "3 → 0.3" }))).toBe(false);
  });
  it("a stored estimate that is not a string is never the same", () => {
    expect(sameImpact(stored({ valueEstimate: { level: 3 } }), commit({ valueEstimate: '{"level":3}' }))).toBe(false);
  });
  it("a Resource compares the draw; the estimate does not count", () => {
    const r = { role: IMPACT_RESOURCE_ROLE, valueEstimate: "", resourceDraw: "+200", unit: "seconds" } as const;
    expect(sameImpact(stored({ ...r, valueEstimate: "x" }), commit(r))).toBe(true);
    expect(sameImpact(stored({ ...r }), commit({ ...r, resourceDraw: "+201" }))).toBe(false);
  });
  it("a different unit, basis or role is a change", () => {
    expect(sameImpact(stored(), commit({ unit: "minutes" }))).toBe(false);
    expect(sameImpact(stored(), commit({ basis: "measured" }))).toBe(false);
    expect(sameImpact(stored(), commit({ role: IMPACT_RESOURCE_ROLE, resourceDraw: "" }))).toBe(false);
  });
});

describe("sourceFromImpactFacts", () => {
  it("reads statedBy and derivedFrom from {\"@id\"} or a bare address, and the source words trimmed", () => {
    expect(sourceFromImpactFacts({ statedBy: { "@id": e("ann") }, derivedFrom: e("doc"), source: "  a note " })).toEqual({
      statedBy: e("ann"),
      derivedFrom: e("doc"),
      text: "a note",
    });
  });
  it("reads a: keys", () => {
    expect(sourceFromImpactFacts({ "a:statedBy": { "@id": e("ann") }, "a:source": "x" })).toEqual({ statedBy: e("ann"), text: "x" });
  });
  it("a urn: is an address; a word is not; an address with a leading space is not (the check is before the trim)", () => {
    expect(sourceFromImpactFacts({ statedBy: "urn:person:1" })).toEqual({ statedBy: "urn:person:1" });
    expect(sourceFromImpactFacts({ statedBy: "Ann" })).toEqual({});
    expect(sourceFromImpactFacts({ statedBy: ` ${e("ann")}` })).toEqual({});
    expect(sourceFromImpactFacts({ statedBy: { "@id": `${e("ann")} ` } })).toEqual({ statedBy: e("ann") });
    expect(sourceFromImpactFacts({ statedBy: `${e("ann")} `, derivedFrom: `${e("doc")}\n` })).toEqual({ statedBy: e("ann"), derivedFrom: e("doc") });
  });
  it("blank or non-string words, and a list of links, are nothing", () => {
    expect(sourceFromImpactFacts({ source: "   " })).toEqual({});
    expect(sourceFromImpactFacts({ source: 5 })).toEqual({});
    expect(sourceFromImpactFacts({ statedBy: [{ "@id": e("ann") }] })).toEqual({});
    expect(sourceFromImpactFacts({})).toEqual({});
  });
});

describe("sourceToImpactFacts", () => {
  it("writes statedBy and derivedFrom as {\"@id\"} and the words as a:source", () => {
    expect(sourceToImpactFacts({ statedBy: e("ann"), derivedFrom: e("doc"), text: "note" })).toEqual({
      "a:statedBy": { "@id": e("ann") },
      "a:derivedFrom": { "@id": e("doc") },
      "a:source": "note",
    });
  });
  it("writes nothing for what is empty", () => {
    expect(sourceToImpactFacts({})).toEqual({});
    expect(sourceToImpactFacts({ text: "", statedBy: "" })).toEqual({});
  });
  it("reads back through sourceFromImpactFacts", () => {
    const source = { statedBy: e("ann"), text: "note" };
    expect(sourceFromImpactFacts(sourceToImpactFacts(source))).toEqual(source);
  });
});

describe("factsFromExtras", () => {
  it("reads the bare or a:-spelled facts of the relation", () => {
    const a = factsFromExtras({ valueEstimate: "3 → 0.2", unit: "s", impactBasis: "measured" }, IMPACT_VALUE_ROLE);
    expect(a).toEqual({ role: IMPACT_VALUE_ROLE, valueEstimate: "3 → 0.2", resourceDraw: "", unit: "s", basis: "measured", source: {} });
    const b = factsFromExtras({ "a:resourceDraw": "-4", "a:unit": "h", "a:impactBasis": "estimate" }, IMPACT_RESOURCE_ROLE);
    expect(b).toMatchObject({ role: IMPACT_RESOURCE_ROLE, resourceDraw: "-4", unit: "h", basis: "estimate" });
  });
  it("any basis but measured is estimate", () => {
    expect(factsFromExtras({ impactBasis: "guess" }, IMPACT_VALUE_ROLE).basis).toBe("estimate");
    expect(factsFromExtras({}, IMPACT_VALUE_ROLE).basis).toBe("estimate");
  });
  it("the unit is a string or empty, and not trimmed", () => {
    expect(factsFromExtras({ unit: 5 }, IMPACT_VALUE_ROLE).unit).toBe("");
    expect(factsFromExtras({ unit: " s " }, IMPACT_VALUE_ROLE).unit).toBe(" s ");
  });
  it("the draw is a string, a number as its string, or empty", () => {
    expect(factsFromExtras({ resourceDraw: -20 }, IMPACT_RESOURCE_ROLE).resourceDraw).toBe("-20");
    expect(factsFromExtras({ resourceDraw: "+2" }, IMPACT_RESOURCE_ROLE).resourceDraw).toBe("+2");
    expect(factsFromExtras({ resourceDraw: { x: 1 } }, IMPACT_RESOURCE_ROLE).resourceDraw).toBe("");
    expect(factsFromExtras({}, IMPACT_RESOURCE_ROLE).resourceDraw).toBe("");
  });
  it("the estimate is whatever was stored; the source is read with it", () => {
    expect(factsFromExtras({ valueEstimate: { level: 3 } }, IMPACT_VALUE_ROLE).valueEstimate).toEqual({ level: 3 });
    expect(factsFromExtras({}, IMPACT_VALUE_ROLE).valueEstimate).toBeUndefined();
    expect(factsFromExtras({ source: "note", statedBy: { "@id": e("ann") } }, IMPACT_VALUE_ROLE).source).toEqual({ statedBy: e("ann"), text: "note" });
  });
});

describe("impactExtraFacts", () => {
  it("a Value writes the estimate and not the draw; the relation type, unit and basis always", () => {
    expect(impactExtraFacts(stored(), {})).toEqual({
      "a:relationType": "value-estimation",
      "a:unit": "seconds",
      "a:impactBasis": "estimate",
      "a:valueEstimate": "3 → 0.2",
    });
  });
  it("a Resource writes the draw and not the estimate", () => {
    const out = impactExtraFacts(stored({ role: IMPACT_RESOURCE_ROLE, resourceDraw: "+200", valueEstimate: "x" }), {});
    expect(out["a:resourceDraw"]).toBe("+200");
    expect("a:valueEstimate" in out).toBe(false);
  });
  it("carries the source between the basis and the number, in this key order; never the roles or an estimates list", () => {
    const out = impactExtraFacts(stored(), { statedBy: e("ann"), text: "note" });
    expect(Object.keys(out)).toEqual(["a:relationType", "a:unit", "a:impactBasis", "a:statedBy", "a:source", "a:valueEstimate"]);
    expect("a:impactEstimates" in out).toBe(false);
    expect(Object.keys(out).some((k) => /role/i.test(k))).toBe(false);
  });
  it("takes a commit as well as a stored impact", () => {
    const commit = parseImpactFields(IMPACT_RESOURCE_ROLE, { status: "", expected: "", amount: "-3", unit: "h", basis: "measured" })!;
    expect(impactExtraFacts(commit, {})).toEqual({
      "a:relationType": "value-estimation",
      "a:unit": "h",
      "a:impactBasis": "measured",
      "a:resourceDraw": "-3",
    });
  });
  it("round-trips: what is typed is what is read back and is the same impact", () => {
    const commit = parseImpactFields(IMPACT_VALUE_ROLE, { status: "unmeasured", expected: "4", amount: "", unit: "kg", basis: "measured" })!;
    const back = factsFromExtras(impactExtraFacts(commit, { text: "note" }), IMPACT_VALUE_ROLE);
    expect(back).toMatchObject({ valueEstimate: "unmeasured → 4", unit: "kg", basis: "measured", source: { text: "note" } });
    expect(sameImpact(back, commit)).toBe(true);
  });
});

describe("scaleUnitOf", () => {
  const rec = (facts: Record<string, string>, served?: Record<string, unknown> | null) => ({
    facts,
    ...(served === undefined ? {} : { served: served === null ? null : { facts: served } }),
  });
  it("reads the unit of the served scale object, a:unit then unit, trimmed", () => {
    expect(scaleUnitOf(rec({}, { scale: { "a:unit": " seconds " } }))).toBe("seconds");
    expect(scaleUnitOf(rec({}, { scale: { unit: "kg" } }))).toBe("kg");
    expect(scaleUnitOf(rec({}, { scale: { "a:unit": "a", unit: "b" } }))).toBe("a");
  });
  it("finds the scale under a:scale too", () => {
    expect(scaleUnitOf(rec({}, { "a:scale": { unit: "kg" } }))).toBe("kg");
    // when both spellings are there, the bare `scale` is read
    expect(scaleUnitOf(rec({}, { scale: { unit: "bare" }, "a:scale": { unit: "prefixed" } }))).toBe("bare");
  });
  it("a scale held as a JSON string is parsed", () => {
    expect(scaleUnitOf(rec({ scale: JSON.stringify({ "a:unit": "h" }) }))).toBe("h");
    expect(scaleUnitOf(rec({}, { scale: JSON.stringify({ unit: "m" }) }))).toBe("m");
  });
  it("a scale that is only {\"@id\"} has no unit", () => {
    expect(scaleUnitOf(rec({}, { scale: { "@id": `${H}/base/e/s` } }))).toBe("");
  });
  it("a unit on the record itself is not the scale's unit", () => {
    expect(scaleUnitOf(rec({ "a:unit": "x", unit: "x" }, { unit: "y", "a:unit": "y" }))).toBe("");
  });
  it("the served scale wins; an empty served unit falls to the flat one", () => {
    expect(scaleUnitOf(rec({ scale: JSON.stringify({ unit: "flat" }) }, { scale: { unit: "served" } }))).toBe("served");
    expect(scaleUnitOf(rec({ scale: JSON.stringify({ unit: "flat" }) }, { scale: { unit: "  " } }))).toBe("flat");
    expect(scaleUnitOf(rec({ scale: JSON.stringify({ unit: "flat" }) }, null))).toBe("flat");
  });
  it("junk is empty: broken JSON, a list, a plain word, a non-string unit, no scale", () => {
    expect(scaleUnitOf(rec({ scale: "{broken" }))).toBe("");
    expect(scaleUnitOf(rec({ scale: JSON.stringify([{ unit: "x" }]) }))).toBe("");
    expect(scaleUnitOf(rec({ scale: "seconds" }))).toBe("");
    expect(scaleUnitOf(rec({}, { scale: { unit: 5 } }))).toBe("");
    expect(scaleUnitOf(rec({}, { scale: [{ unit: "x" }] }))).toBe("");
    expect(scaleUnitOf(rec({}))).toBe("");
  });
});
