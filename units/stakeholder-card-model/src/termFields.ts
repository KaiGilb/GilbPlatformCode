/** The term's name from its IRI or CURIE: `https://ontology.example.test/base/a/email` / `a:email` → `email`. */
export function termName(term: string | null | undefined): string | null {
  if (!term) return null;
  // ⚠ The master's field LISTING serves an attribute as `…/base/t/<Name>` (`t/GivenName`), its
  // per-term route as `…/base/a/<name>` (`a/givenName`) — the field-set reader says so.
  // Both name the same term; the name is compared with its first letter lower-cased. (Understanding only
  // the `a/` form hid fields on a rig.)
  const m = /(?:\/[at]\/|^a:|^[at]\/)([^/#?]+)$/.exec(term.trim());
  if (!m) return null;
  const n = m[1]!;
  return n.charAt(0).toLowerCase() + n.slice(1);
}

/** The field (of a card's master field set) that carries this term, or null. */
export function fieldOfTerm<T extends { term: string; slug: string | null; label: string | null; writeKey?: string | null }>(
  fields: readonly T[],
  name: string,
): T | null {
  // ⚠ The listing's `t/<Name>` is not always the attribute's own name (`t/OnlineAccount` lists the
  // term `a/account`, measured 2026-10-14), so the master's own WRITE spelling (`a:account`, its
  // `a:predicateAttribute`) is asked first; the listing IRI is the fallback.
  return (
    fields.find((f) => termName(f.writeKey ?? null) === name) ??
    fields.find((f) => termName(f.term) === name) ??
    null
  );
}
