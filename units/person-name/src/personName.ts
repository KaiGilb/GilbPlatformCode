/**
 * Splits a person's name into the given and family name, and orders the fields of a person's card the way
 * MyNet lays it out: the given and family name first, and the person's name built from them. Which fields
 * those are is found by the type's terms, never by a spelling here.
 *
 * A record made with only a name ("Jason Test") shows that name split into the two boxes (first word, then
 * the rest, as MyNet does); nothing is written until the person edits one.
 *
 * Pure: no reads, no writes, no module state.
 */

/** "Jason Test" → { given: "Jason", family: "Test" }; one word → given only. As MyNet splits a name
 *  (`profile.ts`: `const [first, ...rest] = fn.split(/\s+/)`): "Anna Maria Berg" → "Anna" / "Maria Berg". */
export function splitPersonName(name: string | null | undefined): { given: string; family: string } {
  const t = (name ?? "").trim().replace(/\s+/g, " ");
  if (!t) return { given: "", family: "" };
  const i = t.indexOf(" ");
  return i < 0 ? { given: t, family: "" } : { given: t.slice(0, i), family: t.slice(i + 1) };
}

/**
 * The order the card shows: the given-name box, the family-name box, then the rest in their own
 * order. The boxes in `hidden` (the record's one-name box, the photo box) are not shown as boxes.
 *
 * `nicknameSlug`, when passed, is the third name box: given, family, nickname, then the rest.
 * Calls that omit it are unchanged.
 */
export function personCardOrder<T extends { slug: string }>(
  fields: readonly T[],
  givenSlug: string,
  familySlug: string,
  hidden: readonly (string | null | undefined)[],
  nicknameSlug?: string | null,
): T[] {
  const given = fields.find((f) => f.slug === givenSlug);
  const family = fields.find((f) => f.slug === familySlug);
  const nickname = nicknameSlug ? fields.find((f) => f.slug === nicknameSlug) : undefined;
  const skip = new Set([givenSlug, familySlug, ...(nickname ? [nickname.slug] : []), ...hidden.filter((h): h is string => !!h)]);
  return [...(given ? [given] : []), ...(family ? [family] : []), ...(nickname ? [nickname] : []), ...fields.filter((f) => !skip.has(f.slug))];
}

/**
 * MyNet's section order on a person card: the given- and family-name boxes
 * (the first two of `ordered`, from {@link personCardOrder}), then the sections in the order given
 * (Email, Phone, Social), then every other field in its own order. A field a section stands for is
 * not shown a second time.
 *
 * `nicknameSlug`, when passed, keeps the leading names at three (given, family, nickname — whichever
 * {@link personCardOrder} placed in front). Omitted, the lead stays the first two, as before.
 */
export function personSectionOrder<T extends { slug: string }, S extends { slug: string }>(
  ordered: readonly T[],
  sections: readonly S[],
  nicknameSlug?: string | null,
): (T | S)[] {
  const lead = nicknameSlug ? 3 : 2;
  const taken = new Set(sections.map((s) => s.slug));
  return [...ordered.slice(0, lead), ...sections, ...ordered.slice(lead).filter((f) => !taken.has(f.slug))];
}

/**
 * The whole card order: MyNet's (names, then MyNet's sections, as
 * {@link personSectionOrder}), then the fields MyNet lacks, in the master's order. A section MyNet's
 * profile does not have (`late`, the contact language) is ⛔ not moved up among MyNet's: it stays where
 * its field sits among the remaining fields; when its field is not one of them (not one the card edits,
 * say it holds several values) it follows them, ⛔ never dropped.
 */
export function personCardFields<T extends { slug: string }, S extends { slug: string }>(
  ordered: readonly T[],
  mynetSections: readonly S[],
  late: readonly S[],
): (T | S)[] {
  return [...personSectionOrder(ordered, mynetSections), ...late.filter((s) => !ordered.some((f) => f.slug === s.slug))];
}
