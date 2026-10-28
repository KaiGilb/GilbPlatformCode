import { afterEach, describe, expect, test } from "vitest";
import { resetTypeKey, setTypeKey } from "@kaigilb/gilbplatformcode-type-key";
import {
  PLAN_CREATE_TYPES,
  PLAN_FIELD_LABELS,
  PLAN_FIELD_ORDER,
  PLAN_HIDDEN_FIELDS,
  PLAN_ONLY_TYPE_IDS,
  PLAN_TYPE_FIELD_LABELS,
  PLAN_VALUE_LINE_LABELS,
  isPlanRecordType,
  isPlanType,
  isResourceType,
  isValueCardType,
  planCardTypeNames,
  planLevelDefault,
  planLinesFor,
  planSolutionTypeNames,
  planTypeChangeSentence,
  planTypeFieldLabel,
  planTypeNames,
  planTypePair,
  type PlanLineKey,
} from "./planKinds";

afterEach(() => resetTypeKey());

const HOST = "https://ontology.example.test/base/t/";

// The card draws each line as a group with a name of its own. The line orders below are the group orders
// that the card's tests assert, written in the card's group names; this table turns a line key into its group.
// The Type / Level / Version group ("plan-type-level") comes first on every card and is in no type's line list.
const GROUP: Record<PlanLineKey, string> = {
  description: "plan-description",
  type: "(never drawn)",
  stakeholder: "plan-stakeholder",
  authority: "plan-authority",
  resourceOwner: "plan-resource-owner",
  partOf: "plan-part-of",
  subFunctions: "plan-sub-functions",
  level: "(never drawn)",
  meter: "plan-meter",
  status: "plan-status",
  impacts: "plan-impacts",
  functionOfValue: "plan-function-of-value",
  solutions: "plan-solutions",
  gilbveda: "plan-type",
  solutionOf: "plan-solution-of",
  partOfSystem: "plan-part-of-system",
  scale: "plan-scale",
  scaleVariables: "plan-scale-variables",
  endpoint: "plan-endpoint",
  valueMeters: "plan-value-meters",
  valueLevels: "plan-value-levels",
  valueGraph: "plan-picture",
};
const groupsFor = (type: string) => ["plan-type-level", ...planLinesFor(type).map((k) => GROUP[k])];

const FUNCTION_ORDER = [
  "plan-type-level",
  "plan-description",
  "plan-stakeholder",
  "plan-authority",
  "plan-part-of",
  "plan-sub-functions",
  "plan-meter",
  "plan-status",
  "plan-function-of-value",
  "plan-solutions",
  "plan-type",
];

const CONSTRAINT_ORDER = [
  "plan-type-level",
  "plan-description",
  "plan-authority",
  "plan-stakeholder",
  "plan-part-of",
  "plan-sub-functions",
  "plan-meter",
  "plan-status",
  "plan-type",
];

const SOLUTION_ORDER = [
  "plan-type-level",
  "plan-description",
  "plan-stakeholder",
  "plan-authority",
  "plan-type",
  "plan-meter",
  "plan-status",
  "plan-impacts",
  "plan-solution-of",
  "plan-part-of-system",
];

const DESIGN_CONSTRAINT_ORDER = [
  "plan-type-level",
  "plan-description",
  "plan-authority",
  "plan-stakeholder",
  "plan-type",
  "plan-meter",
  "plan-status",
  "plan-impacts",
  "plan-solution-of",
  "plan-part-of-system",
];

const RESOURCE_ORDER = [
  "plan-type-level",
  "plan-picture",
  "plan-scale",
  "plan-endpoint",
  "plan-scale-variables",
  "plan-value-levels",
  "plan-value-meters",
  "plan-resource-owner",
  "plan-stakeholder",
  "plan-description",
  "plan-authority",
  "plan-type",
];

