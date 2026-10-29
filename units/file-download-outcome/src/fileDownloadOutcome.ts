import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { NotSignedInError, bearerHeaderFor, dpopReadAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { serverReasonOrNull } from "@kaigilb/gilbplatformcode-lws-records";
import type { FileFetchOutcome } from "@kaigilb/gilbplatformcode-file-words";

/** The address of a file's bytes: `/files/<id>` at the origin of the vault the file entity names (`at`), else at the platform origin. */
export const FILE_RESOURCE_URL = (id: string, at?: string | null) =>
  `${vaultOriginOf(at)}/files/${id}`;

/** The Bearer auth header for one request to `url`, through the one credential seam (`bearerHeaderFor`). */
function authHeader(url: string): Promise<Record<string, string>> {
  return bearerHeaderFor(url);
}

/** The `detail` of a `failed` outcome for a bounded read whose answer was larger than the bound. */
export const FILE_TOO_LARGE = "too large";

/**
 * GET /files/<id>: dereference a file's bytes from the vault, reporting WHAT HAPPENED. It does not throw for an answer
 * (gone, forbidden, failed): each is a kind of the outcome.
 *
 * Tries DPoP first, then plain Bearer. `credentials: "omit"`: the token authenticates, no cookie principal is sent.
 *
 * @param id the opaque file-entity id (a bare id, or a `/files/<id>` / absolute form)
 * @param at the file ENTITY's own fully-qualified URI: the bytes are fetched at ITS origin. A file uploaded into a
 *   vault is served at that vault's door and at no other, so re-addressing it at the platform origin gives a 404 for a
 *   file that is there. Pass `null` only when no URI is held; a 404 that follows is reported as `unaddressed`, not as `gone`.
 * @param opts `maxBytes` bounds the read: an answer larger than the bound is refused (see {@link FILE_TOO_LARGE}).
 */
export async function downloadFileOutcome(id: string, at: string | null, opts: { maxBytes?: number } = {}): Promise<FileFetchOutcome> {
  const cleanId = id.replace(/^\/+/, "").replace(/^files\//i, "").split(/[?#]/)[0];
  // When the caller has no `entityUri` but DID hand us an absolute `/files/<id>` URL, that URL
  // is itself an address the vault named — use its origin rather than falling back to the apex.
  const addressedAt = at ?? (/^https?:\/\//i.test(id) ? id : null);
  if (!cleanId) {
    return { kind: "failed", status: null, url: "", detail: "no file id" };
  }
  const url = FILE_RESOURCE_URL(cleanId, addressedAt);
  // The discriminator asks where the read actually went, not whether an address was passed. With no address, or one that
  // names no vault (an empty string, an unresolved marker, a bare id, a relative path, or an entity URI whose host is the
  // platform origin itself), `vaultOriginOf` falls back to the platform origin, which holds no vault's files. A 404 from
  // there is evidence about our reach, not about the vault, so it is `unaddressed` and never `gone`. Ask the one function
  // that decides the origin; do not add a second "is this an address" test beside it.
  const vaultAddressed = addressedAt !== null && vaultOriginOf(addressedAt) !== baseOrigin();
  const notFound = (): FileFetchOutcome =>
    vaultAddressed ? { kind: "gone", url } : { kind: "unaddressed", url };

  const tryOnce = async (headers: Record<string, string>): Promise<FileFetchOutcome> => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        credentials: "omit",
        headers: { ...headers, accept: "*/*" },
      });
    } catch (e) {
      return { kind: "failed", status: null, url, detail: e instanceof Error ? e.message : null };
    }
    if (res.status === 404) return notFound();
    if (res.status === 401 || res.status === 403) return { kind: "forbidden", status: res.status, url };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { kind: "failed", status: res.status, url, detail: serverReasonOrNull(body) };
    }
    // A bounded read (a small mark in a list) refuses a file over the bound on the answer's own length, BEFORE the body is read.
    const declared = Number(res.headers.get("content-length"));
    if (opts.maxBytes !== undefined && Number.isFinite(declared) && declared > opts.maxBytes) {
      void res.body?.cancel?.().catch?.(() => {});
      return { kind: "failed", status: res.status, url, detail: FILE_TOO_LARGE };
    }
    const blob = await res.blob();
    // A 200 with no body is a broken read, ⛔ not a report that the vault is empty.
    if (blob.size === 0) return { kind: "failed", status: res.status, url, detail: "empty body" };
    if (opts.maxBytes !== undefined && blob.size > opts.maxBytes) return { kind: "failed", status: res.status, url, detail: FILE_TOO_LARGE };
    const ct = (res.headers.get("content-type") || blob.type || "application/octet-stream")
      .split(";")[0]!
      .trim();
    const typed = blob.type === ct ? blob : new Blob([blob], { type: ct || "application/octet-stream" });
    return { kind: "ok", blob: typed, url };
  };

  // DPoP first — multipod path that already reaches the principal's files.
  let first: FileFetchOutcome;
  try {
    first = await tryOnce({ ...(await dpopReadAuth("GET", url)) });
  } catch (e) {
    // DPoP mint failed — Bearer may still work; remember why in case Bearer fails too.
    first = { kind: "failed", status: null, url, detail: e instanceof Error ? e.message : "dpop mint failed" };
  }
  if (first.kind === "ok") return first;
  // Over the bound is an answer about the FILE, not about the credential: the second credential would be told the same.
  if (first.kind === "failed" && first.detail === FILE_TOO_LARGE) return first;

  let second: FileFetchOutcome;
  try {
    second = await tryOnce({ ...(await authHeader(url)) });
  } catch (e) {
    // Not signed in at all is a permission answer, not an absence answer.
    if (e instanceof NotSignedInError) return { kind: "forbidden", status: 401, url };
    second = { kind: "failed", status: null, url, detail: e instanceof Error ? e.message : null };
  }
  if (second.kind === "ok") return second;

  // Neither credential produced bytes. Report the MORE INFORMATIVE of the two answers rather
  // than the last one — a DPoP `gone` next to a Bearer transport blip must not become "failed",
  // and a `forbidden` on either leg must never be downgraded to an absence claim.
  const rank = (o: FileFetchOutcome) =>
    o.kind === "forbidden" ? 3 : o.kind === "gone" || o.kind === "unaddressed" ? 2 : 1;
  return rank(first) >= rank(second) ? first : second;
}

/**
 * Blob-or-null shim over {@link downloadFileOutcome}, for the PREVIEW callers (avatars, image picker) whose whole response
 * to any failure is to paint a placeholder: they make no claim to the user, so they need no discrimination. Do NOT use
 * this on a surface that tells the user WHY: use {@link downloadFileOutcome}.
 */
export async function downloadFile(id: string, at: string | null): Promise<Blob | null> {
  const outcome = await downloadFileOutcome(id, at);
  return outcome.kind === "ok" ? outcome.blob : null;
}
