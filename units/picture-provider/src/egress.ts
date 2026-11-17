// The picture service's two ways out to the network, kept apart so the key can never ride to a place a picture comes
// from:
//   api     reaches ONLY the one origin the configured base names (exact host and port, https, under the base's path).
//           A redirect is never followed: a 3xx answer is handed back as it is, and the client reads it as no answer.
//   output  reaches ONLY the listed output hosts (https, GET, no user name or password). A redirect is followed only
//           to another listed host, at most three hops, each hop checked by the same guard.
// Both refuse an IP-literal host, a host with no dot (a machine name) and a port other than 443, and both run the host's own extra guard
// when it gives one (an app's deny list, its public-address rule). Anything refused throws EgressRefused before a
// socket opens.

/** One record of what each guard allowed and refused, by host. Read by tests and operators. */
export interface EgressLog { allowed: string[]; refused: string[] }

/** A call the guard refused. Nothing was sent. */
export class EgressRefused extends Error {
  readonly host: string;
  constructor(host: string, why: string) {
    super(`egress refused: ${host} ${why}`);
    this.host = host;
    this.name = "EgressRefused";
  }
}

/** An extra check the host app adds to both guards. Throw (any error) to refuse; the guard turns it into EgressRefused. */
export type ExtraGuard = (url: URL, method: string) => void;

/**
 * One canonical form of host[:port]: lower case, trailing dots dropped, the default https port dropped, as the URL
 * parser reads it. Null when it does not parse.
 *
 * @param hostOrHostPort "host" or "host:port"
 */
export function hostKey(hostOrHostPort: string): string | null {
  try {
    const u = new URL(`https://${hostOrHostPort.trim()}/`);
    const h = u.hostname.toLowerCase().replace(/\.+$/, "");
    if (!h) return null;
    return u.port ? `${h}:${u.port}` : h;
  } catch {
    return null;
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Why a URL may never be reached by a picture call, or null. Shape only; no lookup. */
function shapeProblem(url: URL): string | null {
  if (url.protocol !== "https:") return "is not https";
  if (url.username || url.password) return "carries a user name or password";
  const h = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (h.startsWith("[") || IPV4.test(h)) return "is an IP address, not a name";
  if (!h.includes(".")) return "is a machine name, not a public name";
  if (url.port !== "" && url.port !== "443") return "is on a port off the web";
  return null;
}

/** The fetch init every picture call uses: no cookies, no referrer, redirects never followed by the runtime. */
export const PROVIDER_FETCH_INIT = Object.freeze({ redirect: "manual" as const, credentials: "omit" as const, referrerPolicy: "no-referrer" as const });

const MAX_OUTPUT_HOPS = 3;

/**
 * Builds the two guarded fetches.
 *
 * @param apiBase the validated base address (https, no trailing slash): see `waveSpeedBaseOf`
 * @param outputHosts the hosts a made picture may be fetched from (host or host:port)
 * @param inner the runtime fetch
 * @param opts `log` to read what was allowed and refused; `extraGuard` for the host app's own rules
 */
export function pictureEgress(
  apiBase: string,
  outputHosts: readonly string[],
  inner: typeof fetch,
  opts: { log?: EgressLog; extraGuard?: ExtraGuard } = {},
): { api: typeof fetch; output: typeof fetch; log: EgressLog } {
  const log = opts.log ?? { allowed: [], refused: [] };
  const b = new URL(apiBase);
  const baseKey = hostKey(b.host);
  const prefix = b.pathname.replace(/\/+$/, "");
  const outs = new Set(outputHosts.map(hostKey).filter((k): k is string => k !== null));
  const refuse = (url: URL, why: string): never => {
    log.refused.push(url.host);
    throw new EgressRefused(url.host, why);
  };
  const common = (url: URL, method: string) => {
    const shape = shapeProblem(url);
    if (shape) refuse(url, shape);
    if (opts.extraGuard) {
      try { opts.extraGuard(url, method); } catch (e) { refuse(url, e instanceof Error ? e.message.slice(0, 120) : "is refused by the app's own rule"); }
    }
  };
  const toUrl = (input: Parameters<typeof fetch>[0]): URL => new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

  const api: typeof fetch = async (input, init) => {
    const url = toUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();
    common(url, method);
    const inPath = url.pathname === prefix || url.pathname.startsWith(`${prefix}/`);
    if (hostKey(url.host) !== baseKey || !inPath) refuse(url, "is not the picture service");
    log.allowed.push(url.host);
    return inner(url.href, { ...init, ...PROVIDER_FETCH_INIT });
  };

  const output: typeof fetch = async (input, init) => {
    let url = toUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();
    for (let hop = 0; ; hop++) {
      common(url, method);
      if (method !== "GET" || !outs.has(hostKey(url.host) ?? "")) refuse(url, "is not a host a picture may be fetched from");
      log.allowed.push(url.host);
      const res = await inner(url.href, { ...init, ...PROVIDER_FETCH_INIT });
      if (res.status < 300 || res.status >= 400) return res;
      const loc = res.headers.get("location");
      void res.body?.cancel().catch(() => undefined);
      if (!loc || hop + 1 >= MAX_OUTPUT_HOPS) return new Response(null, { status: 502, statusText: "redirect not followed" });
      url = new URL(loc, url);
    }
  };
  return { api, output, log };
}

/** Hosts the guard knows by name, for the one provider the unit speaks to. The base address is still configuration. */
export const PROVIDER_HOSTS: Readonly<Record<"wavespeed", string>> = { wavespeed: "api.wavespeed.ai" };
