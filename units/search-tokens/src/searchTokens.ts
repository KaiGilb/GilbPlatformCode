/**
 * Words from a search box, and two readings that must not be used to drop a
 * person the server already returned.
 *
 * `searchTokens` splits on whitespace, after Unicode NFC. Blank pieces are
 * dropped. Duplicates are dropped by `toLocaleLowerCase()` with no locale, so
 * the machine's locale decides pairs such as dotted and dotless i. The first
 * spelling is kept, not the lower-cased one. At most `MAX_SEARCH_TOKENS` (8)
 * distinct tokens are returned. The ninth is ignored even if the first eight
 * would not have been enough for a later check. This list is for display and
 * for ordering. It is not the server's match.
 *
 * `wordPrefixMatch` is true when any whitespace-separated word of `value`
 * starts with `token`, both lowered with `toLocaleLowerCase()` and no locale.
 * An empty token is false. This function does not apply NFC. A word in the
 * middle of another word does not match. Do not use it to remove a hit.
 *
 * `labelWordPrefixMatchesQuery` is true only when every token from
 * `searchTokens` is a prefix of some word in `label`. The label is NFC'd first.
 * An empty query is false, not true. Because the token list stops at 8, a ninth
 * word in the query is not required to match. The two functions are not the
 * same: this one normalises the label and drops empty words; `wordPrefixMatch`
 * does not.
 *
 * `labelFromSkillUri` is the last slash-separated piece, with camel boundaries
 * spaced and then lowered with `toLocaleLowerCase()`. A trailing slash yields
 * an empty string. The host is not special. This does not guess an address
 * from words, and it does not build one.
 */

export const MAX_SEARCH_TOKENS = 8;

export function searchTokens(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of query.normalize("NFC").split(/\s+/)) {
    const t = raw.trim();
    if (t === "") continue;
    const key = t.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length === MAX_SEARCH_TOKENS) break;
  }
  return out;
}

export function wordPrefixMatch(value: string, token: string): boolean {
  const t = token.toLocaleLowerCase();
  if (t.length === 0) return false;
  for (const w of value.toLocaleLowerCase().split(/\s+/)) {
    if (w.startsWith(t)) return true;
  }
  return false;
}

export function labelWordPrefixMatchesQuery(label: string, query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return false;
  const words = label.normalize("NFC").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every((token) => {
    const needle = token.toLocaleLowerCase();
    return words.some((word) => word.startsWith(needle));
  });
}

export function labelFromSkillUri(skillUri: string): string {
  const leaf = skillUri.split("/").pop() ?? skillUri;
  return leaf
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLocaleLowerCase();
}
