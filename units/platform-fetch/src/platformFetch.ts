// An authenticated fetch for a platform client: every URL is moved under the platform-host rule first, then signed for that one request.
import { atVaultOrigin } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { dpopWriteAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";

/** A fetch: a URL and an init in, a response out. */
export type TermFetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The host app's authenticated fetch for the package's platform client: the init passed on, with
 * the sender-constrained credential's headers for THIS request (a fresh proof per call).
 *
 * ⚠ The package builds its URLs as text from data (an `@context` IRI of `urn:.evil.example/ctx` became
 * `https://holder.platform.example.test.evil.example/ctx`), so every URL passes the platform-host rule here, before the
 * credential is signed for it.
 */
export function platformFetch(inner: TermFetch = (url, init) => fetch(url, init)) {
  return async (rawUrl: string, init?: RequestInit): Promise<Response> => {
    const url = atVaultOrigin(rawUrl);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    for (const [k, v] of Object.entries(await dpopWriteAuth(method, url))) headers.set(k, v);
    return inner(url, { ...init, headers });
  };
}
