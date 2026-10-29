// An organization's logo as a small mark in a LIST (a unit row, a chain entry).
// A list mark is not the header logo: it must stay cheap however many marks the page draws and whatever file a record points at.
//   • BOUNDED: the app writes `a:logo` at the lean copy (a few KB). A record whose logo points at a full-size file (another writer,
//     an API write) was measured at 55 MB for one page of 50 units. A mark reads at most `ORG_LOGO_MAX_BYTES`; over that it shows the
//     organization's initial, and the file is not asked for again this session.
//   • SHARED: one download per file, however many marks name it (a promise per file, the way `RecordFace` shares a person's picture).
//   • POOLED: at most `ORG_LOGO_POOL` downloads in flight, so a page of 50 different logos does not open 50 requests at once.
// Only a successful read and an over-the-bound answer are remembered; a failed read is tried again by the next mark.
import type { FileFetchOutcome } from "@kaigilb/gilbplatformcode-file-words";
import { FILE_TOO_LARGE } from "./fileTooLarge";
import { fileIdFromPhotoRef } from "./fileIdFromPhotoRef";
import type { OrgMarkHost } from "./orgMarkHost";

export const ORG_LOGO_MAX_BYTES = 256 * 1024;
export const ORG_LOGO_POOL = 4;
const CACHE_MAX = 200;

type Download = (id: string, at: string | null, opts: { maxBytes: number }) => Promise<FileFetchOutcome>;

const cache = new Map<string, Promise<Blob | null>>();
let active = 0;
const waiting: (() => void)[] = [];

/** Test seam: ⛔ never called by product code. */
export function __resetOrgLogos(): void {
  cache.clear();
  active = 0;
  waiting.length = 0;
}

async function pooled<T>(run: () => Promise<T>): Promise<T> {
  if (active >= ORG_LOGO_POOL) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await run();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** The logo's bytes for a list mark, or null (none, too large, or not readable). `door` is the vault the mark is drawn in. */
export function loadOrgLogoBlob(host: OrgMarkHost, logo: string, door: string | null, deps: { download?: Download } = {}): Promise<Blob | null> {
  const id = fileIdFromPhotoRef(logo);
  if (!id) return Promise.resolve(null);
  const at = logo.includes("://") ? logo : door;
  const key = `${at ?? ""}\u0000${id}`;
  const had = cache.get(key);
  if (had) return had;
  const download: Download = deps.download ?? ((fid, where, opts) => host.downloadFileOutcome(fid, where, opts));
  const p = pooled(async () => {
    const o = await download(id, at, { maxBytes: ORG_LOGO_MAX_BYTES });
    if (o.kind === "ok") return o.blob.size > ORG_LOGO_MAX_BYTES ? ("large" as const) : o.blob;
    return o.kind === "failed" && o.detail === FILE_TOO_LARGE ? ("large" as const) : null;
  })
    .catch(() => null)
    .then((r) => {
      if (r === null) cache.delete(key);
      return r === "large" ? null : r;
    });
  cache.set(key, p);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return p;
}
