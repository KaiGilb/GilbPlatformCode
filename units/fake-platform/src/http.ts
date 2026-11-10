import type { FakeState } from "./types";

/** What the platform serves as `@context` on a record (units/lws-records documents it: the LWS core context). */
export const LWS_CONTEXT = "https://www.w3.org/ns/lws/v1";

export interface Resolved {
  origin: string;
  host: string;
  domain: string;
  hosts: Set<string>;
  transcodedFromInListing: boolean;
  dpop: "strict" | "platform";
  undefinedTerms: Set<string>;
  proofWindowSeconds: number;
  now: () => number;
}
export interface Core {
  o: Resolved;
  s: FakeState;
  nextId: () => string;
}

export interface Req {
  method: string;
  url: URL;
  path: string;
  host: string;
  query: URLSearchParams;
  headers: Headers;
  /** The body as text when it was text or bytes; null when none. */
  bodyText: string | null;
  /** The body's bytes; null when none. */
  bodyBytes: Uint8Array | null;
  params: Record<string, string>;
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
export const empty = (status: number, headers: Record<string, string> = {}): Response => new Response(null, { status, headers });

/** The platform's error body: `{ error: <the error's name>, message }` plus its details (src/server/app.ts:244-255). */
export function failure(status: number, name: string, message: string, details?: Record<string, unknown>): Response {
  return json(status, { error: name, message, ...(details ?? {}) });
}
export const unauthorized = (message: string, note?: string): Response =>
  new Response(JSON.stringify({ error: "Unauthorized", message }), {
    status: 401,
    headers: { "content-type": "application/json", ...(note ? { "x-fake-platform-note": note } : {}) },
  });
export const forbidden = (message: string): Response => failure(403, "Forbidden", message);
export const badRequest = (message: string, details?: Record<string, unknown>): Response => failure(400, "BadRequest", message, details);
/** A request body the route's schema refuses (Fastify's validation answer; the exact `error` token is unverified, see DESIGN doubt 6). */
export const schemaRefusal = (message: string): Response => failure(400, "Bad Request", message);
export const notFound = (uri: string): Response => failure(404, "NotFound", `No LWS resource at ${uri}`);

/** A body that is JSON text; `undefined` when absent, `invalid` when it does not parse. */
export function parseBody(req: Req): { ok: true; value: unknown } | { ok: false } {
  if (req.bodyText === null || req.bodyText === "") return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(req.bodyText) };
  } catch {
    return { ok: false };
  }
}
