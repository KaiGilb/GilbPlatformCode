// Client for the server's website-style reader. Auth is the host app's job: it passes `credential` (anything with
// authHeaders(method, url), such as the signin unit's SessionCredential) or getAuthHeaders (DPoP / Bearer).
import type { ExtractResult } from "./tabs";

/** An error whose message is already plain language, safe to show as is. */
export class ExtractError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = "ExtractError";
  }
}

/**
 * Anything that signs one request: `authHeaders(method, url)` answers the headers for exactly that method and URL.
 * The signin unit's `SessionCredential` has this shape, so it can be passed as it is; this unit imports nothing from signin.
 */
export interface ExtractCredential {
  authHeaders(method: string, url: string): Promise<Record<string, string>>;
}

export interface ExtractClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /**
   * Signs the read: this client calls `credential.authHeaders("POST", "<baseUrl>/base/style/extract")`, the exact method and URL it then
   * sends (the platform checks the proof against that URL). Wins over `getAuthHeaders` when both are given.
   */
  credential?: ExtractCredential;
  /** A function that answers the headers itself. It must sign `POST <baseUrl>/base/style/extract`; prefer `credential`. */
  getAuthHeaders?: () => Promise<Record<string, string>>;
}

const GENERIC = "The site could not be read.";

const SITE_REFUSED = "This site does not allow its style to be read. Try another site.";

// `code` and `siteStatus` come from the server's JSON body. A 502 `site_status` carries the status the site itself answered.
// `site_refused` is the server's newer code for the same case; this client accepts both, so the order of the two releases does not matter.
function messageFor(status: number, code: unknown, siteStatus?: unknown): string {
  if (status === 502 && code === "site_status" && (siteStatus === 401 || siteStatus === 403 || siteStatus === 429)) return SITE_REFUSED;
  if (code === "site_refused") return SITE_REFUSED;
  if (code === "site_unreachable") return "The site could not be reached.";
  if (status === 400 && code === "address_not_allowed") return "That address cannot be read (private or not allowed).";
  if (status === 401) return "Sign in first.";
  if (status === 415) return "That address is not a web page.";
  if (status === 429) return "Too many reads — wait a minute.";
  if (status === 504) return "The site took too long to answer.";
  return GENERIC;
}

export function makeExtractFromUrl(opts: ExtractClientOptions): (url: string) => Promise<ExtractResult> {
  const endpoint = `${opts.baseUrl.replace(/\/+$/, "")}/base/style/extract`;
  return async (url: string): Promise<ExtractResult> => {
    const doFetch = opts.fetchImpl ?? fetch;
    let res: Response;
    try {
      const auth = opts.credential
        ? await opts.credential.authHeaders("POST", endpoint)
        : opts.getAuthHeaders
          ? await opts.getAuthHeaders()
          : {};
      res = await doFetch(endpoint, {
        method: "POST",
        credentials: "omit",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } catch {
      throw new ExtractError(GENERIC);
    }
    if (!res.ok) {
      let code: unknown;
      let siteStatus: unknown;
      try {
        const b = (await res.json()) as { error?: unknown; status?: unknown } | null;
        code = b?.error;
        siteStatus = b?.status;
      } catch {
        /* no body */
      }
      throw new ExtractError(messageFor(res.status, code, siteStatus), res.status);
    }
    let body: Record<string, unknown>;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new ExtractError(GENERIC, res.status);
    }
    // Pass through only the four fields the Studio uses (it validates them again).
    const out: ExtractResult = {
      colors: Array.isArray(body.colors) ? (body.colors as string[]) : [],
      fonts: Array.isArray(body.fonts) ? (body.fonts as string[]) : [],
    };
    if (typeof body.radiusPx === "number") out.radiusPx = body.radiusPx;
    if (typeof body.logoUrl === "string") out.logoUrl = body.logoUrl;
    return out;
  };
}
