/**
 * The old flat employment keys, from before a role was one group.
 * orgName / title is index 1. orgName2 / title2 is index 2.
 * emp1 and t0 are not these keys. This unit does not mint them.
 */

/** The index a flat key belongs to, or null when the key is not orgName or title. */
export function employmentIndexOfKey(key: string): number | null {
  const match = /^(?:orgName|title)(\d*)$/.exec(key);
  if (!match) return null;
  const digits = match[1];
  return digits ? Number(digits) : 1;
}

/**
 * The org and title key pair for an index.
 * Index 1 has no number. Every other index, including 0, is written as digits.
 */
export function employmentKeys(index: number): { org: string; title: string } {
  const suffix = index === 1 ? "" : String(index);
  return { org: `orgName${suffix}`, title: `title${suffix}` };
}
