// Which file a stored photo reference names, and the id at the end of an entity address. Copied by script from the private package `gilb-photo`
// (`src/photoRef.ts`, lines 17-31 and 33-77; the repository at commit bf56ec7, the file last changed by commit 8b5c74d8570e78f0686258164b9f4f4f8b6a595a),
// because the unit `photo-ref` is NOT equal to it: on a malformed percent-encoding this throws a `URIError`, that one answers null / "".

/** The vault path segments that are live at once. A user vault addresses its records under
 *  `/vault/...`; the identity node and the ontology master use `/base/...`.
 *  ⛔ Do not inline this alternation at a call site. Import it. */
export const VAULT_PATH_SEGMENTS = ["base", "vault"] as const;

/** The segment alternation as a regex fragment, BUILT from the list above so a segment added
 *  there cannot fail to reach the parsers that match on it. */
export const VAULT_SEGMENT_PATTERN = `(?:${VAULT_PATH_SEGMENTS.join("|")})`;

const FILE_PATH_RE = /\/files\/([^/?#]+)/i;
const ENTITY_RE = new RegExp(`/${VAULT_SEGMENT_PATTERN}/e/([^/?#]+)`, "i");
const ENTITY_OR_RECORD_RE = new RegExp(
  `/(?:${VAULT_SEGMENT_PATTERN}/e|lws/r)/([^/?#]+)`,
  "i",
);

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

/**
 * The trailing opaque id of an entity or record URI, on EITHER vault segment.
 * Refuses a WebID tail (`…/i`) and a bare vault root (`…/base`, `…/vault`), neither of which
 * is a resource id — asking for them produced real request noise before they were fenced out.
 */
export function entityIdTail(uriOrId: string): string {
  const raw = uriOrId.trim();
  if (!raw) return "";
  const m = raw.match(ENTITY_OR_RECORD_RE);
  if (m?.[1]) return decodeURIComponent(m[1]);
  if (!/[:/]/.test(raw) && raw.length >= 8) return raw;
  const i = raw.lastIndexOf("/");
  const tail = i === -1 ? raw : raw.slice(i + 1);
  if (!tail || tail === "i") return "";
  if ((VAULT_PATH_SEGMENTS as readonly string[]).includes(tail)) return "";
  if (tail.length < 8) return "";
  return tail;
}
