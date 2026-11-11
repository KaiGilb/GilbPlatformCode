// The signed sender a host hands to code that asks for a `send(method, url, init)` (picture-set's `Send`, for one).
import { dpopReadAuth, dpopWriteAuth } from "./lwsAuth";

/** `(method, url, init?) => Promise<Response>`: the shape picture-set's file calls take. */
export type SignedSend = (method: string, url: string, init?: RequestInit) => Promise<Response>;

/**
 * A sender that signs every request with the host set by `setLwsAuth`: a GET or HEAD is signed as a read, any other method as a
 * write, each with a fresh proof for that method and URL. The headers the caller gives are kept (the credential headers win),
 * cookies are never sent (`credentials: "omit"`), and a URL outside the platform is sent unsigned (`credentialAllowedAt`, as for
 * every other function of this unit). A failure to sign rejects with `NotSignedInError` before anything is sent.
 *
 * @param fetchImpl the `fetch` to send with; the global one, looked up when a request is made, when not given
 */
export function signedSend(fetchImpl?: typeof fetch): SignedSend {
  return async (method, url, init = {}) => {
    const m = method.toUpperCase();
    const auth = m === "GET" || m === "HEAD" ? await dpopReadAuth(m, url) : await dpopWriteAuth(m, url);
    const headers = new Headers(init.headers);
    for (const [k, v] of Object.entries(auth)) headers.set(k, v);
    return (fetchImpl ?? fetch)(url, { ...init, method: m, headers, credentials: "omit" });
  };
}
