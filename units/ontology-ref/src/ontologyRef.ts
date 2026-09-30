/**
 * Store ids, and term addresses on a host the caller passes.
 *
 * Nothing here is fetched. The host is a hostname, not a URL. The app passes
 * the ontology host it already chose. This unit does not pick one.
 */

/**
 * True when `ref` is an opaque store id or a lowercase UUID.
 *
 * A store id is at least 10 characters, only `0-9` and `a-z`, and it contains
 * at least one digit. That is why `improvement` is not an id (no digit) and
 * `3DPrinting` is not an id (it has an uppercase letter).
 *
 * A UUID matches only lowercase hex with the 8-4-4-4-12 hyphens.
 * An uppercase UUID is not an id.
 *
 * Nothing is trimmed. A space at either end is not an id.
 */
const STORE_ID_RE = /^(?=.*[0-9])[0-9a-z]{10,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function looksLikeStoreId(ref: string): boolean {
  return STORE_ID_RE.test(ref) || UUID_RE.test(ref);
}

/**
 * An absolute address for a ref the caller already has, on `host`.
 *
 * `ref` is trimmed. An empty string stays empty.
 * `http://` and `https://` are passed through unchanged, lowercase only.
 * `HTTP://` is not an address here. It is treated as a name.
 * `httpfoo` is not an address here. It is a name, so it becomes
 * `https://<host>/base/t/httpfoo` unless it is a store id.
 * That is not the same rule as a link opener, which refuses `httpfoo`,
 * and not the same rule as a short-id expander, which keeps `httpfoo`.
 *
 * A CURIE must be `base:` in lowercase, then a lowercase plane, then `/`,
 * then the rest. `base:e/a b` becomes `https://<host>/base/e/a%20b`.
 * `BASE:e/x` is not a CURIE.
 *
 * Anything else is a store id when {@link looksLikeStoreId} says so, and then
 * the plane is `e`. Otherwise the plane is `t`. The name is encoded.
 * `host` is inserted as given. It is not encoded and not trimmed.
 */
export function ontologyRefIri(ref: string, host: string): string {
  const r = ref.trim();
  if (!r) return r;
  if (r.startsWith("http://") || r.startsWith("https://")) return r;
  const curie = /^base:([a-z]+)\/(.+)$/.exec(r);
  if (curie) {
    const plane = curie[1];
    const rest = curie[2];
    if (plane !== undefined && rest !== undefined) {
      return `https://${host}/base/${plane}/${encodeURIComponent(rest)}`;
    }
  }
  const plane = looksLikeStoreId(r) ? "e" : "t";
  return `https://${host}/base/${plane}/${encodeURIComponent(r)}`;
}

/**
 * `https://<host>/base/t/<name>`.
 *
 * `name` is not trimmed and a leading `t:` is not removed.
 * `t:Person` becomes `https://<host>/base/t/t%3APerson`.
 * A space in the name is encoded. `host` is inserted as given.
 */
export function defaultTermIri(name: string, host: string): string {
  return `https://${host}/base/t/${encodeURIComponent(name)}`;
}
