// One t:ImpactOn relation per (Solution, Value) or (Solution, Resource).
// The numbers live on the relation. Neither end stores them.

import { memberValue, type PlanSourceValue } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { roleIs } from "@kaigilb/gilbplatformcode-relation-role";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { typeLocalName } from "@kaigilb/gilbplatformcode-type-curie";

export const IMPACT_ON_TYPE = "t:ImpactOn";
export const IMPACT_SOLUTION_ROLE = "role:solution";
export const IMPACT_VALUE_ROLE = "role:value";
export const IMPACT_RESOURCE_ROLE = "role:resource";
export const IMPACT_RELATION_TYPE = "value-estimation";
/** The pinned separator: space, U+2192, space. A VDT splits on this. */
export const IMPACT_ARROW = " \u2192 ";

export type ImpactTargetRole = typeof IMPACT_VALUE_ROLE | typeof IMPACT_RESOURCE_ROLE;
export type ImpactBasis = "estimate" | "measured";

export type ImpactLink = {
  relation: string;
  targetUri: string;
  targetRole: ImpactTargetRole;
};

export type ImpactStored = {
  role: ImpactTargetRole;
  /** The relation's `a:valueEstimate`, in whichever spelling the vault stored. */
  valueEstimate: unknown;
  /** The relation's `a:resourceDraw`, as stored (ASCII sign). */
  resourceDraw: string;
  unit: string;
  basis: ImpactBasis;
  source: PlanSourceValue;
};

export type ImpactCommit = {
  role: ImpactTargetRole;
  valueEstimate: string;
  resourceDraw: string;
  unit: string;
  basis: ImpactBasis;
};

const PINNED_VALUE = /^(?:unmeasured|-?\d+(?:\.\d+)?) \u2192 -?\d+(?:\.\d+)?$/;

function isImpactOn(row: RecordRelation): boolean {
  return typeLocalName(row.type ?? "") === "ImpactOn";
}

/** Impacts of this Solution: t:ImpactOn where this record's role is role:solution. */
export function impactsOnSolution(rows: readonly RecordRelation[] | null | undefined): ImpactLink[] {
  const out: ImpactLink[] = [];
  for (const row of rows ?? []) {
    if (!isImpactOn(row) || !roleIs(row.role, "solution")) continue;
    for (const member of row.members ?? []) {
      if (!member.member.trim()) continue;
      // The stored role stays the prefixed constant, even when the vault served the bare slug.
      const targetRole = roleIs(member.role, "value")
        ? IMPACT_VALUE_ROLE
        : roleIs(member.role, "resource")
          ? IMPACT_RESOURCE_ROLE
          : null;
      if (!targetRole) continue;
      out.push({ relation: row.relation, targetUri: member.member, targetRole });
    }
  }
  return out;
}

/** Values first, then Resources. Each side by tag. */
export function sortImpacts(links: readonly ImpactLink[], tagOf: (uri: string) => string): ImpactLink[] {
  const rank = (link: ImpactLink) => (link.targetRole === IMPACT_VALUE_ROLE ? 0 : 1);
  return [...links].sort((a, b) => {
    const byRole = rank(a) - rank(b);
    if (byRole !== 0) return byRole;
    const byTag = tagOf(a.targetUri).localeCompare(tagOf(b.targetUri));
    return byTag !== 0 ? byTag : a.targetUri.localeCompare(b.targetUri);
  });
}

/**
 * How `a:valueEstimate` is shown.
 * A pinned `"3 → 0.2"` is that string. A free string is that string.
 * An object (`{level, unit, confidence}` or any other) is compact JSON, key order as stored.
 */
export function valueEstimateShown(raw: unknown): { text: string; pinned: boolean } {
  if (typeof raw === "string") return { text: raw, pinned: PINNED_VALUE.test(raw.trim()) };
  if (typeof raw === "number" || typeof raw === "boolean") return { text: String(raw), pinned: false };
  if (raw && typeof raw === "object") return { text: JSON.stringify(raw), pinned: false };
  return { text: "", pinned: false };
}

/** The amount the card shows. A leading ASCII "-" is U+2212. A leading "+" stays. */
export function resourceDrawShown(stored: string): string {
  if (stored.startsWith("-")) return `\u2212${stored.slice(1)}`;
  return stored;
}

/** The numbers button's words, without the basis. The unit is appended only for the pinned form and for a resource. */
export function impactNumbersText(stored: ImpactStored): string {
  if (stored.role === IMPACT_RESOURCE_ROLE) {
    const amount = resourceDrawShown(stored.resourceDraw);
    return stored.unit ? `${amount} ${stored.unit}` : amount;
  }
  const shown = valueEstimateShown(stored.valueEstimate);
  if (!shown.pinned) return shown.text;
  const text = shown.text.trim();
  return stored.unit ? `${text} ${stored.unit}` : text;
}

function normalizeNumberText(raw: string): string {
  return raw.trim().replace(/\u2212/g, "-").replace(/,/g, ".");
}

/** A Value side. `unmeasured` only as itself. A leading "+" is dropped. "," is stored as ".". */
export function parseValueSide(raw: string): string | null {
  if (raw.trim() === "unmeasured") return "unmeasured";
  const t = normalizeNumberText(raw).replace(/^\+/, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(t)) return null;
  return t;
}

/** A Resource amount. A sign is required. "−" and "-" are minus. "," is stored as ".". */
export function parseAmount(raw: string): string | null {
  const t = normalizeNumberText(raw);
  if (!/^[+-]\d+(?:\.\d+)?$/.test(t)) return null;
  return t;
}

