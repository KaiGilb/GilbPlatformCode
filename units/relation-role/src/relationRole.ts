/**
 * A served role, with or without the `role:` prefix the vault sometimes drops.
 * `roleIs("source", "role:source")` and `roleIs("role:source", "source")` are both true.
 */
export function roleIs(value: string | null | undefined, slug: string): boolean {
  if (typeof value !== "string" || !value) return false;
  const bare = slug.startsWith("role:") ? slug.slice("role:".length) : slug;
  if (!bare) return false;
  return value === bare || value === `role:${bare}`;
}

/** One (relation, role) participation the record is a member of — the honest floor the
 * platform's reverse lookup yields in a single round-trip. */
export interface RecordRelation {
  /** The relation entity URI (`https://<host>/base/r/<id>`) the record participates in. */
  relation: string;
  /** The role the record fills in that relation (the vault's own `role` value, verbatim). */
  role: string;
  /**
   * Co-members of this relation (from `relation_members`), when the vault returns them
   * (an additive field of the platform's reverse lookup). Used for graph neighbourhood expand without
   * a separate DPoP GET /base/r/:id. Absent/empty on older servers — expander falls back.
   */
  members?: readonly { member: string; role: string }[];
  /**
   * The relation's stored TYPE (its predicate, e.g. `t:PartOf`), when the vault returns it.
   * The platform sends it exactly when it sends `members`: only for a relation the caller may read.
   * Absent on an older platform — a reader that needs the predicate then dereferences the relation.
   */
  type?: string;
}
