/**
 * An absolute stored address, kept as a reference.
 *
 * A local name is a miss. This function does not build an address for it.
 * The builder that takes a host and a name is ontology-ref. Use that only
 * when the host already decided the name is a name, not when this returned null.
 *
 * This is not statement-href. That function parses. This one only checks a prefix.
 */

/**
 * `{ "@id": trimmed }` when the trimmed text starts with `http://` or `https://`.
 * Otherwise null.
 *
 * The scheme is lowercase only. `HTTP://` is null.
 * `httpfoo` is null. There must be `://`.
 * The rest is not parsed. A space in the middle is kept. A trailing slash is kept.
 * The returned text is the trimmed input, not the result of a URL parser.
 * Empty after trim is null. A local name, a `t:` name, and a `base:` name are null.
 */
export function termRefFromNameOrIri(nameOrIri: string): { "@id": string } | null {
  const s = nameOrIri.trim();
  if (!s) return null;
  if (/^https?:\/\//.test(s)) return { "@id": s };
  return null;
}
