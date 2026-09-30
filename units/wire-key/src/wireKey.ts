/**
 * The key a reader uses after the vault has framed a stored attribute.
 *
 * This is the read direction. The stored-spelling unit is the write direction.
 * Do not feed this result back into a write. `label` from this function is not
 * permission to store `label`, and it is not permission to store `a:label`
 * without asking stored-spelling.
 *
 * Only one leading `a:` is removed, and only that prefix. Nothing is trimmed.
 */

/**
 * `a:label` is `label`. `a:a:label` is `a:label`, not `label`.
 * `role:source`, a full address, and `A:label` are unchanged.
 * `a:` is `""`. A leading space means the prefix is not removed.
 */
export function wireKeyFor(storedAttribute: string): string {
  return storedAttribute.startsWith("a:") ? storedAttribute.slice(2) : storedAttribute;
}
