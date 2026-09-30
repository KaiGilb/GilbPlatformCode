/**
 * Read the `sub` claim from a JWT the caller already holds.
 *
 * The signature is not checked. This is not proof of who the person is, and it
 * is not a reason to grant anything. The app uses it only to pre-fill an email
 * box from a token it just received. A caller that needs to know the subject
 * for access must use the session the server already accepted.
 *
 * Nothing is trimmed. A `sub` that is not a string is undefined. A broken
 * payload is undefined. The third segment is ignored.
 */

/**
 * The `sub` string, or undefined.
 *
 * The middle segment is base64url. `-` becomes `+` and `_` becomes `/`, then
 * `=` is added so the length is a multiple of 4. Padding is counted from the
 * original segment length, before those two replacements (they do not change
 * the length).
 */
export function subFromJwt(jwt: string): string | undefined {
  try {
    const seg = jwt.split(".")[1];
    if (!seg) return undefined;
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/").padEnd(seg.length + ((4 - (seg.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(b64)) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}
