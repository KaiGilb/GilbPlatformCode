import { describe, expect, it } from "vitest";
import { composeSpecCard, formatSpecCard, specCardForm, specCardWire } from "./specCardFacts";

describe("composeSpecCard", () => {
  it("stores a Value level as a number and does not keep function-only facts", () => {
    const wire = composeSpecCard("value", {
      unitTag: "Usability.Learn",
      level: "Product",
      levelSource: "requester",
      stakeholder: "FirstTimeUser",
      stakeholderSource: "requester",
      concept: "Learnability",
      conceptSource: "requester",
      gilbVeda: "none",
      gilbVedaSource: "requester",
      scaleUnit: "minutes",
      scaleRate: "per defined task, per first-time user",
      scaleContext: "from: first open; until: first success",
      scaleSource: "requester",
      endpointSubject: "product",
      endpointReference: "FirstTimeUser",
      endpointSource: "requester",
      meterHuman: "times at least five first-time users; median",
      meterHumanSource: "requester",
      statusDate: "2026-03-22",
      statusCondition: "lab review",
      statusLevel: "12",
      statusSource: "Kai-Zen estimate / MOCK",
      pastDate: "2025-09-15",
      pastCondition: "prior version",
      pastLevel: "45",
      pastSource: "Kai-Zen estimate / MOCK",
      valueOfFunction: "Send.FileToContact",
      valueOfFunctionSource: "requester",
      description: "must not store on a value",
      authority: "must not store on a value",
    });
    expect(wire.levelStatements).toEqual([
      {
        "a:status": 12,
        "a:statusWhen": "2026-03-22",
        "a:qualifierCondition": "lab review",
        "a:source": "Kai-Zen estimate / MOCK",
      },
      {
        "a:status": 45,
        "a:statusWhen": "2025-09-15",
        "a:qualifierCondition": "prior version",
        "a:source": "Kai-Zen estimate / MOCK",
      },
    ]);
    expect(wire.ontologyTerm).toBe("none");
    expect(wire.stakeholders).toEqual([{ "a:unitTag": "FirstTimeUser" }]);
    expect(wire.body).toBeUndefined();
    expect(wire.authority).toBeUndefined();
    expect(JSON.stringify(wire)).not.toContain("statusTo");
  });

  it("keeps authority on a constrained function and drops a scale", () => {
    const wire = composeSpecCard("function", {
      unitTag: "Send.FileToContact",
      constraint: "yes",
      authority: "Kai, on FileShareApp",
      statusDate: "2026-03-22",
      statusLevel: "In-Production",
      scaleUnit: "minutes",
      tolerableLevel: "3",
      tolerableDate: "2026-01-01",
    });
    expect(wire.authority).toBe("Kai, on FileShareApp");
    expect(wire.levelStatements).toEqual([
      { "a:status": "In-Production", "a:statusWhen": "2026-03-22" },
    ]);
    expect(wire.scale).toBeUndefined();
  });

  it("drops authority when constraint is not the exact word yes", () => {
    const plain = composeSpecCard("solution", {
      unitTag: "Send.GuidedFirst",
      authority: "should not store",
      constraint: "Yes",
    });
    expect(plain.authority).toBeUndefined();
    expect(plain.ontologyTerm).toBeUndefined();
  });

  it("stores impact numbers, and drops a from-value that is not a plain decimal", () => {
    const wire = composeSpecCard("solution", {
      unitTag: "Send.GuidedFirst",
      impactValue: "Usability.Learn",
      impactFrom: "12",
      impactTo: "3",
      impactUnit: "minutes",
      impactValueSource: "Kai-Zen",
      impactResource: "Cost.Monthly",
      impactResourceSign: "+",
      impactResourceAmount: "400",
      impactResourceUnit: "€ per month",
      impactResourceSource: "Kai-Zen",
    });
    expect(wire.impactEstimates).toEqual([
      {
        "role:value": { "a:unitTag": "Usability.Learn" },
        "a:valueEstimate": { from: 12, to: 3, unit: "minutes" },
        "a:source": "Kai-Zen",
      },
      {
        "role:resource": { "a:unitTag": "Cost.Monthly" },
        "a:resourceDraw": { sign: "+", amount: 400, unit: "€ per month" },
        "a:source": "Kai-Zen",
      },
    ]);

    const scientific = composeSpecCard("solution", {
      impactValue: "Usability.Learn",
      impactFrom: "1e2",
      impactUnit: "minutes",
    });
    expect(scientific.impactEstimates).toEqual([
      {
        "role:value": { "a:unitTag": "Usability.Learn" },
        "a:valueEstimate": { unit: "minutes" },
      },
    ]);
  });

  it("joins an authority url, and a url alone becomes the parenthesised text", () => {
    expect(
      composeSpecCard("function", {
        constraint: "yes",
        authority: "Kai",
        authorityUrl: "http://example.test/who",
      }).authority,
    ).toBe("Kai (http://example.test/who)");
    expect(
      composeSpecCard("function", {
        constraint: "yes",
        authorityUrl: "http://example.test/who",
      }).authority,
    ).toBe("(http://example.test/who)");
  });

  it("keeps a zero level", () => {
    const wire = composeSpecCard("value", { statusLevel: "0", statusDate: "2020-01-01" });
    expect(wire.levelStatements).toEqual([{ "a:status": 0, "a:statusWhen": "2020-01-01" }]);
  });
});

