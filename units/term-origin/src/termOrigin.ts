// The one setting "which origin serves the type documents". Every Plan unit that builds a type
// address (`<origin>/base/t/<Name>`) asks `termOrigin()`, so they all build it the same way. A shared
// unit must not name a host, so the app sets the origin once at start-up (`setTermOrigin`). The
// module holds state and must exist once in an app.

let current: string | null = null;

/**
 * Set the origin once at start-up. The text is trimmed and parsed as a URL; it must be an http or https origin only (a host, with an
 * optional port): no path beyond "/", no query, no fragment, no sign-in part. What is kept is the URL standard's `origin`, so a trailing
 * "/", an explicit default port and upper-case host letters are normalised. Throws a TypeError (message starts with `term-origin:`)
 * otherwise, and then leaves the earlier origin as it was.
 */
export function setTermOrigin(origin: string): void {
  const trimmed = origin.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new TypeError(`term-origin: not a URL (got ${JSON.stringify(origin)})`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`term-origin: the scheme must be http or https (got ${JSON.stringify(origin)})`);
  }
  if (url.hostname === "") {
    throw new TypeError(`term-origin: the origin must name a host (got ${JSON.stringify(origin)})`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new TypeError(`term-origin: the origin must not carry a user name or password (got ${JSON.stringify(origin)})`);
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new TypeError(`term-origin: the origin must have no path (got ${JSON.stringify(origin)})`);
  }
  if (url.search !== "" || trimmed.includes("?")) {
    throw new TypeError(`term-origin: the origin must have no query (got ${JSON.stringify(origin)})`);
  }
  if (url.hash !== "" || trimmed.includes("#")) {
    throw new TypeError(`term-origin: the origin must have no fragment (got ${JSON.stringify(origin)})`);
  }
  current = url.origin;
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
