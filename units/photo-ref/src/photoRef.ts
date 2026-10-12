// Reading a stored photo reference — the address half of the problem.
//
// A stored profile photo is a short text value. Every app that shows a face has to turn that
// value into "which file, on which host". When each app grew its own parser, the copies drifted.
//
// ── THE MEASURED DRIFT ──────────────────────────────────────────────────────────────────────
// A user vault's records moved from `/base/e/<id>` to `/vault/e/<id>`. Four hand-written copies
// of the same alternation existed. Two were widened, two were not — and a missed one was the copy
// the profile picture calls. A `/vault/e/` reference therefore parsed to `null`, the byte loader
// returned null, and the face painted blank with NO error raised anywhere.
//
// The segment list below is the single place that alternation is written.

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

/** Percent-decodes an id, or null when the encoding is malformed (`%E0%A4%A`): a malformed
 *  reference names no file, and must not throw out of a read path. */
function decodeId(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

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
  if (fromFiles?.[1]) return decodeId(fromFiles[1]);
  const fromEntity = raw.match(ENTITY_RE);
  if (fromEntity?.[1]) return decodeId(fromEntity[1]);
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
  if (m?.[1]) return decodeId(m[1]) ?? "";
  if (!/[:/]/.test(raw) && raw.length >= 8) return raw;
  const i = raw.lastIndexOf("/");
  const tail = i === -1 ? raw : raw.slice(i + 1);
  if (!tail || tail === "i") return "";
  if ((VAULT_PATH_SEGMENTS as readonly string[]).includes(tail)) return "";
  if (tail.length < 8) return "";
  return tail;
}

/** The vault path segment an entity URI carries (`/vault` or `/base`), defaulting to `/base`
 *  when there is no URI to read — the same id-only case the origin resolver answers with the
 *  app's default origin. ⛔ Never hardcode the segment beside an origin: the URI in hand already
 *  carries it, and that is the only place it is true. */
export function vaultSegmentOf(entityUri: string | null | undefined): string {
  if (!entityUri) return "/base";
  try {
    const first = new URL(entityUri).pathname.split("/").filter(Boolean)[0];
    return (VAULT_PATH_SEGMENTS as readonly string[]).includes(first ?? "")
      ? `/${first}`
      : "/base";
  } catch {
    return "/base";
  }
}

/**
 * The origin a reference carries in its own right, or null when it carries none.
 *
 * ⚠ Load-bearing, and the reason this returns null rather than a default. A photo reference is
 * usually stored host-less (`/files/<id>`), because the file lives in the holder's own vault and
 * the vault is identified by the record you reached it through. A reader that quietly
 * substitutes the app's default origin asks the APEX for a file only the holder's node has, and
 * gets a 404 that looks exactly like "the photo was deleted". Returning null forces the caller
 * to supply the door it actually knows.
 */
export function photoRefOrigin(ref: string): string | null {
  const raw = ref.trim();
  if (!raw.includes("://")) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Resolve a stored reference to the absolute URL its bytes live at.
 *  `door` is the origin of the vault the reference was READ FROM — used only when the
 *  reference does not carry an origin of its own. */
export function photoBytesUrl(ref: string, door: string | null): string | null {
  const raw = ref.trim();
  if (!raw) return null;
  const own = photoRefOrigin(raw);
  if (own) return raw;
  if (isMediatedPhotoRef(raw)) {
    return door ? `${door.replace(/\/+$/, "")}${raw.startsWith("/") ? "" : "/"}${raw}` : null;
  }
  const id = fileIdFromPhotoRef(raw);
  if (!id || !door) return null;
  return `${door.replace(/\/+$/, "")}/files/${encodeURIComponent(id)}`;
}