describe("planLinesFor: the line order of each type", () => {
  test("a Function", () => expect(groupsFor("t:Function")).toEqual(FUNCTION_ORDER));
  test("a Function Constraint", () => expect(groupsFor("t:FunctionConstraint")).toEqual(CONSTRAINT_ORDER));
  test("a Solution", () => expect(groupsFor("t:Solution")).toEqual(SOLUTION_ORDER));
  test("a Solution Constraint (t:DesignConstraint)", () => expect(groupsFor("t:DesignConstraint")).toEqual(DESIGN_CONSTRAINT_ORDER));
  test("a Development Resource: the Value lines, no Value of Function, Resource Owner just before Stakeholder", () => {
    expect(groupsFor("t:Resource")).toEqual(RESOURCE_ORDER);
  });

  test("the keys themselves, per type", () => {
    expect(planLinesFor("t:Function")).toEqual([
      "description", "stakeholder", "authority", "partOf", "subFunctions", "meter", "status", "functionOfValue", "solutions", "gilbveda",
    ]);
    expect(planLinesFor("t:FunctionConstraint")).toEqual([
      "description", "authority", "stakeholder", "partOf", "subFunctions", "meter", "status", "gilbveda",
    ]);
    expect(planLinesFor("t:Solution")).toEqual([
      "description", "stakeholder", "authority", "gilbveda", "meter", "status", "impacts", "solutionOf", "partOfSystem",
    ]);
    expect(planLinesFor("t:DesignConstraint")).toEqual([
      "description", "authority", "stakeholder", "gilbveda", "meter", "status", "impacts", "solutionOf", "partOfSystem",
    ]);
    expect(planLinesFor("t:Value")).toEqual([
      "valueGraph", "scale", "endpoint", "scaleVariables", "valueLevels", "valueMeters", "stakeholder", "functionOfValue", "description", "authority", "gilbveda",
    ]);
    expect(planLinesFor("t:Resource")).toEqual([
      "valueGraph", "scale", "endpoint", "scaleVariables", "valueLevels", "valueMeters", "resourceOwner", "stakeholder", "description", "authority", "gilbveda",
    ]);
  });

  test("a Value keeps Value of Function and has no Resource Owner; a Resource is the reverse", () => {
    expect(planLinesFor("t:Value")).toContain("functionOfValue");
    expect(planLinesFor("t:Value")).not.toContain("resourceOwner");
    expect(planLinesFor("t:Resource")).not.toContain("functionOfValue");
    expect(planLinesFor("t:Resource")).toContain("resourceOwner");
    const i = planLinesFor("t:Resource").indexOf("resourceOwner");
    expect(planLinesFor("t:Resource")[i + 1]).toBe("stakeholder");
  });

  test("an unknown type, an empty type and a Note use the Function lines", () => {
    for (const t of ["t:Note", "", "https://ontology.example.test/base/t/Whatever", "Whatever"]) {
      expect(planLinesFor(t)).toEqual(planLinesFor("t:Function"));
    }
  });

  test("the same type in any spelling gives the same lines", () => {
    for (const t of ["Resource", "t:Resource", "t:resource", `${HOST}Resource`, "http://other.example.test/base/t/RESOURCE"]) {
      expect(planLinesFor(t)).toEqual(planLinesFor("t:Resource"));
    }
    expect(planLinesFor("t:functionconstraint")).toEqual(planLinesFor("t:FunctionConstraint"));
  });

  test("it returns the same list each time (a shared constant)", () => {
    expect(planLinesFor("t:Solution")).toBe(planLinesFor("Solution"));
  });

  test("no line is listed twice in any type", () => {
    for (const t of ["t:Function", "t:FunctionConstraint", "t:Solution", "t:DesignConstraint", "t:Value", "t:Resource"]) {
      const lines = planLinesFor(t);
      expect(new Set(lines).size).toBe(lines.length);
    }
  });
});

describe("isResourceType / isValueCardType", () => {
  test("a Resource in any spelling of the type; not a Value or another Plan type", () => {
    expect(isResourceType("t:Resource")).toBe(true);
    expect(isResourceType("Resource")).toBe(true);
    expect(isResourceType(`${HOST}Resource`)).toBe(true);
    expect(isResourceType("t:Value")).toBe(false);
    expect(isResourceType("t:Function")).toBe(false);
    expect(isResourceType("")).toBe(false);
    expect(isResourceType("t:Resources")).toBe(false);
  });

  test("the Value card is for a Value and a Resource, in any spelling, and for no other type", () => {
    expect(isValueCardType("t:Value")).toBe(true);
    expect(isValueCardType("t:Resource")).toBe(true);
    expect(isValueCardType("https://ontology.example.test/base/t/Resource")).toBe(true);
    expect(isValueCardType(`${HOST}Value`)).toBe(true);
    for (const t of ["t:Function", "t:FunctionConstraint", "t:Solution", "t:DesignConstraint", "t:Note", ""]) {
      expect(isValueCardType(t)).toBe(false);
    }
  });

  test("they use the type-key peer: a host that swaps the key changes the answer", () => {
    setTypeKey((id) => (id.toLowerCase().includes("asset") ? "resource" : id.toLowerCase().replace(/^t:/, "")));
    expect(isResourceType("t:Asset")).toBe(true);
    expect(isValueCardType("t:Asset")).toBe(true);
    expect(planLinesFor("t:Asset")).toEqual(planLinesFor("t:Resource"));
    resetTypeKey();
    expect(isResourceType("t:Asset")).toBe(false);
  });
});

