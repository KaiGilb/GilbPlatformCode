// The one setting "which origin is the shared place catalogue (GilbGeo)", and the two tests every read of it
// uses: is this value a row of the catalogue, and is this address inside the catalogue at all.
// A shared unit must not name a host, so the app sets the origin once at start-up (`setGeoOrigin`), the way
// `term-origin` holds the ontology's. The module holds state and must exist once in an app.

let current: string | null = null;

/**
 * Set the origin once at start-up. The text is trimmed and parsed as a URL; it must be an http or https origin only (a host, with an
 * optional port): no path beyond "/", no query, no fragment, no sign-in part. What is kept is the URL standard's `origin`, so a trailing
 * "/", an explicit default port and upper-case host letters are normalised. Throws a TypeError (message starts with `geo-origin:`)
 * otherwise, and then leaves the earlier origin as it was.
 */
export function setGeoOrigin(origin: string): void {
  const trimmed = origin.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new TypeError(`geo-origin: not a URL (got ${JSON.stringify(origin)})`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`geo-origin: the scheme must be http or https (got ${JSON.stringify(origin)})`);
  }
  if (url.hostname === "") {
    throw new TypeError(`geo-origin: the origin must name a host (got ${JSON.stringify(origin)})`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new TypeError(`geo-origin: the origin must not carry a user name or password (got ${JSON.stringify(origin)})`);
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new TypeError(`geo-origin: the origin must have no path (got ${JSON.stringify(origin)})`);
  }
  if (url.search !== "" || trimmed.includes("?")) {
    throw new TypeError(`geo-origin: the origin must have no query (got ${JSON.stringify(origin)})`);
  }
  if (url.hash !== "" || trimmed.includes("#")) {
    throw new TypeError(`geo-origin: the origin must have no fragment (got ${JSON.stringify(origin)})`);
  }
  current = url.origin;
}

/** The origin that was set. Throws when `setGeoOrigin` has not been called. */
export function geoOrigin(): string {
  if (current === null) throw new Error("geo-origin: call setGeoOrigin(<origin>) once at start-up");
  return current;
}

/** Forget the origin. For tests. */
export function resetGeoOrigin(): void {
  current = null;
}

/**
 * True when a served value ADDRESSES a row in THIS APP'S configured catalogue: a string that starts with `<origin>/base/e/`.
 * A reader needs this because a card field's value arrives as a bare string and carries no encoding with it. It says nothing about
 * whether the row EXISTS. Throws, like `geoOrigin()`, when the origin was never set.
 */
export function isGeoEntityId(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(`${geoOrigin()}/base/e/`);
}

/**
 * True when an address lies INSIDE the catalogue: it parses as an absolute http(s) address whose origin (scheme, host, port) is
 * exactly the catalogue's. The test is on the PARSED origin, never on the text: `https://evil.example/?u=<catalogue>/base/e/x`,
 * `https://<catalogue host>@evil.example/` and `https://<catalogue host>.evil.example/` are all outside. Every read of the catalogue
 * asks this first and makes no request when the answer is false. Throws, like `geoOrigin()`, when the origin was never set.
 */
export function isGeoUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const home = geoOrigin();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  return url.origin === home;
}

/**
 * A write was refused because of the place catalogue: it is read only, so nothing may be written to it (`reason: "catalogue"`, the default), or the write could not be
 * checked because the catalogue's origin is not known (`reason: "origin-unknown"`), and a guard that protects the catalogue refuses when it cannot tell (it fails CLOSED).
 * The message is a fixed sentence and names no address. Added in 0.1.1 (the write fence of `place-claim-write` throws it).
 */
export class GeoWriteRefusedError extends Error {
  readonly reason: "catalogue" | "origin-unknown";
  constructor(reason: "catalogue" | "origin-unknown" = "catalogue") {
    super(reason === "origin-unknown" ? "Addresses cannot be saved here: the place catalogue is not known." : "The place catalogue is read only, so nothing can be written to it.");
    this.name = "GeoWriteRefusedError";
    this.reason = reason;
  }
}
