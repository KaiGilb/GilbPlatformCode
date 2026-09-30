/**
 * The only statement text that may be opened as a link.
 *
 * Trim, then parse with `new URL` and no base. Allow only the protocols
 * `http:` and `https:`. Return the trimmed text.
 *
 * Do not return `url.href`. That rewrite adds a slash:
 * `https://example.test` becomes `https://example.test/`. The vault's
 * text and the address that opens must be the same characters.
 *
 * Do not switch this to a prefix check. `java\nscript:` is hostile and a
 * prefix check can miss it. The parser folds the break. The result is null.
 *
 * Null means inert text. It is not a throw, and it is not a link.
 */

export function statementRefHref(value: string): string | null {
  const raw = value.trim();
  if (raw === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return raw;
}
