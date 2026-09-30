/**
 * Which plane a term sits on, from facts the host already holds.
 *
 * First match wins. Do not add `a:providesFunction` to the function test.
 * That fact is on a complete type, including a rule, and keying on it
 * would call a thing a function.
 */

/** The five planes. A term is exactly one of these. */
export type TypePlane = "entity" | "function" | "relation" | "attribute" | "value";

/**
 * A plane, or the word for a census name whose term document was not there.
 * `uncatalogued` is not a sixth plane of a term that was read.
 */
export type IssuedPlane = TypePlane | "uncatalogued";

/** Facts only a value or a scale carries. Presence is enough. The value is not read. */
const VALUE_MARKERS = [
  "a:measures",
  "a:valuedBy",
  "a:scale",
  "a:unit",
  "a:scaleAnchors",
  "a:meter",
  "a:hasMeter",
  "a:endpointSubject",
  "a:endpointReference",
] as const;

/**
 * True when `a:predicateAttribute` NAMES an attribute (`a:` or `skos:`).
 * The key being present is not enough. A type can carry this fact with a
 * `t:` value and still be a thing you can make a record of.
 */
function bindsAttributePredicate(term: Record<string, unknown>): boolean {
  const value = term["a:predicateAttribute"];
  const spelled =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "@id" in value
        ? String((value as { "@id": unknown })["@id"] ?? "")
        : "";
  return spelled.startsWith("a:") || spelled.startsWith("skos:");
}

/**
 * Classify one term.
 *
 * `ancestors` is the parent chain the host already walked, each item an
 * address. This function does not walk, and it does not fetch. An empty
 * list means "no parents were handed in", which is not the same claim as
 * "this term has no parents".
 *
 * Order, and it is fixed:
 * 1. relation — kind `relation`, or `a:isRelationPredicate` exactly `true`,
 *    or an address ending in `/base/t/Relation`
 * 2. attribute — kind `attribute`, or an attribute predicate, or an address
 *    ending in `/base/t/Identity`
 * 3. value — kind `value`, or any value-marker key present (even when the
 *    value is null)
 * 4. function — kind `function`, or `a:verb` present (even when null), or
 *    an address ending in `/base/t/Function`
 * 5. entity — everything else
 */
export function classifyPlane(
  term: Record<string, unknown>,
  ancestors: readonly string[] = [],
): TypePlane {
  const kind = typeof term["a:nodeKind"] === "string" ? term["a:nodeKind"] : "";
  const endsWith = (tail: string) =>
    ancestors.some((address) => address.endsWith(`/base/t/${tail}`)) ||
    String(term["@id"] ?? "").endsWith(`/base/t/${tail}`);

  if (kind === "relation" || term["a:isRelationPredicate"] === true || endsWith("Relation")) {
    return "relation";
  }
  if (kind === "attribute" || bindsAttributePredicate(term) || endsWith("Identity")) {
    return "attribute";
  }
  if (kind === "value" || VALUE_MARKERS.some((key) => term[key] !== undefined)) return "value";
  if (kind === "function" || term["a:verb"] !== undefined || endsWith("Function")) return "function";
  return "entity";
}

/**
 * The planes a create surface may offer: entity, function, value.
 * Relation and attribute are not create planes.
 */
export function isCreatePlane(plane: TypePlane): boolean {
  return plane === "entity" || plane === "function" || plane === "value";
}

/**
 * Whether a census name is issued on a type find.
 * Undefined is not issued. `uncatalogued` is issued. A create plane is issued.
 * Relation and attribute are not.
 */
export function isIssuedOnTypeFind(plane: IssuedPlane | undefined): boolean {
  if (plane === undefined) return false;
  return plane === "uncatalogued" || plane === "entity" || plane === "function" || plane === "value";
}
