/**
 * Splits a paste box of members into entries.
 *
 * Separators are whitespace, comma, and semicolon. A comma splits even when
 * there is no space after it. `a,b` is two entries. That is not the direct-share
 * split, which keeps `a,b` as one entry. Do not swap them.
 *
 * Each entry is trimmed. Empty pieces are dropped. Duplicates are dropped by
 * `toLocaleLowerCase()` with no locale, so the machine's locale applies. The
 * first spelling is kept. There is no NFC pass. There is no cap.
 *
 * This does not decide whether an entry is a person, a group, or a name.
 * After this list, the app keeps an entry only when it is already a principal
 * or it looks like a person address. Those two checks are `person-address`.
 * A named vault whose address ends in `/base` is a principal and must not be
 * dropped here. Do not re-inline a 36-character hex test in front of this list.
 */

export function parseMemberInputs(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const t = part.trim();
    if (t.length === 0) continue;
    const key = t.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
