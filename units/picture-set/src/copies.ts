import { entityIdTail } from "@kaigilb/gilbplatformcode-photo-ref";

type Raw = Record<string, unknown>;

/** A fact by its bare slug or its `a:` spelling. */
function pick(raw: Raw, slug: string): unknown {
  return raw[`a:${slug}`] !== undefined ? raw[`a:${slug}`] : raw[slug];
}

/** A link as text: `{ "@id": … }`, a string, or the first of a list of either. */
function linkText(v: unknown): string | null {
  const one = Array.isArray(v) ? v[0] : v;
  if (typeof one === "string") return one.trim() === "" ? null : one;
  if (one && typeof one === "object" && typeof (one as Raw)["@id"] === "string") return (one as Raw)["@id"] as string;
  return null;
}

function countOf(v: unknown): number | null {
  const one = Array.isArray(v) ? v[0] : v;
  if (typeof one === "number" && Number.isFinite(one)) return one;
  if (typeof one === "string" && /^\s*\d+\s*$/.test(one)) return Number(one);
  return null;
}


/**
 * master file id -> the smallest copy of it (fewest `fileByteSize` bytes; a file with no size is skipped; a tie goes to the lower IRI as text).
 * A copy names its master in `transcodedFrom`; the master counts as a candidate too, when it has a size. Ids are compared by their tail,
 * so `/base/e/` and `/vault/e/` spellings meet.
 */
export function buildThumbMap(files: { entityUri: string; body: Raw }[]): Map<string, string> {
  const best = new Map<string, { uri: string; size: number }>();
  const offer = (masterTail: string, uri: string, size: number) => {
    if (!masterTail) return;
    const cur = best.get(masterTail);
    if (!cur || size < cur.size || (size === cur.size && uri < cur.uri)) best.set(masterTail, { uri, size });
  };
  for (const f of files) {
    const size = countOf(pick(f.body, "fileByteSize"));
    if (size === null) continue;
    offer(entityIdTail(f.entityUri), f.entityUri, size);
    const from = linkText(pick(f.body, "transcodedFrom"));
    if (from) offer(entityIdTail(from), f.entityUri, size);
  }
  return new Map([...best].map(([k, v]) => [k, v.uri]));
}

/** One stored copy of a picture: its file address and its size in bytes. */
export type PictureCopy = { uri: string; bytes: number };

/**
 * file id tail -> every stored copy of that picture, smallest first (a tie goes to the lower IRI as text), for pictures linked either way:
 * the master-only shape (the small copy names the master in `transcodedFrom`) and the root shape (the master and the small copy both name
 * the full copy). A file's root is found by following `transcodedFrom` at most two steps; the group is the root and every file that
 * resolves to it. The same array is stored under the id tail of every member, so the master's tail finds it, and so does the full copy's.
 * The reading rules are `buildThumbMap`'s: ids meet by their tail, and a file with no `fileByteSize` is not offered as a copy.
 * A file whose `transcodedFrom` names a file that is not in \`files\` is in no group, and nothing throws.
 */
export function buildCopyMap(files: { entityUri: string; body: Raw }[]): Map<string, PictureCopy[]> {
  type Node = { uri: string; bytes: number | null; from: string | null };
  const nodes = new Map<string, Node>();
  for (const f of files) {
    const tail = entityIdTail(f.entityUri);
    if (!tail) continue;
    const from = linkText(pick(f.body, "transcodedFrom"));
    const fromTail = from ? entityIdTail(from) : "";
    nodes.set(tail, { uri: f.entityUri, bytes: countOf(pick(f.body, "fileByteSize")), from: fromTail && fromTail !== tail ? fromTail : null });
  }
  const groups = new Map<string, { members: Map<string, PictureCopy>; tails: Set<string> }>();
  for (const [tail, node] of nodes) {
    let root = tail;
    let broken = false;
    for (let step = 0; step < 2; step++) {
      const from = nodes.get(root)!.from;
      if (from === null) break;
      if (!nodes.has(from)) {
        broken = true;
        break;
      }
      root = from;
    }
    if (broken) continue;
    let g = groups.get(root);
    if (!g) groups.set(root, (g = { members: new Map(), tails: new Set() }));
    g.tails.add(tail);
    if (node.bytes !== null) g.members.set(node.uri, { uri: node.uri, bytes: node.bytes });
  }
  const byBytes = (a: PictureCopy, b: PictureCopy) => a.bytes - b.bytes || (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);
  const out = new Map<string, PictureCopy[]>();
  for (const g of groups.values()) {
    const list = [...g.members.values()].sort(byBytes);
    if (list.length === 0) continue;
    for (const t of g.tails) out.set(t, list);
  }
  return out;
}

/**
 * The smallest copy with `bytes >= minBytes`; when none is that large, the largest copy; null for no copies.
 * A tie goes to the lower IRI as text. `pickBySize(copies, 0)` is the smallest copy (a thumb); `pickBySize(copies, Infinity)` is the largest (full screen).
 */
export function pickBySize(copies: PictureCopy[], minBytes: number): PictureCopy | null {
  let enough: PictureCopy | null = null;
  let largest: PictureCopy | null = null;
  for (const c of copies) {
    if (!largest || c.bytes > largest.bytes || (c.bytes === largest.bytes && c.uri < largest.uri)) largest = c;
    if (c.bytes >= minBytes && (!enough || c.bytes < enough.bytes || (c.bytes === enough.bytes && c.uri < enough.uri))) enough = c;
  }
  return enough ?? largest;
}

/**
 * Whether the device is on a mobile connection: true for `cellular` or a data-saver request, false for `wifi` or `ethernet`,
 * null when the browser does not say (iOS Safari has no connection object). The app decides what null means; the plan's default is to
 * send the full copy on Wi-Fi only, that is, to treat null as cellular.
 */
export function onCellular(): boolean | null {
  const c = (typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection);
  if (c?.type === "cellular") return true;
  if (c?.type === "wifi" || c?.type === "ethernet") return false;
  if (c?.saveData === true) return true;
  return null;
}
