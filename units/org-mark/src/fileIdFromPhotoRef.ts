// Which file a stored photo reference names. Copied by script from the private package `gilb-photo` (`src/photoRef.ts`, commit 8b5c74d8570e78f0686258164b9f4f4f8b6a595a, the last commit that touched it),
// because the unit `photo-ref` is NOT equal to it: this one throws on a malformed percent-encoding, that one answers null.

/** The vault path segments that are live at once. A user vault addresses its records under
 *  `/vault/...`; the identity node and the ontology master use `/base/...`.
 *  ⛔ Do not inline this alternation at a call site. Import it. */
export const VAULT_PATH_SEGMENTS = ["base", "vault"] as const;

/** The segment alternation as a regex fragment, BUILT from the list above so a segment added
 *  there cannot fail to reach the parsers that match on it. */
export const VAULT_SEGMENT_PATTERN = `(?:${VAULT_PATH_SEGMENTS.join("|")})`;

const FILE_PATH_RE = /\/files\/([^/?#]+)/i;
const ENTITY_RE = new RegExp(`/${VAULT_SEGMENT_PATTERN}/e/([^/?#]+)`, "i");

/** A reference that is NOT a file path at all, but a server-mediated route that answers with
 *  bytes for a principal the viewer is entitled to see. Recognised so it is never fed to the
 *  file loader, which would strip it to a nonsense id. */
export function isMediatedPhotoRef(ref: string): boolean {
  return /\/base\/connect\/profile-photo\b/i.test(ref);
}

/**
 * The file id inside any common photo reference shape:
 *   `/files/<id>` · `https://…/files/<id>` · `https://…/base/e/<id>` · `https://…/vault/e/<id>`
 *   · a bare opaque id
 * Returns null when the value names no file — including for a mediated route, which is a
 * different kind of reference and is the caller's to recognise via {@link isMediatedPhotoRef}.
 */
export function fileIdFromPhotoRef(ref: string): string | null {
  const raw = ref.trim();
  if (!raw) return null;
  if (isMediatedPhotoRef(raw)) return null;
  const fromFiles = raw.match(FILE_PATH_RE);
  if (fromFiles?.[1]) return decodeURIComponent(fromFiles[1]);
  const fromEntity = raw.match(ENTITY_RE);
  if (fromEntity?.[1]) return decodeURIComponent(fromEntity[1]);
  // A bare opaque id — no scheme, no path. Length floor keeps `i` and `base` out.
  if (!/[:/]/.test(raw) && raw.length >= 8) return raw;
  return null;
}