describe("PLAN_CREATE_TYPES / planTypeNames / planSolutionTypeNames", () => {
  test("the create order, the dialog word and the stored type name", () => {
    expect(PLAN_CREATE_TYPES).toEqual([
      { typeName: "Function", label: "Function" },
      { typeName: "FunctionConstraint", label: "Function Constraint" },
      { typeName: "Value", label: "Value" },
      { typeName: "Solution", label: "Solution" },
      { typeName: "DesignConstraint", label: "Solution Constraint" },
      { typeName: "Resource", label: "Development Resource" },
    ]);
  });
  test("planTypeNames is the type names in that order", () => {
    expect(planTypeNames()).toEqual(["Function", "FunctionConstraint", "Value", "Solution", "DesignConstraint", "Resource"]);
  });
  test("the Solutions item holds Solution and Solution Constraint", () => {
    expect(planSolutionTypeNames()).toEqual(["Solution", "DesignConstraint"]);
  });
});

describe("planCardTypeNames / isPlanType / isPlanRecordType", () => {
  test("the managed card names four types; a Value and a Resource are not among them", () => {
    expect(planCardTypeNames()).toEqual(["Function", "FunctionConstraint", "Solution", "DesignConstraint"]);
    expect(planCardTypeNames()).not.toContain("Value");
    expect(planCardTypeNames()).not.toContain("Resource");
  });
  test("isPlanType is true for the four, a Value and a Resource, in any spelling", () => {
    for (const t of ["t:Function", "t:FunctionConstraint", "t:Solution", "t:DesignConstraint", "t:Value", "t:Resource", "Resource", `${HOST}Resource`, "t:resource"]) {
      expect(isPlanType(t)).toBe(true);
    }
    for (const t of ["t:Note", "t:Scale", "", "t:Tag"]) expect(isPlanType(t)).toBe(false);
  });
  test("isPlanRecordType is true for every type the Plan list holds", () => {
    for (const name of planTypeNames()) expect(isPlanRecordType(`t:${name}`)).toBe(true);
    for (const t of ["t:Note", "t:Scale", "", "t:Tag"]) expect(isPlanRecordType(t)).toBe(false);
  });
  test("both answers use the type-key peer", () => {
    setTypeKey((id) => (id === "t:Asset" ? "resource" : id.toLowerCase().replace(/^t:/, "")));
    expect(isPlanType("t:Asset")).toBe(true);
    expect(isPlanRecordType("t:Asset")).toBe(true);
  });
});

describe("planLevelDefault", () => {
  test("Solution and Solution Constraint show Solution, a Value Product, a Development Resource Business", () => {
    expect(planLevelDefault("t:Solution")).toBe("Solution");
    expect(planLevelDefault("t:DesignConstraint")).toBe("Solution");
    expect(planLevelDefault("t:Value")).toBe("Product");
    expect(planLevelDefault("t:Resource")).toBe("Business");
    expect(planLevelDefault(`${HOST}Resource`)).toBe("Business");
  });
  test("a Function, a Function Constraint, an unknown type and the empty type have no preselect", () => {
    for (const t of ["t:Function", "t:FunctionConstraint", "t:Note", ""]) expect(planLevelDefault(t)).toBeNull();
  });
});

