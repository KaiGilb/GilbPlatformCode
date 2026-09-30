/**
 * The two fields that can hold a unit's tag, in the order a display must try them.
 * unitTag first, then ruleId. Do not add a third name here.
 */
export const TAG_CARRIER_SLUGS_IN_PRECEDENCE = ["unitTag", "ruleId"] as const;

/** The words to use when neither field holds a tag. Derived from the list above. */
export const TAG_CARRIERS_DISPLAY = TAG_CARRIER_SLUGS_IN_PRECEDENCE.map((slug) => `a:${slug}`).join(
  " or ",
);

/** One stored tag, and which of the two fields held it. */
export interface ResolvedUnitTag {
  /** The stored text, with surrounding spaces removed. */
  tag: string;
  /** `"unitTag"` or `"ruleId"`. Never the `a:` spelling. */
  carrier: string;
}

/**
 * Every tag field this record actually holds, in precedence order.
 * One entry per field. Two fields with the same text are still two entries.
 * An empty answer is the only honest "this record has no tag".
 */
export function resolveUnitTagCarriers(
  facts: Record<string, unknown> | null | undefined,
): ResolvedUnitTag[] {
  if (!facts) return [];
  const held: ResolvedUnitTag[] = [];
  for (const slug of TAG_CARRIER_SLUGS_IN_PRECEDENCE) {
    for (const key of [slug, `a:${slug}`]) {
      const value = facts[key];
      if (typeof value !== "string" || value.trim() === "") continue;
      held.push({ tag: value.trim(), carrier: slug });
      break;
    }
  }
  return held;
}

/**
 * The one tag a single chip should draw: the first field that holds one.
 * This is not the test for "no tag". Use resolveUnitTagCarriers for that.
 * Null means neither field held a tag.
 */
export function resolveUnitTag(
  facts: Record<string, unknown> | null | undefined,
): ResolvedUnitTag | null {
  return resolveUnitTagCarriers(facts)[0] ?? null;
}
