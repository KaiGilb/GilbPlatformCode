/**
 * A short label from a skill address when no catalogue name was supplied.
 *
 * Parse with `new URL`. Take the last non-empty path segment. Remove one
 * leading `t:` from that segment only. Split a lower letter followed by an
 * upper letter, once per pair. Do not lower the result and do not capitalise
 * it. `.../t/StreetLine` becomes `Street Line`. `streetLine` as a segment
 * becomes `street Line`.
 *
 * `HTMLParser` has no lower-then-upper pair, so it stays `HTMLParser`.
 *
 * If the string is not an absolute address, return it unchanged. Do not
 * trim that fallback. A relative word is not an address, so `StreetLine`
 * comes back as `StreetLine`, not `Street Line`.
 *
 * This does not invent a meaning for the skill. It does not fetch a label.
 */
export function skillUriDisplayLabel(skillUri: string): string {
  try {
    const path = new URL(skillUri).pathname;
    const segment = path.split("/").filter(Boolean).pop() ?? skillUri;
    return segment.replace(/^t:/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  } catch {
    return skillUri;
  }
}
