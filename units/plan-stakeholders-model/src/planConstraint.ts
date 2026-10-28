// A Function Constraint or a Solution Constraint (DesignConstraint) names the person who requires it.
// "Under Person" is the stakeholder kind set's is-a walk from the root name Person. Nothing else is listed here.

import { typeLocalName } from "@kaigilb/gilbplatformcode-type-curie";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { typeKey as typeFacetKey } from "@kaigilb/gilbplatformcode-type-key";
import { kindDescendants, type StakeholderKindType, type StakeholderTypeSet } from "./kinds";
import { authoritiesOf, sameRecord, type LinkedStakeholder } from "./planStakeholders";

/** The only type name this rule hard-codes. Every kind under it comes from the master's set. */
export const PERSON_TYPE_NAME = "Person";

export const CONSTRAINT_AVOID =
  "Avoid constraints where you can: each one locks out options. Record one only when a named person requires it.";

export const CONSTRAINT_AUTHORITY_WHY = "A constraint's Authority is the named person who requires it.";

export const CONSTRAINT_UNLINKED =
  "The constraint was made, but its Authority was not linked: add it on the card.";

export const CONSTRAINT_LAST_PERSON =
  "A constraint needs the named person who requires it. Change the Type to Function instead, or add another Authority first.";

export const CONSTRAINT_WARNING =
  "This constraint names no Authority. Add the person who requires it, or change it to a Function.";

/** Shown on a picker hit that cannot be a constraint's Authority. */
export const NOT_A_PERSON = "not a person";

/** Function Constraint or Solution Constraint (`DesignConstraint`), under the Plan card's type key. */
export function isConstraintType(typeUriOrName: string | null | undefined): boolean {
  if (!typeUriOrName?.trim()) return false;
  const key = typeFacetKey(typeUriOrName);
  return key === typeFacetKey("FunctionConstraint") || key === typeFacetKey("DesignConstraint");
}

function asKindTypes(set: StakeholderTypeSet | null | undefined): StakeholderKindType[] {
  return (set?.types ?? []).map((t) => ({
    term: t.term,
    name: t.name,
    label: t.label,
    isMember: false,
    parents: [...(t.parents ?? [])],
    members: [],
  }));
}

/**
 * Person, plus every kind the set places under Person's term.
 * The set is missing, or Person has no term in it: only the root name. Descendants are not invented.
 */
export function personTypeNames(set: StakeholderTypeSet | null | undefined): string[] {
  const names = [PERSON_TYPE_NAME];
  const types = asKindTypes(set);
  const person = types.find((t) => t.name === PERSON_TYPE_NAME);
  if (!person?.term) return names;
  for (const d of kindDescendants({ types }, person.term)) {
    if (d.name && !names.includes(d.name)) names.push(d.name);
  }
  return names;
}

/** True when `typeUri` is Person or a kind under it in this set. A missing type is not a person. */
export function isPersonStakeholderType(
  typeUri: string | null | undefined,
  set: StakeholderTypeSet | null | undefined,
): boolean {
  if (!typeUri?.trim()) return false;
  return personTypeNames(set).includes(typeLocalName(typeUri));
}

/** Authority relations whose stakeholder record is a person. Text and an unknown type do not count. */
export function personAuthorities(
  rows: readonly RecordRelation[] | null | undefined,
  typeOf: (uri: string) => string | null,
  set: StakeholderTypeSet | null | undefined,
): LinkedStakeholder[] {
  return authoritiesOf(rows).filter((a) => isPersonStakeholderType(typeOf(a.uri), set));
}

/**
 * True when `uri` is the only person Authority, so removing it would leave the constraint with none.
 * A non-person, or one person among several, is not this case. An empty list is not.
 */
export function removingLastPersonAuthority(people: readonly { uri: string }[], uri: string): boolean {
  return people.length === 1 && people.some((p) => sameRecord(p.uri, uri));
}
