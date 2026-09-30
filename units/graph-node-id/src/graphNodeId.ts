/**
 * Ids for nodes that are not records.
 *
 * A record node uses the record id with no prefix, so a click can select
 * that record. These two prefixes exist so a relation node and a pendant
 * node can never be equal to a record id, or to each other, for the same
 * inputs.
 *
 * Nothing is trimmed. Nothing is checked. An empty string is still prefixed.
 * `relationNodeId("")` is `rel:`. `pendantNodeId("", "")` is `pend::`.
 *
 * Do not split the result on `:` to get the address back. A relation address
 * contains colons, and a record id may contain colons. Keep the inputs you
 * already passed.
 *
 * This does not build the graph. Which edges exist, and when a pendant is
 * honest, stays in the app that holds the lookups.
 */
export function relationNodeId(relationUri: string): string {
  return `rel:${relationUri}`;
}

export function pendantNodeId(recordId: string, relationUri: string): string {
  return `pend:${recordId}:${relationUri}`;
}
