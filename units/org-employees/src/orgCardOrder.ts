// The order of an organization card's fields: the name box first, then the person card's sections (Email,
// Phone, Address, Online account), then every other field in its own order. The person card's `personSectionOrder` takes the
// FIRST TWO fields as the given- and family-name boxes; an organization has one name box, so reusing it would take two
// unrelated fields as "names" and draw their sections twice (found by the first render of the card, 2026-10-16).
/** The name field first, the sections next, then the remaining fields; a field a section stands for is not shown a second time. */
export function orgSectionOrder<T extends { slug: string }, S extends { slug: string }>(
  fields: readonly T[],
  nameSlug: string | null,
  sections: readonly S[],
): (T | S)[] {
  const taken = new Set(sections.map((s) => s.slug));
  const name = nameSlug ? fields.find((f) => f.slug === nameSlug) : undefined;
  return [...(name ? [name] : []), ...sections, ...fields.filter((f) => f !== name && !taken.has(f.slug))];
}
