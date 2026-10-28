// The platform client this unit talks to a vault through. It is injected: `{ origin, fetch }`, where `fetch` is the host app's AUTHENTICATED
// fetch. This unit never sees a credential.

/** The host app's authenticated fetch. */
export type PlatformFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface PlatformClient {
  /** Origin serving the platform routes, e.g. `https://kaigilb.example.test`. */
  origin: string;
  fetch: PlatformFetch;
}

/** The platform answered, and the answer was not a success. `status` 0 means it was not reached. */
export class PlatformError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;
  constructor(message: string, status: number, url: string, body: string) {
    super(message);
    this.name = "PlatformError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

const trimOrigin = (origin: string): string => origin.replace(/\/+$/, "");

/** The URL a route path is requested at. */
export function routeUrl(platform: PlatformClient, path: string): string {
  return `${trimOrigin(platform.origin)}/${path.replace(/^\/+/, "")}`;
}

export interface PlatformAnswer {
  status: number;
  url: string;
  headers: Headers;
  /** The parsed JSON body, or `null` when the body was empty or not JSON. */
  json: Record<string, unknown> | null;
  text: string;
}

/** One request. Throws `PlatformError` only when the platform could not be reached; the caller
 *  decides which statuses are answers. `cache` is passed to the host's fetch as its cache mode:
 *  `no-store` for a read whose ETag a write is conditioned on, because the platform
 *  serves `GET /base/e/<id>` as `public, max-age=60` and a browser fetch would otherwise answer a
 *  re-read from its own cache. */
export async function request(
  platform: PlatformClient,
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
  cache?: RequestCache,
  bound?: RequestBound,
): Promise<PlatformAnswer> {
  if (bound && (bound.signal || bound.timeoutMs !== undefined)) return boundedRequest(platform, method, url, body, headers, cache, bound);
  return plainRequest(platform, method, url, body, headers, cache);
}

/** An optional bound on one request: it ends (as "could not be reached") when `timeoutMs` passes or `signal` aborts, even if the host's fetch ignores the signal. */
export interface RequestBound {
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function boundedRequest(platform: PlatformClient, method: string, url: string, body: unknown, headers: Record<string, string> | undefined, cache: RequestCache | undefined, bound: RequestBound): Promise<PlatformAnswer> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onParent: (() => void) | undefined;
  const ended = new Promise<never>((_, reject) => {
    const stop = (why: string) => {
      ac.abort();
      reject(new PlatformError(`${method} ${url} could not be reached: ${why}`, 0, url, ""));
    };
    if (bound.timeoutMs !== undefined) timer = setTimeout(() => stop(`no answer in ${bound.timeoutMs} ms`), bound.timeoutMs);
    if (bound.signal) {
      if (bound.signal.aborted) stop("cancelled");
      else {
        onParent = () => stop("cancelled");
        bound.signal.addEventListener("abort", onParent, { once: true });
      }
    }
  });
  ended.catch(() => undefined);
  try {
    return await Promise.race([plainRequest(platform, method, url, body, headers, cache, ac.signal), ended]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onParent) bound.signal?.removeEventListener("abort", onParent);
  }
}

async function plainRequest(
  platform: PlatformClient,
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
  cache?: RequestCache,
  signal?: AbortSignal,
): Promise<PlatformAnswer> {
  const init: RequestInit = { method };
  if (signal) init.signal = signal;
  if (cache !== undefined) init.cache = cache;
  if (body !== undefined) {
    init.headers = { "content-type": "application/json", ...headers };
    init.body = JSON.stringify(body);
  } else if (headers) init.headers = { ...headers };
  let res: Response;
  try {
    res = await platform.fetch(url, init);
  } catch (cause) {
    throw new PlatformError(`${method} ${url} could not be reached: ${String(cause)}`, 0, url, "");
  }
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  if (text) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
    } catch {
      json = null;
    }
  }
  return { status: res.status, url, headers: res.headers, json, text };
}

/** A vault id as a path segment. The vault id is the `vaultId` the platform's own vault
 *  enumeration serves (`GET /lws/vaults`), percent-encoded. ⛔ Never a name or a host label. */
export function vaultSegment(vaultId: string): string {
  return encodeURIComponent(vaultId);
}
