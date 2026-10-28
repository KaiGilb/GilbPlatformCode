// The default host: the auth seam answered by a sign-in unit session (`SessionCredential`, peer `signin`).

import {
  NotSignedInError as SigninNotSignedInError,
  OriginNotAllowedError as SigninOriginNotAllowedError,
  type GilbSession,
  type SessionCredential,
} from "@kaigilb/gilbplatformcode-signin/session";
import { NotSignedInError, OriginNotAllowedError } from "./errors";
import type { LwsAuthHost, LwsSession } from "./lwsAuth";

/** The sign-in unit's own errors become the app's: the client tests `instanceof` against these. Any other error passes as it is. */
function mapError(e: unknown): unknown {
  if (e instanceof SigninNotSignedInError) return new NotSignedInError();
  if (e instanceof SigninOriginNotAllowedError) return new OriginNotAllowedError(e.message);
  return e;
}

async function mapped<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw mapError(e);
  }
}

/** The sign-in unit signs with `Authorization` and `DPoP`; the app's own seam answered `authorization` and `dpop`. Same headers, the app's keys. */
async function pair(session: SessionCredential, method: string, url: string): Promise<Record<string, string>> {
  const h = await session.authHeaders(method, url);
  return { authorization: h.Authorization, dpop: h.DPoP };
}

function toLwsSession(s: GilbSession): LwsSession {
  return {
    principal: s.principal,
    vault: s.vault ? { ...s.vault } : null,
    vaults: s.vaults.map((v) => ({ vaultId: v.vaultId, modes: [...v.modes] })),
  };
}

/**
 * The host for an app that signs in with the `signin` unit. Every header is the sender-constrained pair (`authorization: DPoP <token>`
 * and `dpop: <proof>`): there is no cookie-bridge bearer token for an app on its own origin to hold, so `bearerHeaderFor` answers
 * the same pair as the two DPoP calls, signed for `method` (GET when the caller names none). `invalidateDpop` and
 * `tokenManager.invalidate` both drop the held token (`session.invalidate()`, the key is kept).
 *
 * @param session the credential the app holds after sign-in
 */
export function lwsAuthFromSession(session: SessionCredential): LwsAuthHost {
  return {
    bearerHeaderFor: (url, method = "GET") => mapped(() => pair(session, method, url)),
    dpopReadAuth: (method, url) => mapped(() => pair(session, method, url)),
    dpopWriteAuth: (method, url) => mapped(() => pair(session, method, url)),
    invalidateDpop: () => session.invalidate(),
    tokenManager: {
      getSession: () => mapped(async () => toLwsSession(await session.getSession())),
      invalidate: () => session.invalidate(),
    },
  };
}
