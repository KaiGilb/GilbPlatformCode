/**
 * Type, function, or value, from a term document the host already read.
 *
 * This is not the create-kind unit. Create-kind returns null for relation,
 * attribute, and scale. This unit has no relation answer. A relation document
 * is `type` here.
 *
 * This is not the type-plane unit. Type-plane can answer relation or attribute
 * from flags and from the address. This unit reads `a:nodeKind`, then `nodeKind`,
 * then `@type`, and everything else is `type`.
 */

/** The three badges a browser column uses. Relation is not one of them. */
export type OntologyKind = "type" | "function" | "value";

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * The kind of one document.
 *
 * `a:nodeKind` is tried before `nodeKind`. The first string that is not empty
 * after trim wins, then it is lowercased. `function` and `value` return those.
 * Any other node kind, including `relation`, falls through to `@type`.
 * A spaces-only node kind is skipped, so the other key is tried.
 *
 * `@type` may be one string or a list. The first string that is exactly
 * `t:Function`, or ends with `/t/Function`, is `function`. The same for
 * `t:Value` and `/t/Value`. The match is case-sensitive. A trailing slash
 * does not match. A value that is not a string is skipped.
 * When nothing matches, the kind is `type`.
 */
export function kindFromRaw(raw: Record<string, unknown>): OntologyKind {
  const nk = pickString(raw, "a:nodeKind", "nodeKind").toLowerCase();
  if (nk === "function") return "function";
  if (nk === "value") return "value";
  const t = raw["@type"];
  const types = Array.isArray(t) ? t : t != null ? [t] : [];
  for (const x of types) {
    const s = typeof x === "string" ? x : "";
    if (s === "t:Function" || /\/t\/Function$/.test(s)) return "function";
    if (s === "t:Value" || /\/t\/Value$/.test(s)) return "value";
  }
  return "type";
}

/**
 * The badge text. `function` is `FUNCTION`. `value` is `VALUE`.
 * `type` is `TYPE`. There is no other badge.
 */
export function kindBadge(kind: OntologyKind): string {
  if (kind === "function") return "FUNCTION";
  if (kind === "value") return "VALUE";
  return "TYPE";
}
