// The one place an app sets the GilbPlatform origin and the hosts allowed to receive its credential.
// Every unit that builds a vault address or decides who may receive a credential asks these getters, so
// they all read the same values. A shared unit must not name a host, so the app sets them once at
// start-up. The module holds state and must exist once in an app.

let origin: string | null = null;
let systemHosts: ReadonlySet<string> | null = null;
let ontologyApi: string | null = null;
let publicCorpus: string | null = null;
const DEFAULT_MIN_ONTOLOGY_QUERY = 3;
let minQuery: number = DEFAULT_MIN_ONTOLOGY_QUERY;

/** Parse an origin: http or https, a host, no path beyond "/", no query, no fragment, no sign-in part. Returns the URL standard's `origin`. */
function parseOrigin(setter: string, value: string): string {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new TypeError(`base-origin: ${setter}: not a URL (got ${JSON.stringify(value)})`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`base-origin: ${setter}: the scheme must be http or https (got ${JSON.stringify(value)})`);
  }
  if (url.hostname === "") {
    throw new TypeError(`base-origin: ${setter}: the origin must name a host (got ${JSON.stringify(value)})`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new TypeError(`base-origin: ${setter}: the origin must not carry a user name or password (got ${JSON.stringify(value)})`);
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new TypeError(`base-origin: ${setter}: the origin must have no path (got ${JSON.stringify(value)})`);
  }
  if (url.search !== "" || trimmed.includes("?")) {
    throw new TypeError(`base-origin: ${setter}: the origin must have no query (got ${JSON.stringify(value)})`);
  }
  if (url.hash !== "" || trimmed.includes("#")) {
    throw new TypeError(`base-origin: ${setter}: the origin must have no fragment (got ${JSON.stringify(value)})`);
  }
  return url.origin;
}

/**
 * Set the GilbPlatform origin once at start-up. The text is trimmed and parsed as a URL; it must be an http or https origin only.
 * What is kept is the URL standard's `origin`. Throws a TypeError (message starts with `base-origin:`) otherwise, and then leaves
 * the earlier origin as it was.
 */
export function setBaseOrigin(value: string): void {
  origin = parseOrigin("setBaseOrigin", value);
}

/** The origin that was set. Throws when `setBaseOrigin` has not been called. */
export function baseOrigin(): string {
  if (origin === null) throw new Error("base-origin: call setBaseOrigin(<origin>) once at start-up");
  return origin;
}

/** Forget the origin. For tests. */
export function resetBaseOrigin(): void {
  origin = null;
}

/**
 * Set the hosts that are the platform's own system vaults (bare host names, no scheme, no port, no path). The list is
 * lower-cased and trimmed, and a repeated name counts once; a name that is not a bare host is refused with a TypeError (message starts with
 * `base-origin:`) and the earlier list stays. An empty list is allowed: no system host.
 */
export function setSystemVaultHosts(hosts: readonly string[]): void {
  const next = new Set<string>();
  for (const host of hosts) {
    if (typeof host !== "string") throw new TypeError("base-origin: setSystemVaultHosts: every host must be a string");
    const h = host.trim().toLowerCase();
    let ok = false;
    try {
      ok = new URL(`https://${h}`).hostname === h;
    } catch {
      ok = false;
    }
    if (!ok) throw new TypeError(`base-origin: setSystemVaultHosts: not a bare host name (got ${JSON.stringify(host)})`);
    next.add(h);
  }
  systemHosts = next;
}

/** The system vault hosts that were set. Throws when `setSystemVaultHosts` has not been called. */
export function systemVaultHosts(): ReadonlySet<string> {
  if (systemHosts === null) throw new Error("base-origin: call setSystemVaultHosts([...hosts]) once at start-up");
  return systemHosts;
}

/** Forget the system vault hosts. For tests. */
export function resetSystemVaultHosts(): void {
  systemHosts = null;
}

/**
 * Optional. Set the origin that answers the public term search, when it is not the platform origin. Same rules as
 * `setBaseOrigin`. An empty or blank text clears it.
 */
export function setOntologyApiOrigin(value: string): void {
  ontologyApi = value.trim() === "" ? null : parseOrigin("setOntologyApiOrigin", value);
}

/** The origin set by `setOntologyApiOrigin`, or `undefined` when none was set (the default: no override). */
export function ontologyApiOrigin(): string | undefined {
  return ontologyApi ?? undefined;
}

/** Forget the ontology API origin. For tests. */
export function resetOntologyApiOrigin(): void {
  ontologyApi = null;
}

/**
 * Optional. Set the shortest query (in letters) that reaches the ontology. A whole number of 0 or more. Throws a TypeError
 * (message starts with `base-origin:`) otherwise, and then leaves the earlier value.
 */
export function setMinOntologyQuery(n: number): void {
  if (!Number.isInteger(n) || n < 0) throw new TypeError(`base-origin: setMinOntologyQuery: must be a whole number of 0 or more (got ${String(n)})`);
  minQuery = n;
}

/** The shortest query that reaches the ontology: 3 unless `setMinOntologyQuery` changed it. */
export function minOntologyQuery(): number {
  return minQuery;
}

/** Put the shortest query back to 3. For tests. */
export function resetMinOntologyQuery(): void {
  minQuery = DEFAULT_MIN_ONTOLOGY_QUERY;
}

/**
 * Set the origin of the public term corpus that stands in when the platform origin is a local rig that holds no
 * ontology. Same rules as `setBaseOrigin`.
 */
export function setPublicCorpusOrigin(value: string): void {
  publicCorpus = parseOrigin("setPublicCorpusOrigin", value);
}

/** The origin set by `setPublicCorpusOrigin`. Throws when it was not set: no origin is built in. */
export function publicCorpusOrigin(): string {
  if (publicCorpus === null) throw new Error("base-origin: call setPublicCorpusOrigin(<origin>) once at start-up");
  return publicCorpus;
}

/** Forget the public corpus origin. For tests. */
export function resetPublicCorpusOrigin(): void {
  publicCorpus = null;
}