describe("planTypePair / planTypeChangeSentence", () => {
  test("a Solution or a Solution Constraint switches between Solution and DesignConstraint", () => {
    const want = { plain: "Solution", constraint: "DesignConstraint", plainWord: "Solution", constraintWord: "Solution Constraint" };
    expect(planTypePair("t:Solution")).toEqual(want);
    expect(planTypePair("t:DesignConstraint")).toEqual(want);
  });
  test("every other type, a Value and a Resource included, gets the Function pair", () => {
    const want = { plain: "Function", constraint: "FunctionConstraint", plainWord: "Function", constraintWord: "Function Constraint" };
    for (const t of ["t:Function", "t:FunctionConstraint", "t:Value", "t:Resource", "t:Note", ""]) expect(planTypePair(t)).toEqual(want);
  });
  test("the four confirm sentences are exact; anything else is the empty text", () => {
    expect(planTypeChangeSentence("FunctionConstraint")).toBe("Change this Function to a Function Constraint?");
    expect(planTypeChangeSentence("Function")).toBe("Change this Function Constraint to a Function?");
    expect(planTypeChangeSentence("DesignConstraint")).toBe("Change this Solution to a Solution Constraint?");
    expect(planTypeChangeSentence("Solution")).toBe("Change this Solution Constraint to a Solution?");
    for (const x of ["Value", "Resource", "", "t:Function", "function"]) expect(planTypeChangeSentence(x)).toBe("");
  });
});

describe("the words of the lines", () => {
  test("PLAN_VALUE_LINE_LABELS is the heading of each Value-card line", () => {
    expect(PLAN_VALUE_LINE_LABELS).toEqual({
      description: "Ambition Level",
      scale: "Scale",
      scaleVariables: "Qualifiers",
      endpoint: "Endpoint",
      valueMeters: "Meter",
      valueLevels: "Levels",
      valueGraph: "Illustration",
      functionOfValue: "Value of Function",
      resourceOwner: "Resource Owner",
    });
  });

  test("PLAN_FIELD_ORDER and PLAN_FIELD_LABELS", () => {
    expect(PLAN_FIELD_ORDER).toEqual([
      "authority", "stakeholders", "concept", "ontologyTerm", "level", "body", "fvParent", "hasMeter", "levelStatements", "lineSources",
    ]);
    expect(PLAN_FIELD_LABELS).toEqual({
      unitTag: "Tag",
      authority: "Authority",
      stakeholders: "Stakeholder",
      concept: "Earlier note",
      ontologyTerm: "Type",
      level: "Level",
      body: "Description",
      fvParent: "Part of",
      hasMeter: "Meter",
      levelStatements: "Status",
      lineSources: "Sources",
    });
    for (const k of PLAN_FIELD_ORDER) expect(PLAN_FIELD_LABELS[k]).toBeTruthy();
  });

  test("PLAN_HIDDEN_FIELDS holds title and about", () => {
    expect([...PLAN_HIDDEN_FIELDS].sort()).toEqual(["about", "title"]);
  });

  test("PLAN_TYPE_FIELD_LABELS and planTypeFieldLabel: only a Value calls `measures` Value of Function", () => {
    expect(PLAN_TYPE_FIELD_LABELS).toEqual({ Value: { measures: "Value of Function" } });
    expect(planTypeFieldLabel("t:Value", "measures")).toBe("Value of Function");
    expect(planTypeFieldLabel(`${HOST}Value`, "measures")).toBe("Value of Function");
    expect(planTypeFieldLabel("t:Value", "other")).toBeNull();
    expect(planTypeFieldLabel("t:Function", "measures")).toBeNull();
    expect(planTypeFieldLabel("t:Resource", "measures")).toBeNull();
    expect(planTypeFieldLabel("", "measures")).toBeNull();
  });

  test("a slug that is an inherited object name is read from the prototype, not refused: a kept oddity", () => {
    expect(planTypeFieldLabel("t:Value", "constructor")).toBe(Object);
    expect(typeof planTypeFieldLabel("t:Value", "toString")).toBe("function");
  });
});

describe("PLAN_ONLY_TYPE_IDS", () => {
  test("the registry ids the Records `+ New` list must not grow to include", () => {
    expect([...PLAN_ONLY_TYPE_IDS].sort()).toEqual(["designConstraint", "function", "functionConstraint", "resource", "solution", "value"]);
    expect(PLAN_ONLY_TYPE_IDS.has("resource")).toBe(true);
    expect(PLAN_ONLY_TYPE_IDS.has("Resource")).toBe(false);
  });
});
