/**
 * Which stored type a Value, Function, or Solution card is, and the reverse.
 *
 * The words in `SPEC_LEVELS` and `SPEC_DELIVERY_STATES` are the words the
 * form offers. They are not checked by these functions. A level that is not
 * in the list is still a level if you write it. Do not treat the list as a
 * validator, and do not add a word here that the form does not offer.
 */

export type SpecCardKind = "value" | "function" | "solution";

export const SPEC_LEVELS = [
  "Business",
  "Stakeholder",
  "Product",
  "Solution",
  "ValueDeliveryStep",
  "To-Do",
] as const;

export const SPEC_DELIVERY_STATES = ["Planned", "Developed", "In-Production", "Retired"] as const;

/**
 * The type name to store.
 *
 * `form.constraint` trimmed equal to `"yes"` turns a function into
 * `FunctionConstraint` and a solution into `Constraint`. Any other text,
 * including `"Yes"` and `"true"`, leaves the plain type.
 *
 * A value is always `Value`. The constraint flag does not change it.
 */
export function specCardStoredType(kind: SpecCardKind, form: Record<string, string>): string {
  const on = (form.constraint ?? "").trim() === "yes";
  if (kind === "function") return on ? "FunctionConstraint" : "Function";
  if (kind === "solution") return on ? "Constraint" : "Solution";
  return "Value";
}

/** True only for the two constraint type names. `Function` and `Solution` are false. */
export function specCardConstraintOn(typeName: string | null | undefined): boolean {
  return typeName === "FunctionConstraint" || typeName === "Constraint";
}

/**
 * The form kind for a stored type name.
 *
 * `Function` and `FunctionConstraint` are `function`. `Solution` and
 * `Constraint` are `solution`. `Value` is `value`. Anything else, including
 * a different capitalisation, is null. Null means "this card form does not
 * edit that type". It does not mean the type is missing.
 */
export function specCardKindOfTypeName(typeName: string | null | undefined): SpecCardKind | null {
  switch (typeName) {
    case "Value":
      return "value";
    case "Function":
    case "FunctionConstraint":
      return "function";
    case "Solution":
    case "Constraint":
      return "solution";
    default:
      return null;
  }
}

/**
 * The form kind for a type address or a `t:Name`.
 *
 * The last `/` segment is taken. One leading `t:` is removed. That name is
 * then `specCardKindOfTypeName`. No slash: the whole string, with one
 * leading `t:` removed.
 *
 * This is not `type-curie` and not `type-name`. A host segment is discarded
 * only as "the last path piece". `/base/t/Function` works because the last
 * piece is `Function`.
 */
export function specCardKindOfTypeUri(typeUri: string | null | undefined): SpecCardKind | null {
  if (!typeUri) return null;
  const name = typeUri.split("/").pop() ?? typeUri;
  return specCardKindOfTypeName(name.replace(/^t:/, ""));
}
