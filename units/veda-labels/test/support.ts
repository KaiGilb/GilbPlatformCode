// Test support: a fake `fetch` that records its calls, and a fake auth host.
import type { LwsAuthHost } from "@kaigilb/gilbplatformcode-lws-session-bridge";

export const ORIGIN = "https://platform.example.test";

export interface Reply {
  status?: number;
  body?: unknown;
  /** The network fails (the promise rejects). */
  fails?: boolean;
  /** The body is not JSON (`res.json()` rejects). */
  badJson?: boolean;
  /** The reply is held until this promise resolves. */
  gate?: Promise<void>;
}

export interface Call {
  url: string;
  headers: Record<string, string>;
}

/** A fake `fetch`: `answer(url)` says what each request gets. Every call is recorded in `calls`. */
export function fakeFetch(answer: (url: string) => Reply) {
  const calls: Call[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) } });
    const r = answer(url);
    if (r.gate) await r.gate;
    if (r.fails) throw new TypeError("network down");
    const status = r.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        if (r.badJson) throw new SyntaxError("not json");
        return r.body;
      },
    } as unknown as Response;
  };
  return { fn: fn as typeof fetch, calls };
}

/** A fake auth host whose bearer is `Bearer t-<url>` (so a test sees which URL it was asked for). */
export function fakeAuthHost(): LwsAuthHost & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    bearerHeaderFor: async (url: string) => {
      asked.push(url);
      return { authorization: `Bearer t-${url}` };
    },
    dpopReadAuth: async () => ({}),
    dpopWriteAuth: async () => ({}),
    invalidateDpop: () => {},
    tokenManager: { getSession: async () => ({ principal: "p", vault: null, vaults: [] }), invalidate: () => {} },
  };
}

/** A promise you resolve by hand. */
export function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
}
