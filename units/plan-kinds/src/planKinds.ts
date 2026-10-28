import { typeKey as typeFacetKey } from "@kaigilb/gilbplatformcode-type-key";

/** The create order. `label` is the word the dialog shows; `typeName` is what the record stores.
 *  Solution Constraint is `t:DesignConstraint`. Development Resource is `t:Resource`. */
export const PLAN_CREATE_TYPES: readonly { readonly typeName: string; readonly label: string }[] = [
  { typeName: "Function", label: "Function" },
  { typeName: "FunctionConstraint", label: "Function Constraint" },
  { typeName: "Value", label: "Value" },
  { typeName: "Solution", label: "Solution" },
  { typeName: "DesignConstraint", label: "Solution Constraint" },
  { typeName: "Resource", label: "Development Resource" },
];

/** Every type the Plan list's type facet names, in the create order. */
export function planTypeNames(): readonly string[] {
  return PLAN_CREATE_TYPES.map((t) => t.typeName);
}

/** The types of the Plan menu's Solutions item: Solution and Solution Constraint (`t:DesignConstraint`). */
export function planSolutionTypeNames(): readonly string[] {
  return ["Solution", "DesignConstraint"];
}

/** The managed Plan card. A Value and a Development Resource use the same card (see PLAN_FORM_TYPE_NAMES). */
const PLAN_CARD_TYPE_NAMES = ["Function", "FunctionConstraint", "Solution", "DesignConstraint"] as const;

/** Types the managed Plan form edits. Value and Resource are here but not in PLAN_CARD_TYPE_NAMES: the ontology's field sets for
 *  the vocabulary read cover only the four above, and adding either there refuses the whole read until its field set exists.
 *  A Development Resource is the Value card with four changes (Budget for Goal, Business level, Resource Owner, its Type word). */
const PLAN_FORM_TYPE_NAMES = [...PLAN_CARD_TYPE_NAMES, "Value", "Resource"] as const;

/** True for a Development Resource (`t:Resource`). */
export function isResourceType(typeUri: string): boolean {
  return typeFacetKey(typeUri) === typeFacetKey("Resource");
}

/** True for the types that use the Value card: a Value and a Development Resource. The one gate for the card's behaviour. */
export function isValueCardType(typeUri: string): boolean {
  return typeFacetKey(typeUri) === typeFacetKey("Value") || isResourceType(typeUri);
}

/** One template line. The order is `planLinesFor`, not this list. */
export type PlanLineKey =
  | "description"
  | "type"
  | "stakeholder"
  | "authority"
  | "resourceOwner"
  | "partOf"
  | "subFunctions"
  | "level"
  | "meter"
  | "status"
  | "impacts"
  | "functionOfValue"
  | "solutions"
  | "gilbveda"
  | "solutionOf"
  | "partOfSystem"
  | "scale"
  | "scaleVariables"
  | "endpoint"
  | "valueMeters"
  | "valueLevels"
  | "valueGraph";

/** The word each Value-card line shows as its heading. */
export const PLAN_VALUE_LINE_LABELS: Readonly<Partial<Record<PlanLineKey, string>>> = {
  description: "Ambition Level",
  scale: "Scale",
  scaleVariables: "Qualifiers",
  endpoint: "Endpoint",
  valueMeters: "Meter",
  valueLevels: "Levels",
  valueGraph: "Illustration",
  functionOfValue: "Value of Function",
  resourceOwner: "Resource Owner",
};

const FUNCTION_LINES: readonly PlanLineKey[] = [
  "description",
  "stakeholder",
  "authority",
  "partOf",
  "subFunctions",
  "meter",
  "status",
  "functionOfValue",
  "solutions",
  "gilbveda",
];

const FUNCTION_CONSTRAINT_LINES: readonly PlanLineKey[] = [
  "description",
  "authority",
  "stakeholder",
  "partOf",
  "subFunctions",
  "meter",
  "status",
  "gilbveda",
];

const SOLUTION_LINES: readonly PlanLineKey[] = [
  "description",
  "stakeholder",
  "authority",
  "gilbveda",
  "meter",
  "status",
  "impacts",
  "solutionOf",
  "partOfSystem",
];

const DESIGN_CONSTRAINT_LINES: readonly PlanLineKey[] = [
  "description",
  "authority",
  "stakeholder",
  "gilbveda",
  "meter",
  "status",
  "impacts",
  "solutionOf",
  "partOfSystem",
];

const VALUE_LINES: readonly PlanLineKey[] = [
  "valueGraph",
  "scale",
  "endpoint",
  "scaleVariables",
  "valueLevels",
  "valueMeters",
  "stakeholder",
  "functionOfValue",
  "description",
  "authority",
  "gilbveda",
];

