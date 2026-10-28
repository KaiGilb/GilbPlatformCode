// The relation document as read from the vault. `actsForOnRelation` reads its `uri` and `extras`.

export interface RelationDoc {
  id: string;
  uri: string;
  typeCurie: string | null;
  sourceUri: string | null;
  targetUri: string | null;
  /** Vault-side extras keyed as stored (a:status, a:location, a:occurredAt, …). */
  extras: Record<string, unknown>;
  /**
   * Every role of the relation other than `role:source`/`role:target`, keyed as read (`role:<name>`), each value an
   * absolute `{ "@id" }` (or an array of them). A rewrite of the relation carries these over. Absent means none.
   */
  otherRoles?: Record<string, unknown>;
}
