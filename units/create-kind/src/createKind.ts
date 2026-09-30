/**
 * Which create-list a stored node kind belongs on.
 *
 * This is not the browse-kind unit. Browse-kind reads a whole document and
 * calls a relation a type. This unit reads one node-kind string. Relation,
 * attribute, and scale return null, meaning "do not offer this as something
 * to create".
 *
 * This is not the type-plane unit. Type-plane classifies a term for a graph.
 * An empty node kind there is not the same question as an empty node kind here.
 * Here, empty means a Thing.
 */

/** What a create list can show. `type` is a Thing. */
export type TypeOptionKind = "type" | "function" | "value";

/** The four create lists. `things` is only `type`. `all` is every kind. */
export type CreatePlane = "things" | "function" | "value" | "all";

/**
 * Map one `a:nodeKind` string onto a create-list kind.
 *
 * The string is trimmed and lowercased. `function` and `value` are themselves.
 * `relation`, `attribute`, and `scale` are null. Every other string, including
 * `""`, `type`, `entity`, and `relations`, is `type`.
 * Null and undefined are `type`, not null.
 */
export function kindFromNodeKind(nodeKind: string | undefined | null): TypeOptionKind | null {
  const k = (nodeKind ?? "").trim().toLowerCase();
  if (k === "function") return "function";
  if (k === "value") return "value";
  if (k === "relation" || k === "attribute" || k === "scale") return null;
  return "type";
}

/**
 * Whether a kind is on the list the person opened.
 *
 * `all` keeps every kind. `things` keeps only `type`.
 * `function` keeps only `function`. `value` keeps only `value`.
 */
export function optionMatchesPlane(kind: TypeOptionKind, plane: CreatePlane): boolean {
  if (plane === "all") return true;
  if (plane === "things") return kind === "type";
  return kind === plane;
}
