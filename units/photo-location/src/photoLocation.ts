/**
 * What to do with a photo address the caller already holds.
 *
 * This does not fetch the bytes, and it does not build an entitled photo URL.
 * A mediated profile-photo address is left alone. Rewriting it to `/files/<id>`
 * is the mistake this unit exists to prevent.
 */

/**
 * True when the address is already something an image element can show.
 *
 * Trimmed. Undefined is false. Only a `blob:` or `data:` prefix counts.
 * The prefix is case-sensitive. `BLOB:` is false.
 */
export function isReadyPhotoSrc(location: string | undefined): boolean {
  const s = location?.trim() ?? "";
  return s.startsWith("blob:") || s.startsWith("data:");
}

/**
 * True when this is the rung-gated profile-photo address.
 *
 * Trimmed, then the path must contain `/base/connect/profile-photo` and the
 * next character must be `?` or the end. A trailing slash does not match.
 * The spelling is case-sensitive. The query is not inspected.
 */
export function isMediatedProfilePhotoUrl(location: string): boolean {
  return /\/base\/connect\/profile-photo(?:\?|$)/.test(location.trim());
}

/**
 * A vault-relative `/files/<id>` path when the location is a file or an entity.
 *
 * Order:
 * 1. Trim. An empty string stays empty.
 * 2. A mediated profile-photo address is returned as trimmed, query included.
 * 3. A string that already starts with `/files/` is returned as trimmed.
 * 4. An absolute `http://` or `https://` URL (either case) whose path starts
 *    with `/files/` returns that pathname only. The query is dropped.
 *    A URL that does not parse falls through.
 * 5. A string that ends in `/e/<id>` or `/base/e/<id>`, with an optional
 *    trailing slash, becomes `/files/<id>`. The id is not decoded.
 *    A query on that string means it does not match, and the trimmed original
 *    is returned. This arm is wide: `note/e/abc` becomes `/files/abc`.
 * 6. Anything else is the trimmed original.
 */
export function normalizePhotoLocation(location: string): string {
  const trimmed = location.trim();
  if (!trimmed) return trimmed;
  if (isMediatedProfilePhotoUrl(trimmed)) return trimmed;
  if (trimmed.startsWith("/files/")) return trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      if (u.pathname.startsWith("/files/")) return u.pathname;
    }
  } catch {
    /* not a URL */
  }
  const entity = /\/(?:base\/)?e\/([^/?#]+)\/?$/.exec(trimmed);
  const id = entity?.[1];
  if (id) return `/files/${id}`;
  return trimmed;
}
