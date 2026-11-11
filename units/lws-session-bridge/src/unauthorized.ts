// What a client does with a 401: the one place that decides between "sign in again" and "the request is wrong".
import { isRequestFault, platformSentenceOf } from "@kaigilb/gilbplatformcode-signin/session";
import { NotSignedInError, RequestRefusedError } from "./errors";

/**
 * The error for a 401 answer. Reads the platform's `{"error","message"}` body. When the message names a DPoP proof fault
 * (htu, htm, iat, jti, ath, an invalid proof) the token is KEPT (`invalidate` is not called) and the error is
 * `RequestRefusedError`. Any other 401 (the token is invalid or expired, or there is no readable body) calls `invalidate`
 * and gives `NotSignedInError`, with the platform's sentence on it when there was one.
 *
 * @param res the response; only `text()` is read, so pass a clone when the caller reads the body again
 * @param invalidate drops the held token (`invalidateDpop` or `tokenManager.invalidate`)
 */
export async function errorForUnauthorized(
  res: { text(): Promise<string> },
  invalidate: () => void,
): Promise<NotSignedInError | RequestRefusedError> {
  const sentence = platformSentenceOf(await res.text().catch(() => ""));
  if (sentence !== undefined && isRequestFault(sentence)) return new RequestRefusedError(sentence);
  invalidate();
  return new NotSignedInError(sentence);
}
