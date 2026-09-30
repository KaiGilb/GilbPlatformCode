/**
 * Group and rank skills you already hold. This does not load a catalogue.
 *
 * Exclusion is the skill's `uri` (the storage address), compared exactly.
 * It is not the type address. A skill excluded under one is not excluded
 * under the other.
 */

export interface BrowseSkill {
  tag: string;
  uri: string;
  does?: string | null;
  parentLabel?: string;
  path?: readonly string[];
}

/**
 * The parent heading.
 *
 * The trimmed `parentLabel` wins. If that is missing or blank, the trimmed
 * last path entry is used. Only the last entry. Earlier entries are not
 * walked, even when the last one is blank. If both are blank, the result
 * is the exact word `Skills`.
 *
 * That fallback is a real heading. A search for `skills` matches it. Do
 * not special-case the word.
 */
export function skillParentLabel(skill: BrowseSkill): string {
  const last = skill.path?.[skill.path.length - 1];
  const parent = skill.parentLabel?.trim() || last?.trim();
  return parent || "Skills";
}

/**
 * Ranked matches. The input list is not reordered. The hits are the same
 * objects, not copies.
 *
 * The needle is the query trimmed and lowered with `toLowerCase()`, not a
 * locale. Tags, the definition, the parent heading, and the path are
 * lowered the same way.
 *
 * Scores, first match wins:
 * - tag equals the needle: 100
 * - tag starts with the needle: 80
 * - tag contains the needle: 60
 * - parent heading or path contains the needle: 45
 * - definition contains the needle: 20
 * - otherwise the skill is left out
 *
 * Then add `max(0, 10 - min(lowered tag length, 40) / 4)`. The length is
 * the lowered tag. The division is not rounded first.
 *
 * Sort by score descending, then `localeCompare` on the original tag (the
 * runtime's default locale). Slice to `limit` after the sort. Do not cut
 * the list before sorting.
 *
 * `minChars` defaults to 1. `limit` defaults to 40. Both use `??`, so `0`
 * is kept. `0` is not "missing". A limit of 0 returns nothing. A minChars
 * of 0 lets an empty query through, and every tag starts with the empty
 * needle, so the result is the catalogue ranked by the bonus, cut to the
 * limit. Do not switch `??` to `||`.
 */
export function searchSkills(
  skills: readonly BrowseSkill[],
  query: string,
  opts: { excludeUris?: ReadonlySet<string>; minChars?: number; limit?: number } = {},
): BrowseSkill[] {
  const minChars = opts.minChars ?? 1;
  const limit = opts.limit ?? 40;
  const exclude = opts.excludeUris ?? new Set<string>();
  const needle = query.trim().toLowerCase();
  if (needle.length < minChars) return [];

  const ranked: { skill: BrowseSkill; score: number }[] = [];
  for (const skill of skills) {
    if (exclude.has(skill.uri)) continue;
    const tag = skill.tag.toLowerCase();
    const does = (skill.does ?? "").toLowerCase();
    const parent = skillParentLabel(skill).toLowerCase();
    const pathText = (skill.path ?? []).join(" ").toLowerCase();
    let score = 0;
    if (tag === needle) score = 100;
    else if (tag.startsWith(needle)) score = 80;
    else if (tag.includes(needle)) score = 60;
    else if (parent.includes(needle) || pathText.includes(needle)) score = 45;
    else if (does.includes(needle)) score = 20;
    else continue;
    score += Math.max(0, 10 - Math.min(tag.length, 40) / 4);
    ranked.push({ skill, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.skill.tag.localeCompare(b.skill.tag));
  return ranked.slice(0, limit).map((row) => row.skill);
}

/**
 * One group per parent heading. Groups follow `localeCompare` on the
 * heading. Skills inside a group follow `localeCompare` on the tag.
 * Excluded uris are dropped. The input list is not reordered. Skill
 * objects are the same references.
 */
export function groupSkillsByParent(
  skills: readonly BrowseSkill[],
  excludeUris: ReadonlySet<string> = new Set(),
): { parent: string; skills: BrowseSkill[] }[] {
  const map = new Map<string, BrowseSkill[]>();
  for (const skill of skills) {
    if (excludeUris.has(skill.uri)) continue;
    const parent = skillParentLabel(skill);
    const list = map.get(parent) ?? [];
    list.push(skill);
    map.set(parent, list);
  }
  return [...map.entries()]
    .map(([parent, kids]) => ({
      parent,
      skills: kids.sort((a, b) => a.tag.localeCompare(b.tag)),
    }))
    .sort((a, b) => a.parent.localeCompare(b.parent));
}
