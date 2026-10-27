// The one test "is this type the type named X". Every Plan unit compares types through `isTypeName`,
// so they all use the same key. The key is replaceable once (`setTypeKey`) by a host that has its own
// type registry; the module therefore holds state and must exist once in an app.

/**
 * The key used when the host has no type registry. Derivation: it is the app's `typeFacetKey` with
 * the registry lookup answering "unknown" for every input, and the app's `normalizeTypeUri` written
 * inline with the type namespace as the literal path `/base/t/` (no host). The namespace's host
 * never changes the result, because the fallback keeps only the text after the last "/".
 */
export function defaultTypeKey(typeUriOrId: string): string {
  const n = normalizeTypeUri(typeUriOrId);
  const bare = n.includes("/base/t/")
    ? n.slice(n.lastIndexOf("/") + 1)
    : n.startsWith("t:")
      ? n.slice(2)
      : n;
  return bare.toLowerCase() || typeUriOrId.toLowerCase();
}

function normalizeTypeUri(raw: string | undefined | null): string {
  if (typeof raw !== "string" || raw === "") return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const m = raw.match(/\/base\/t\/([^/#?]+)/i);
    if (m?.[1]) return `/base/t/${decodeURIComponent(m[1])}`;
    return raw;
  }
  return `/base/t/${raw.startsWith("t:") ? raw.slice(2) : raw}`;
}

let currentTypeKey: (typeUriOrId: string) => string = defaultTypeKey;

/** Replace the key function, once at start-up, with the host's own (for example one that asks its type registry). */
export function setTypeKey(fn: (typeUriOrId: string) => string): void {
  currentTypeKey = fn;
}

/** Put the default key back. For tests. */
export function resetTypeKey(): void {
  currentTypeKey = defaultTypeKey;
}

/** The key of a type, by the current function. */
export function typeKey(typeUriOrId: string): string {
  return currentTypeKey(typeUriOrId);
}

/** True when `typeUri` is the type named `name`, under the same key the Plan card uses. */
export function isTypeName(typeUri: string, name: string): boolean {
  return typeKey(typeUri) === typeKey(name);
}
