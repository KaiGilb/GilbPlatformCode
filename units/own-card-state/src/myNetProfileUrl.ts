// The one setting "where the profile app edits the holder's own card". The own-card band links to it, so a shared unit must not
// name that host: the app sets the address once at start-up (`setMyNetProfileUrl`) and the band reads it when it draws.
// The module holds state and must exist once in an app.

let current: string | null = null;

/**
 * Set the address of the profile editor once at start-up. The text is trimmed and parsed as a URL; it must be an absolute http or https
 * address that names a host and carries no user name or password. What is kept is the URL standard's `href`. Throws a TypeError
 * (message starts with `own-card-state:`) otherwise, and then leaves the earlier address as it was. A `javascript:` or `data:` address
 * is refused for that reason: the band puts this value in a link.
 */
export function setMyNetProfileUrl(url: string): void {
  const trimmed = typeof url === "string" ? url.trim() : "";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new TypeError(`own-card-state: not a URL (got ${JSON.stringify(url)})`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError(`own-card-state: the scheme must be http or https (got ${JSON.stringify(url)})`);
  }
  if (parsed.hostname === "") {
    throw new TypeError(`own-card-state: the address must name a host (got ${JSON.stringify(url)})`);
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new TypeError(`own-card-state: the address must not carry a user name or password (got ${JSON.stringify(url)})`);
  }
  current = parsed.href;
}

/** The address that was set. Throws when `setMyNetProfileUrl` has not been called. */
export function myNetProfileUrl(): string {
  if (current === null) throw new Error("own-card-state: call setMyNetProfileUrl(<address>) once at start-up");
  return current;
}

/** Forget the address. For tests. */
export function resetMyNetProfileUrl(): void {
  current = null;
}
