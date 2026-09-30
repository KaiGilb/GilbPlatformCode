/**
 * One absolute type address for every spelling of the same type.
 *
 * `absoluteTypeUri` is the host's own builder. This function does not know a
 * host. Pass the function that turns a bare name into the address your
 * registry is keyed by.
 *
 * - Not a string, or `""` → `""`. The builder is not called.
 * - `http://` or `https://`, lowercase only, and the path contains
 *   `/base/t/<Name>` → the builder is called with that name, decoded once.
 *   The match is the first one. `#` and `?` end the name. The path match is
 *   case-insensitive. Any host is accepted. That includes a third-party host
 *   that happens to use the same path. Do not "fix" that here.
 * - An `http://` or `https://` address with no such path → the original
 *   string, unchanged. The builder is not called. A foreign ontology stays
 *   foreign.
 * - Anything else → the builder is called with the string. A leading `t:`
 *   (lowercase, exact) is removed first. `T:Task` is not a CURIE here. It is
 *   passed through whole.
 *
 * `HTTP://` does not count as an address. It takes the non-address branch.
 *
 * A broken `%` in the `/base/t/` name throws. It is not caught.
 *
 * This is not `type-curie` and not `type-name`. Those return a short name or
 * a CURIE. This returns whatever your builder returns, usually an absolute
 * address.
 */
export function normalizeTypeUri(
  raw: string | null | undefined,
  absoluteTypeUri: (typeName: string) => string,
): string {
  if (typeof raw !== "string" || raw === "") return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const name = raw.match(/\/base\/t\/([^/#?]+)/i)?.[1];
    if (name !== undefined) return absoluteTypeUri(decodeURIComponent(name));
    return raw;
  }
  return absoluteTypeUri(raw.startsWith("t:") ? raw.slice(2) : raw);
}
