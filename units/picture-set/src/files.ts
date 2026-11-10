import { entityIdTail } from "@kaigilb/gilbplatformcode-photo-ref";
import { serverReasonOrNull } from "@kaigilb/gilbplatformcode-lws-records";
import { buildCopyMap, pickBySize } from "./copies";

/**
 * A signed request sender, supplied by the host (it adds the host's sign-in proof; this unit holds no credential and names no host).
 * `fetch` itself is a valid sender when the host needs no proof.
 */
export type Send = (method: string, url: string, init?: RequestInit) => Promise<Response>;

/** One file of a vault listing: the platform's file metadata (GET /lws/vault/:vaultId/files, one entry of `files`). */
export type VaultFile = {
  entity: string;
  /** null when the vault has no name for the file. */
  fileName: string | null;
  mediaType?: string | null;
  byteSize?: number | null;
  contentHash?: string | null;
  storedWith?: string | null;
  updatedAt?: string | null;
  /** true for an ended file (only seen when the listing asks for `lifecycle` ended or all). */
  ended?: boolean;
  /**
   * The original this file was made from. Production lists it on each entry (`transcodedFrom`, an entity URI, or null for a file that is not
   * a copy; GilbPlatform src/read/file-browse.ts:129-133, since 78d1fb1d / #691). It is kept as the platform sent it. When the listing was
   * asked with the `transcodedFrom` filter, it is set to that original on each answered file. A caller may also add it from record rows.
   */
  transcodedFrom?: string | null;
};

/** A refusal from the vault: the HTTP status and the platform's own message, word for word (the body text when it carries no message). */
export class PictureFilesError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PictureFilesError";
  }
}

export type ListOptions = {
  /** The origin that serves the vault (no trailing slash needed). Required: this unit knows no host. */
  origin: string;
  send: Send;
  /** Page size; the platform clamps it to 200 and defaults to 50. Default 200. */
  pageSize?: number;
  /** List only the copies of this original (the route's `transcodedFrom` filter); each answered file then carries it as `transcodedFrom`. */
  transcodedFrom?: string;
  /** Stop after this many pages. Default 100. */
  maxPages?: number;
};

const trimOrigin = (o: string): string => o.replace(/\/+$/, "");

async function refusal(res: Response): Promise<PictureFilesError> {
  const text = await res.text().catch(() => "");
  return new PictureFilesError(res.status, serverReasonOrNull(text) ?? (text.trim() || `HTTP ${res.status}`));
}

/**
 * Every file of a vault: GET <origin>/lws/vault/<vaultId>/files?limit=&offset=, page by page (offset grows by the number of files each page
 * held) until a page is empty or short, `count` is reached, or `maxPages` (default 100). A file that appears on two pages is kept once, by
 * entity. The route lists live files only. A non-2xx answer throws a `PictureFilesError` with the status and the platform's message.
 */
export async function listVaultFiles(vaultId: string, opts: ListOptions): Promise<VaultFile[]> {
  const limit = Math.min(Math.max(1, opts.pageSize ?? 200), 200);
  const maxPages = opts.maxPages ?? 100;
  const base = `${trimOrigin(opts.origin)}/lws/vault/${encodeURIComponent(vaultId)}/files`;
  const out = new Map<string, VaultFile>();
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (opts.transcodedFrom) q.set("transcodedFrom", opts.transcodedFrom);
    const res = await opts.send("GET", `${base}?${q}`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw await refusal(res);
    const json = (await res.json()) as { count?: unknown; files?: unknown };
    const files = Array.isArray(json.files) ? (json.files as Record<string, unknown>[]) : [];
    let fresh = 0;
    for (const f of files) {
      if (typeof f.entity !== "string" || f.entity === "" || out.has(f.entity)) continue;
      fresh++;
      const file: VaultFile = { ...(f as object), entity: f.entity, fileName: typeof f.fileName === "string" ? f.fileName : null };
      if (opts.transcodedFrom) file.transcodedFrom = opts.transcodedFrom;
      out.set(f.entity, file);
    }
    offset += files.length;
    const count = typeof json.count === "number" ? json.count : null;
    // A page that added nothing new is a repeat: stop rather than loop.
    if (files.length === 0 || fresh === 0 || files.length < limit || (count !== null && offset >= count)) break;
  }
  return [...out.values()];
}

const THUMB_NAME = /^(.*)-320(\.[A-Za-z0-9]+)$/;

/**
 * master entity -> its smallest copy's entity (fewest `byteSize`; a tie goes to the lower entity as text; a copy with no size is not offered).
 * Linked files (`transcodedFrom` set, or named by another file's link) are matched by the PLATFORM link through `buildCopyMap`, so both link
 * shapes (copy -> master, and master and copy -> full) work, and their file names are never read. Only files with no link at all fall back to
 * the picture-set name rule: `<base>.<ext>` and `<base>-320.<ext>` (the master may also be matched by `<base>` with another extension).
 * A master with no smaller copy is left out; `thumbFor` then answers the master.
 */
