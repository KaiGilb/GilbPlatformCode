/**
 * The storage key for a server ruling about one principal.
 * Does not store anything, and does not decide from the path whether someone is a person.
 */

export type PersonRuling = "person" | "not-a-person";

/**
 * Host lowercased, one trailing slash removed, fragment and userinfo dropped, search kept.
 * The path's letter case is kept. A string that is not an address is returned trimmed, unchanged.
 * A blank trims to "".
 */
export function personRulingKey(principal: string): string {
  const trimmed = principal.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.hostname = url.hostname.toLowerCase();
    const path = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    return `${url.protocol}//${url.host}${path}${url.search}`;
  } catch {
    return trimmed;
  }
}

/**
 * True unless the ruling passed in is exactly "not-a-person".
 * A missing ruling is true. A blank principal is false, whatever the ruling is.
 * Look the ruling up under personRulingKey(principal). This function does not do that lookup.
 */
export function admitAsPerson(principal: string, ruling: PersonRuling | null): boolean {
  if (!principal.trim()) return false;
  return ruling !== "not-a-person";
}
