/**
 * A graph edge derived from a fact already on a card. Not a relation the vault
 * stored, and not a search for which rows are pairs.
 *
 * `cardFactRelationUri` builds `fact:<slug>:<sourceId>:<targetId>`. The slug is
 * not checked. Empty parts stay empty. Nothing is escaped, so a colon inside an
 * id is indistinguishable from the separator when you read it back.
 *
 * `cardFactEdgeLabel` reads a URI that starts with `fact:`. The match is
 * case-sensitive. Three slugs are renamed:
 *   claimSubject → about
 *   heldParty → held-party
 *   profilePhoto → profile-photo
 * Every other slug is returned unchanged, including an empty slug and a retired
 * photo spelling. A URI that does not start with `fact:` returns undefined.
 * Only the first segment after `fact:` is the slug. Later colons are ids.
 *
 * `injectCardFactRelations` copies the map you pass and appends two participations
 * per pair: the source as `role:source`, then the target as `role:target`.
 * Existing relation objects are the same objects. The arrays and the map are new.
 * Nothing is deduped. The input map and its arrays are not changed.
 * This does not decide which pairs exist. The caller passes the pairs.
 */

export interface CardFactRelation {
  relation: string;
  role: string;
  members?: readonly { member: string; role: string }[];
  type?: string;
}

export interface CardFactPair {
  sourceId: string;
  targetId: string;
  slug: string;
}

export function cardFactRelationUri(pair: CardFactPair): string {
  return `fact:${pair.slug}:${pair.sourceId}:${pair.targetId}`;
}

export function cardFactEdgeLabel(relationUri: string): string | undefined {
  if (!relationUri.startsWith("fact:")) return undefined;
  const slug = relationUri.slice("fact:".length).split(":")[0];
  if (slug === undefined) return undefined;
  if (slug === "claimSubject") return "about";
  if (slug === "heldParty") return "held-party";
  if (slug === "profilePhoto") return "profile-photo";
  return slug;
}

export function injectCardFactRelations(
  relationsByRecord: ReadonlyMap<string, readonly CardFactRelation[]>,
  pairs: readonly CardFactPair[],
): Map<string, CardFactRelation[]> {
  const next = new Map<string, CardFactRelation[]>();
  for (const [id, rels] of relationsByRecord) next.set(id, [...rels]);

  const push = (id: string, rel: CardFactRelation) => {
    const list = next.get(id) ?? [];
    list.push(rel);
    next.set(id, list);
  };

  for (const pair of pairs) {
    const relation = cardFactRelationUri(pair);
    push(pair.sourceId, { relation, role: "role:source" });
    push(pair.targetId, { relation, role: "role:target" });
  }
  return next;
}