export function thumbIndexFor(files: readonly VaultFile[]): Map<string, string> {
  const rows = files.map((f) => ({
    entityUri: f.entity,
    body: { fileByteSize: f.byteSize ?? undefined, ...(f.transcodedFrom ? { transcodedFrom: f.transcodedFrom } : {}) } as Record<string, unknown>,
  }));
  const tails = new Map<string, VaultFile>();
  for (const f of files) {
    const t = entityIdTail(f.entity);
    if (t) tails.set(t, f);
  }
  const linked = new Set<string>();
  for (const f of files) {
    if (!f.transcodedFrom) continue;
    const t = entityIdTail(f.entity);
    const from = entityIdTail(f.transcodedFrom);
    if (t) linked.add(t);
    if (from) linked.add(from);
  }
  const index = new Map<string, string>();
  for (const [tail, copies] of buildCopyMap(rows)) {
    if (!linked.has(tail)) continue;
    const self = tails.get(tail);
    const best = pickBySize(copies, 0);
    if (self && best && best.uri !== self.entity) index.set(self.entity, best.uri);
  }
  const unlinked = files.filter((f) => {
    const t = entityIdTail(f.entity);
    return !(t && linked.has(t));
  });
  const masters = new Map<string, string>();
  const byBase = new Map<string, string>();
  for (const f of unlinked) {
    if (!f.fileName || THUMB_NAME.test(f.fileName)) continue;
    masters.set(f.fileName, f.entity);
    byBase.set(f.fileName.replace(/\.[^.]*$/, ""), f.entity);
  }
  for (const f of unlinked) {
    const m = f.fileName ? THUMB_NAME.exec(f.fileName) : null;
    if (!m) continue;
    const master = masters.get(`${m[1]}${m[2]}`) ?? byBase.get(m[1]!);
    if (master) index.set(master, f.entity);
  }
  return index;
}

/** The small copy of a master picture, or the master itself when the index has none. */
export function thumbFor(master: string, index: ReadonlyMap<string, string>): string {
  return index.get(master) ?? master;
}

/**
 * Ends one file: DELETE <the file's own origin>/files/<id of the file>. The platform DESTROYS NOTHING: the file is marked ended and its bytes
 * stay at their address. Resolves on 204 or 200, and on 404 (the file is already gone, or it is not this caller's to see: the platform answers
 * both alike, so a 404 is not an error here). Any other status throws a `PictureFilesError` with the status and the platform's message (a
 * reader without write access gets 403).
 *
 * The platform finds the file at the host the request names (GilbPlatform src/routes/files.ts:767, `https://<host>/vault/e/<id>` on a user
 * vault), and answers 404 for a file that is at another host. So a DELETE sent to the wrong origin ends nothing and looks like "already
 * gone". When `fileEntity` is an absolute URL the request therefore goes to that URL's own origin, and `origin` must name the same host: when
 * it does not, this throws a `PictureFilesError` (status 0) naming both and sends nothing. A 404 counts as gone only on that own origin.
 * A `fileEntity` that is not an absolute URL cannot name a host: it is sent to `origin`, as before.
 */
export async function endFile(fileEntity: string, opts: { origin: string; send: Send }): Promise<void> {
  const id = entityIdTail(fileEntity);
  if (!id) throw new PictureFilesError(0, `Not a file address: ${fileEntity}`);
  let target = trimOrigin(opts.origin);
  let entityUrl: URL | null = null;
  try {
    entityUrl = new URL(fileEntity);
  } catch {
    /* not an absolute URL: no host to read */
  }
  if (entityUrl && entityUrl.host) {
    let given: string | null = null;
    try {
      given = new URL(opts.origin).host;
    } catch {
      /* unparsable origin */
    }
    if (given !== entityUrl.host) {
      throw new PictureFilesError(
        0,
        `The file ${fileEntity} is at ${entityUrl.host}, but the origin given is ${opts.origin}. Pass the origin of the vault that holds the file.`,
      );
    }
    target = entityUrl.origin;
  }
  const res = await opts.send("DELETE", `${target}/files/${encodeURIComponent(id)}`);
  if (res.status === 204 || res.status === 200 || res.status === 404) return;
  throw await refusal(res);
}

/**
 * Ends the master, then each copy. A failure does not stop the rest. Answers the entities that failed, with the error of each
 * (empty when all were ended). A copy equal to the master, or repeated, is ended once.
 */
export async function endPictureFiles(
  master: string,
  copies: readonly string[],
  opts: { origin: string; send: Send },
): Promise<{ entity: string; error: Error }[]> {
  const failed: { entity: string; error: Error }[] = [];
  const seen = new Set<string>();
  for (const e of [master, ...copies]) {
    if (!e || seen.has(e)) continue;
    seen.add(e);
    try {
      await endFile(e, opts);
    } catch (err) {
      failed.push({ entity: e, error: err instanceof Error ? err : new Error(String(err)) });
    }
  }
  return failed;
}
