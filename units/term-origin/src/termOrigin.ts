// The one setting "which origin serves the type documents". Every Plan unit that builds a type
// address (`<origin>/base/t/<Name>`) asks `termOrigin()`, so they all build it the same way. A shared
// unit must not name a host, so the app sets the origin once at start-up (`setTermOrigin`). The
// module holds state and must exist once in an app.

let current: string | null = null;

/** Set the origin once at start-up. The text is trimmed and one trailing "/" is removed. Throws a TypeError unless it starts with "http://" or "https://". */
export function setTermOrigin(origin: string): void {
  const trimmed = origin.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    throw new TypeError(`term-origin: the origin must start with "http://" or "https://" (got ${JSON.stringify(origin)})`);
  }
  current = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

/** The origin that was set. Throws when `setTermOrigin` has not been called. */
export function termOrigin(): string {
  if (current === null) throw new Error("term-origin: call setTermOrigin(<origin>) once at start-up");
  return current;
}

/** Forget the origin. For tests. */
export function resetTermOrigin(): void {
  current = null;
}
