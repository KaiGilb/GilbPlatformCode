/**
 * The two ends of a relation document you already decoded.
 *
 * The short-id expansion below is copied from `units/compact-id`. The type
 * spelling is copied from `units/type-curie`. This folder does not import
 * those packages. The copies must stay in agreement with them. If you only
 * need the expansion, use compact-id. If you only need the type spelling,
 * use type-curie. Use this when you need which end is the source.
 */

function vaultBaseFromRelationId(docId: unknown): string | null {
  if (typeof docId !== "string") return null;
  const matched = /^(https?:\/\/[^/]+\/base)\/[er]\/[^/?#]+$/.exec(docId);
  const base = matched?.[1];
  return base ? `${base}/` : null;
}

function firstJsonLdValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function absoluteIdFromCompact(value: unknown, vaultBase: string | null): string | null {
  const resolve = (spelling: string): string | null => {
    if (spelling.startsWith("http") || spelling.startsWith("urn:")) return spelling;
    if (vaultBase && spelling.startsWith("base:")) return `${vaultBase}${spelling.slice("base:".length)}`;
    return null;
  };
  if (typeof value === "string") return resolve(value);
  if (value && typeof value === "object" && "@id" in value) {
    const id = (value as { "@id": unknown })["@id"];
    return typeof id === "string" ? resolve(id) : null;
  }
  return null;
}

function memberAddress(value: unknown, vaultBase: string | null): string | null {
  return absoluteIdFromCompact(firstJsonLdValue(value), vaultBase);
}

/** Copied from type-curie. A broken `%` in a `/base/t/` segment throws. */
function typeLocalName(typeUri: string): string {
  const trimmed = typeUri.trim();
  if (trimmed.startsWith("t:")) return trimmed.slice(2);
  const curie = trimmed.match(/^[a-z][a-z0-9]*:([A-Za-z0-9_-]+)$/i);
  const curieName = curie?.[1];
  if (curieName) return curieName;
  const path = trimmed.match(/\/base\/t\/([^/#?]+)/i);
  const pathName = path?.[1];
  if (pathName) return decodeURIComponent(pathName);
  return trimmed;
}

function typeCurieFromJsonLd(raw: unknown): string | null {
  const first = firstJsonLdValue(raw);
  let spelling: string | null = null;
  if (typeof first === "string") spelling = first;
  else if (first && typeof first === "object" && "@id" in first) {
    const id = (first as { "@id": unknown })["@id"];
    if (typeof id === "string") spelling = id;
  }
  if (!spelling?.trim()) return null;
  const trimmed = spelling.trim();
  if (trimmed.startsWith("t:")) return trimmed;
  const local = typeLocalName(trimmed);
  if (local && local !== trimmed) return `t:${local}`;
  return trimmed;
}

function roleUri(doc: Record<string, unknown>, vaultBase: string | null, ...keys: string[]): string | null {
  for (const key of keys) {
    const id = memberAddress(doc[key], vaultBase);
    if (id) return id;
  }
  return null;
}

export interface RelationEnds {
  /** The id the caller already had. Not read from the document. */
  id: string;
  /**
   * The document's own `@id` when that value is a string. Otherwise null.
   * The app fills a host URL in that gap. This unit does not.
   */
  uri: string | null;
  typeCurie: string | null;
  sourceUri: string | null;
  targetUri: string | null;
  /** Facts that are not the id, not a role, and not the source, target, or member keys. */
  extras: Record<string, unknown>;
}

/**
 * Source, target, type, and the leftover facts.
 *
 * Source keys, in order: `role:source`, then `source`. The first one that
 * expands to an address wins. Target keys: `role:target`, then `target`.
 * A list contributes its first entry only. The rest are ignored.
 *
 * A `base:` id is prefixed with the base taken from this document's `@id`.
 * That base is `http(s)://<host>/base/` and only when `@id` is
 * `/base/e/<one segment>` or `/base/r/<one segment>`. No other shape
 * expands. A `base:` id with no such `@id` is null, not the short string.
 *
 * `httpfoo` is kept. The check is `startsWith("http")`, not a URL parse.
 * Do not tighten it. `veda:t/Name` does not start with `http`, `urn:`, or
 * `base:`, so it is null even when the document's own id expands.
 *
 * Extras skip keys that start with `@` or `role:`, and the exact keys
 * `source`, `target`, and `member`. `Member` is not skipped. The bare key
 * `type` is not skipped either: it is read as the type spelling when
 * `@type` is missing, and it also stays in extras. Do not drop it from
 * one of those two places. Values are the same references, not copies.
 *
 * An ended link is not dropped here. Ending is a fact in `extras` when
 * the key survived. Do not add that filter in this function.
 */
export function relationEndsFromDocument(id: string, doc: Record<string, unknown>): RelationEnds {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key.startsWith("@") || key.startsWith("role:")) continue;
    if (key === "source" || key === "target" || key === "member") continue;
    extras[key] = value;
  }
  const vaultBase = vaultBaseFromRelationId(doc["@id"]);
  return {
    id,
    uri: typeof doc["@id"] === "string" ? doc["@id"] : null,
    typeCurie: typeCurieFromJsonLd(doc["@type"] ?? doc["type"]),
    sourceUri: roleUri(doc, vaultBase, "role:source", "source"),
    targetUri: roleUri(doc, vaultBase, "role:target", "target"),
    extras,
  };
}
