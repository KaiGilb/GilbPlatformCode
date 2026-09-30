/**
 * The sentence under a Share button when the request was refused.
 *
 * Status 403 uses one of two fixed openings. When the body has a string
 * `message`, that message is appended after a trim. When it does not, the
 * sentence says no reason was sent. No other status uses that opening.
 *
 * Any other status starts `Share failed:` then the status, then the reason.
 * The reason is the trimmed `message` when the body is JSON with a string
 * message. Otherwise it is the raw body. The whole sentence is then trimmed,
 * so a blank body does not leave a trailing space.
 *
 * Only `message` is read. An `error` field is ignored. A message that is not a
 * string is ignored. A message that trims to nothing counts as no message.
 * Status is the number 403, not the string "403".
 *
 * The body is not fetched here. Pass the status and the body text you already
 * have. This does not decide whether the share should be retried.
 */

export function shareRefusalMessage(status: number, detail: string): string {
  let served = "";
  try {
    const parsed = JSON.parse(detail) as { message?: unknown };
    if (typeof parsed.message === "string") served = parsed.message.trim();
  } catch {
    served = detail.trim();
  }
  if (status === 403) {
    return served
      ? `GilbPlatform refused this share: ${served}`
      : "GilbPlatform refused this share and sent no reason.";
  }
  return `Share failed: ${status} ${served || detail}`.trim();
}
