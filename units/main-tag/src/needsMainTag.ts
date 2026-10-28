// Whether a record needs its main tag to be named: it holds no name, label, `unitTag` or `tag`.
const CANONICAL_DISPLAY_SLUG = "label" as const;
const MASTER_TAG_SLUGS = ["unitTag", "tag"] as const;

function factTrim(
  facts: Record<string, string | undefined> | null | undefined,
  slug: string,
): string {
  const v = facts?.[slug];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * True when a record's facts hold no name, label, `unitTag` or `tag`, so its chrome name would fall past the tag step: only such a record asks the
 * platform for its main tag (a record with a name or a unit tag never costs a request).
 */
export function needsMainTag(facts: Record<string, string | undefined> | null | undefined): boolean {
  if (!facts) return true;
  // In GilbApp the spelling is PARTY_NAME_FLOOR.name, whose value is the literal "name"; it is written here as that literal.
  if (factTrim(facts, "name") || factTrim(facts, CANONICAL_DISPLAY_SLUG)) return false;
  return !MASTER_TAG_SLUGS.some((slug) => factTrim(facts, slug));
}
