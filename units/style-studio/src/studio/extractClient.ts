// Client for the server's website-style reader. Auth is the host app's job: it passes getAuthHeaders (DPoP / Bearer).
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

export interface ExtractClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getAuthHeaders?: () => Promise<Record<string, string>>;
}

const GENERIC = "The site could not be read.";

function messageFor(status: number, code: unknown): string {
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
      const auth = opts.getAuthHeaders ? await opts.getAuthHeaders() : {};
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
      try {
        code = ((await res.json()) as { error?: unknown } | null)?.error;
      } catch {
        /* no body */
      }
      throw new ExtractError(messageFor(res.status, code), res.status);
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
