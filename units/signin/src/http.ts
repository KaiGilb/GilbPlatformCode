import {
  CodeRejectedError,
  SignInRefusedError,
  SignInUnreachableError,
  type CheckNameResult,
  type NamePrepResult,
} from "./types";
import { fetchTransport, type HttpOptions, type TransportResponse } from "./transport";

function join(origin: string, path: string): string {
  return `${origin.replace(/\/$/, "")}${path}`;
}

const ok = (res: TransportResponse): boolean => res.status >= 200 && res.status < 300;

// Every call takes an optional trailing `opts` carrying a caller-supplied transport
// (./transport). The positional parameters are unchanged, so existing callers keep working and
// keep `fetch`.

export async function requestSignInCode(
  origin: string,
  email: string,
  returnTo?: string,
  productName?: string,
  opts: HttpOptions = {},
): Promise<void> {
  const send = opts.transport ?? fetchTransport;
  let res: TransportResponse;
  try {
    const body: { email: string; return_to?: string } = { email: email.trim() };
    if (returnTo?.trim()) body.return_to = returnTo.trim();
    res = await send(join(origin, "/base/auth/email/request-code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 15000,
    });
  } catch {
    throw new SignInUnreachableError(productName);
  }
  if (!ok(res)) throw new SignInRefusedError(res.status, productName);
}

export async function prepareVaultName(
  origin: string,
  email: string,
  opts: HttpOptions = {},
): Promise<NamePrepResult> {
  const send = opts.transport ?? fetchTransport;
  try {
    const res = await send(join(origin, "/onboard/api/name-prep"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
      timeoutMs: 8000,
    });
    if (!ok(res)) return { isReturning: false, suggestedName: "" };
    const body = (await res.json()) as Record<string, unknown>;
    return {
      isReturning: body.isReturning === true,
      suggestedName: typeof body.suggestedName === "string" ? body.suggestedName : undefined,
      webIdDomain: typeof body.webIdDomain === "string" ? body.webIdDomain : undefined,
      address: typeof body.address === "string" ? body.address : undefined,
    };
  } catch {
    return { isReturning: false, suggestedName: "" };
  }
}

export async function checkVaultName(
  origin: string,
  name: string,
  opts: HttpOptions = {},
): Promise<CheckNameResult> {
  const send = opts.transport ?? fetchTransport;
  try {
    const res = await send(join(origin, "/onboard/api/check-name"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      timeoutMs: 8000,
    });
    if (!ok(res)) {
      return {
        available: false,
        reserved: false,
        name,
        requested: name,
        message: `Name check failed (HTTP ${res.status}).`,
      };
    }
    const body = (await res.json()) as Record<string, unknown>;
    const result: CheckNameResult = {
      available: body.available === true,
      reserved: body.reserved === true,
      name: typeof body.name === "string" ? body.name : name,
      address: typeof body.address === "string" ? body.address : undefined,
      message: typeof body.message === "string" ? body.message : undefined,
      suggestion: typeof body.suggestion === "string" ? body.suggestion : undefined,
      requested: name,
    };
    // Present only when the platform sends them (GilbPlatform nameChangeReport, reserved-names.ts).
    if (body.normalized === true) result.normalized = true;
    if (typeof body.note === "string" && body.note) result.note = body.note;
    return result;
  } catch {
    return {
      available: false,
      reserved: false,
      name,
      requested: name,
      message: "Could not check that name. Try again.",
    };
  }
}

export interface VerifyHttpBody {
  token?: string;
  principal?: string;
  needsVaultName?: boolean;
  suggestedName?: string;
}

/** First-party page hosts: the platform's own pages and the dev loopback rigs. Exact match. */
const FIRST_PARTY_PAGE_HOSTS: ReadonlySet<string> = new Set([
  "gilb.com",
  "www.gilb.com",
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

/**
 * Cookie mode for verify-code from a page on `hostname`.
 *
 * GilbPlatform `src/server/cors.ts` sends Access-Control-Allow-Credentials only for a first-party
 * page. An attested third-party origin does not get that header, so "include" makes the browser
 * discard the JSON, which already carries the token (the cookieless mint). Those pages send "omit".
 * Exact hostname only — a subdomain, a lookalike, or a suffix is third-party. No page location
 * (empty hostname) omits.
 */
export function credentialsForPage(hostname: string): RequestCredentials {
  return FIRST_PARTY_PAGE_HOSTS.has(hostname) ? "include" : "omit";
}

/**
 * The only read of `location`. Tests replace `read` to inject a page hostname.
 * No `location` (a worker, a test, a server) yields "" so {@link credentialsForPage} omits.
 */
export const pageHostname: { read: () => string } = {
  read(): string {
    try {
      const hostname = globalThis.location?.hostname;
      return typeof hostname === "string" ? hostname : "";
    } catch {
      return "";
    }
  },
};

export async function verifySignInCodeHttp(
  origin: string,
  email: string,
  code: string,
  dpopJwk: object,
  name?: string,
  productName?: string,
  opts: HttpOptions = {},
): Promise<VerifyHttpBody> {
  const send = opts.transport ?? fetchTransport;
  let res: TransportResponse;
  try {
    const body: Record<string, unknown> = {
      email: email.trim(),
      code: code.trim(),
      dpopJwk,
    };
    if (name?.trim()) body.name = name.trim();
    // ⚠ Cookie only on a first-party page. GilbPlatform src/server/cors.ts does not send
    // Access-Control-Allow-Credentials for an attested third-party origin, so "include" there
    // makes the browser drop this answer. The token is already in the JSON; those pages send
    // "omit". An explicit opts.credentials wins over credentialsForPage.
    res = await send(join(origin, "/base/auth/email/verify-code"), {
      method: "POST",
      credentials: opts.credentials ?? credentialsForPage(pageHostname.read()),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 15000,
    });
  } catch {
    throw new SignInUnreachableError(productName);
  }
  if (res.status === 401) throw new CodeRejectedError();
  if (!ok(res)) throw new SignInRefusedError(res.status, productName);
  return (await res.json()) as VerifyHttpBody;
}
