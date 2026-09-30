/**
 * The term addresses inside one declared identity.
 *
 * An identity may name several terms, separated by `|`. Only an address whose
 * path is `/base/t/<name>` is kept. A `/vault/t/` path is not a hop. Nothing
 * is fetched, and nothing is decoded.
 */

const HOPABLE_TERM_IRI = /^https?:\/\/[^/?#]+\/base\/t\/[^/?#|]+$/;

/**
 * The hop addresses, in order, with duplicates removed after normalisation.
 *
 * Each piece is split on `|`, trimmed, and one trailing slash is removed.
 * A second trailing slash stays, and then the piece does not match.
 * The scheme must be lowercase `http://` or `https://`.
 * The name must be at least one character and must not contain `/`, `?`, `#`,
 * or `|`.
 * A piece that does not match is dropped. It is not returned as itself.
 * An empty string is an empty list.
 */
export function hopableTermIris(identity: string): string[] {
  const hops: string[] = [];
  const seen = new Set<string>();
  for (const part of identity.split("|")) {
    const iri = part.trim().replace(/\/$/, "");
    if (!HOPABLE_TERM_IRI.test(iri)) continue;
    if (seen.has(iri)) continue;
    seen.add(iri);
    hops.push(iri);
  }
  return hops;
}