export function parseImpactFields(
  role: ImpactTargetRole,
  fields: { status: string; expected: string; amount: string; unit: string; basis: ImpactBasis },
): ImpactCommit | null {
  if (role === IMPACT_VALUE_ROLE) {
    const status = parseValueSide(fields.status);
    const expected = parseValueSide(fields.expected);
    if (status == null || expected == null || expected === "unmeasured") return null;
    return {
      role,
      valueEstimate: `${status}${IMPACT_ARROW}${expected}`,
      resourceDraw: "",
      unit: fields.unit.trim(),
      basis: fields.basis,
    };
  }
  const amount = parseAmount(fields.amount);
  if (amount == null) return null;
  return { role, valueEstimate: "", resourceDraw: amount, unit: fields.unit.trim(), basis: fields.basis };
}

export function splitPinned(text: string): { status: string; expected: string } | null {
  const t = text.trim();
  if (!PINNED_VALUE.test(t)) return null;
  const i = t.indexOf(IMPACT_ARROW);
  if (i < 0) return null;
  return { status: t.slice(0, i), expected: t.slice(i + IMPACT_ARROW.length) };
}

export function sameImpact(prev: ImpactStored, next: ImpactCommit): boolean {
  if (prev.basis !== next.basis || prev.unit !== next.unit || prev.role !== next.role) return false;
  if (next.role === IMPACT_VALUE_ROLE) return prev.valueEstimate === next.valueEstimate;
  return prev.resourceDraw === next.resourceDraw;
}

function refUri(raw: unknown): string | null {
  if (typeof raw === "string" && (raw.startsWith("http") || raw.startsWith("urn:"))) return raw.trim();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const id = (raw as { "@id"?: unknown })["@id"];
    if (typeof id === "string" && (id.startsWith("http") || id.startsWith("urn:"))) return id.trim();
  }
  return null;
}

export function sourceFromImpactFacts(facts: Record<string, unknown>): PlanSourceValue {
  const out: PlanSourceValue = {};
  const stated = refUri(memberValue(facts, "statedBy"));
  const derived = refUri(memberValue(facts, "derivedFrom"));
  const text = memberValue(facts, "source");
  if (stated) out.statedBy = stated;
  if (derived) out.derivedFrom = derived;
  if (typeof text === "string" && text.trim()) out.text = text.trim();
  return out;
}

export function sourceToImpactFacts(source: PlanSourceValue): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (source.statedBy) out["a:statedBy"] = { "@id": source.statedBy };
  if (source.derivedFrom) out["a:derivedFrom"] = { "@id": source.derivedFrom };
  if (source.text) out["a:source"] = source.text;
  return out;
}

export function factsFromExtras(extras: Record<string, unknown>, role: ImpactTargetRole): ImpactStored {
  const basisRaw = memberValue(extras, "impactBasis");
  const basis: ImpactBasis = basisRaw === "measured" ? "measured" : "estimate";
  const unitRaw = memberValue(extras, "unit");
  const unit = typeof unitRaw === "string" ? unitRaw : "";
  const draw = memberValue(extras, "resourceDraw");
  return {
    role,
    valueEstimate: memberValue(extras, "valueEstimate"),
    resourceDraw: typeof draw === "string" ? draw : typeof draw === "number" ? String(draw) : "",
    unit,
    basis,
    source: sourceFromImpactFacts(extras),
  };
}

/** The relation's extra facts. Roles are not here. Never `a:impactEstimates`. */
export function impactExtraFacts(stored: ImpactStored | ImpactCommit, source: PlanSourceValue): Record<string, unknown> {
  const out: Record<string, unknown> = {
    "a:relationType": IMPACT_RELATION_TYPE,
    "a:unit": stored.unit,
    "a:impactBasis": stored.basis,
    ...sourceToImpactFacts(source),
  };
  if (stored.role === IMPACT_VALUE_ROLE) out["a:valueEstimate"] = stored.valueEstimate;
  else out["a:resourceDraw"] = stored.resourceDraw;
  return out;
}

function unitOfScale(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const unit = memberValue(raw as Record<string, unknown>, "unit");
  return typeof unit === "string" ? unit.trim() : "";
}

/**
 * The target's Scale unit, for the Unit box of a new impact.
 * Read from the served `scale` object (`a:unit`, else `unit`), which is `a:scale` before the editor flattens it.
 * If that fact is only a string, it is parsed as JSON. A scale that is only `{"@id"}` has no unit here, so this is empty.
 * A top-level `a:unit` on the Value or Resource is not the scale's unit and is not read.
 */
function scaleRaw(bag: Readonly<Record<string, unknown>> | Record<string, string> | null | undefined): unknown {
  if (!bag) return undefined;
  if (Object.prototype.hasOwnProperty.call(bag, "scale")) return bag.scale;
  return memberValue(bag as Record<string, unknown>, "scale");
}

function unitFromScaleRaw(raw: unknown): string {
  if (raw && typeof raw === "object") return unitOfScale(raw);
  if (typeof raw !== "string") return "";
  const text = raw.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return "";
  try {
    return unitOfScale(JSON.parse(text) as unknown);
  } catch {
    return "";
  }
}

export function scaleUnitOf(record: {
  facts: Record<string, string>;
  served?: { facts?: Readonly<Record<string, unknown>> } | null;
}): string {
  const fromServed = unitFromScaleRaw(scaleRaw(record.served?.facts));
  if (fromServed) return fromServed;
  return unitFromScaleRaw(scaleRaw(record.facts));
}