/** A Development Resource: the Value lines, no "Value of Function" (it is not a Value of a Function), Resource Owner before Stakeholder. */
const RESOURCE_LINES: readonly PlanLineKey[] = VALUE_LINES.filter((k) => k !== "functionOfValue").flatMap((k) =>
  k === "stakeholder" ? (["resourceOwner", k] as const) : [k],
);

/** The template's line order for this type. Compared under `typeFacetKey`. An unknown type uses the Function lines. */
export function planLinesFor(typeUri: string): readonly PlanLineKey[] {
  const key = typeFacetKey(typeUri);
  if (key === typeFacetKey("FunctionConstraint")) return FUNCTION_CONSTRAINT_LINES;
  if (key === typeFacetKey("DesignConstraint")) return DESIGN_CONSTRAINT_LINES;
  if (key === typeFacetKey("Solution")) return SOLUTION_LINES;
  if (key === typeFacetKey("Value")) return VALUE_LINES;
  if (key === typeFacetKey("Resource")) return RESOURCE_LINES;
  return FUNCTION_LINES;
}

/**
 * The level token a Solution shows before any `a:level` is stored.
 * Shown in the list only. The record is written when the person chooses.
 * A Value shows Product; a Development Resource shows Business. A Function has no preselect.
 */
export function planLevelDefault(typeUri: string): string | null {
  const key = typeFacetKey(typeUri);
  if (key === typeFacetKey("Solution") || key === typeFacetKey("DesignConstraint")) return "Solution";
  if (key === typeFacetKey("Value")) return "Product";
  if (key === typeFacetKey("Resource")) return "Business";
  return null;
}

/** The two types one Type line switches, and the words the line shows. */
export function planTypePair(typeUri: string): {
  plain: string;
  constraint: string;
  plainWord: string;
  constraintWord: string;
} {
  const key = typeFacetKey(typeUri);
  if (key === typeFacetKey("Solution") || key === typeFacetKey("DesignConstraint")) {
    return {
      plain: "Solution",
      constraint: "DesignConstraint",
      plainWord: "Solution",
      constraintWord: "Solution Constraint",
    };
  }
  return {
    plain: "Function",
    constraint: "FunctionConstraint",
    plainWord: "Function",
    constraintWord: "Function Constraint",
  };
}

/** The confirm sentence for a Type switch. The four Plan sentences are exact. */
export function planTypeChangeSentence(next: string): string {
  if (next === "FunctionConstraint") return "Change this Function to a Function Constraint?";
  if (next === "Function") return "Change this Function Constraint to a Function?";
  if (next === "DesignConstraint") return "Change this Solution to a Solution Constraint?";
  if (next === "Solution") return "Change this Solution Constraint to a Solution?";
  return "";
}

export function planCardTypeNames(): readonly string[] {
  return PLAN_CARD_TYPE_NAMES;
}

function typeIn(typeUri: string, names: readonly string[]): boolean {
  const key = typeFacetKey(typeUri);
  return names.some((name) => typeFacetKey(name) === key);
}

/** True when the managed Plan card edits this type. Compared under `typeFacetKey`. */
export function isPlanType(typeUri: string): boolean {
  return typeIn(typeUri, PLAN_FORM_TYPE_NAMES);
}

/** True for every type the Plan list holds. Create and save use this so a Tag is not copied into a label. */
export function isPlanRecordType(typeUri: string): boolean {
  return typeIn(typeUri, planTypeNames());
}

/** The Function template's line words and order, keyed by the attribute's local name. The card decorates; membership is the ontology's. */
export const PLAN_FIELD_ORDER = ["authority", "stakeholders", "concept", "ontologyTerm", "level", "body", "fvParent", "hasMeter", "levelStatements", "lineSources"] as const;
export const PLAN_FIELD_LABELS: Record<string, string> = {
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
};
/** Inherited from t/Intent on a Function Constraint; not template lines, not shown. */
export const PLAN_HIDDEN_FIELDS = new Set(["title", "about"]);

/** A line word that belongs to one type, not to every Plan card. Keyed by type name + slug. */
export const PLAN_TYPE_FIELD_LABELS: Record<string, Record<string, string>> = {
  Value: { measures: "Value of Function" },
};

/** The type-specific line word, or null when this type has no override for the slug. */
export function planTypeFieldLabel(typeUri: string, slug: string): string | null {
  for (const [typeName, labels] of Object.entries(PLAN_TYPE_FIELD_LABELS)) {
    if (typeFacetKey(typeUri) === typeFacetKey(typeName)) return labels[slug] ?? null;
  }
  return null;
}

/** Registry ids the Records "+ New" blank list must not grow to include. Plan's create dialog
 *  is the only place that offers them. */
export const PLAN_ONLY_TYPE_IDS: ReadonlySet<string> = new Set([
  "function",
  "functionConstraint",
  "value",
  "solution",
  "designConstraint",
  "resource",
]);