describe("formatSpecCard", () => {
  it("picks the latest status by string order, not by parsing a date", () => {
    const form = formatSpecCard({
      levelStatements: [
        { "a:status": 10, "a:statusWhen": "10" },
        { "a:status": 9, "a:statusWhen": "9" },
      ],
    });
    expect(form.statusLevel).toBe("9");
    expect(form.statusDate).toBe("9");
    expect(form.pastLevel).toBe("10");
    expect(form.pastDate).toBe("10");
  });

  it("keeps the first row when the when-strings are equal", () => {
    const form = formatSpecCard({
      levelStatements: [
        { "a:status": "first", "a:statusWhen": "2020-01-01" },
        { "a:status": "second", "a:statusWhen": "2020-01-01" },
      ],
    });
    expect(form.statusLevel).toBe("first");
    expect(form.pastLevel).toBe("second");
  });

  it("skips a meter whose kind is not the exact lowercase word", () => {
    const form = formatSpecCard({
      hasMeter: [
        { "a:meterAgentKind": "Human", "a:method": "no" },
        { "a:meterAgentKind": "ai", "a:method": "yes" },
      ],
    });
    expect(form.meterHuman).toBeUndefined();
    expect(form.meterAi).toBe("yes");
  });

  it("reads the first stakeholder only", () => {
    const form = formatSpecCard({
      stakeholders: [{ "a:unitTag": "First" }, { "a:unitTag": "Second" }],
    });
    expect(form.stakeholder).toBe("First");
  });

  it("returns an empty object for nothing", () => {
    expect(formatSpecCard(null)).toEqual({});
    expect(formatSpecCard(undefined)).toEqual({});
  });
});

describe("specCardForm and specCardWire", () => {
  it("copies ontologyTerm onto gilbVeda when the structured read did not set it", () => {
    const form = specCardForm({ ontologyTerm: "none", body: "text" }, null);
    expect(form.gilbVeda).toBe("none");
    expect(form.description).toBe("text");
  });

  it("a changed form is not unchanged, and a removed fact is null in the patch", () => {
    const structured = { unitTag: "Old" };
    const same = specCardWire("value", { unitTag: "Old" }, structured, { unitTag: "Old" });
    expect(same.unchanged).toBe(true);

    const next = specCardWire("value", { unitTag: "New", level: "Product" }, structured, {
      unitTag: "Old",
    });
    expect(next.unchanged).toBe(false);
    expect(next.patch.unitTag).toBe("New");
    expect(next.patch.level).toBe("Product");
  });

  it("a fact that was stored and is now empty is null, not omitted", () => {
    const previousStructured = {
      stakeholders: [{ "a:unitTag": "FirstTimeUser" }],
    };
    const wire = specCardWire("value", {}, previousStructured, {});
    expect(wire.patch.stakeholders).toBeNull();
    expect(wire.unchanged).toBe(false);
  });
});
