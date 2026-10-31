// A COMPLETE, consistent copy of one record type in a vault, with bodies, and the position to ask for changes from. Read only.
// The recipe is the platform's: `since=head` first (keep it), walk the newest-first list by `after=<nextCursor>`, then ONE
// `since=<kept head>` pass that catches what was written or changed while the walk ran. Never a deep `offset` on a platform that
// answers `after`. Ported from Social's `VaultClient.completeCopy`; the host still arrives as the injected authenticated fetch.

import { PlatformError, request, routeUrl, vaultSegment, type PlatformClient } from "./platform";
import { RecordListError, type RecordRow } from "./recordPages";

/** The platform does not know a parameter the copy needs (`include=body`, `since=`), so no complete copy can be made. Status 400. */
export class PlatformLacks extends PlatformError {
  constructor(what: string, url = "", body = "") {
    super(what, 400, url, body);
    this.name = "PlatformLacks";
  }
}

/** Options of {@link completeCopy}. */
export interface CompleteCopyOptions {
  /** Keep only records holding `attribute` = `value`. The walk carries `filter=`; the `since` pass cannot, so the merge applies it. */
  filter?: { attribute: string; value: unknown };
  /** The walk stops after this many pages, or this many x 100 rows, and says so (`truncated`). Default: 500 pages. */
  maxPages?: number;
  /** A failure after some rows were read returns them as `truncated` with the `reason`, instead of throwing. */
  partialOk?: boolean;
  /** Rows asked per walk page (1..200, default 200; the platform clamps to what it serves). */
  pageLimit?: number;
  /**
   * Told after each walk page is read, with every row of the walk so far (see {@link CompletePage}). It only looks: the requests, their order and the result are the same with or without it.
   * An error it throws is ignored.
   */
  onPage?: (page: CompletePage) => void;
}

/** What {@link CompleteCopyOptions.onPage} is told: an early, UNCOMMITTED view of the walk. The final copy can differ (a row changed or written during the walk, or the since pass). */
export interface CompletePage {
  /** Every row of the walk so far, newest first, as a fresh array (a copy the caller may keep). Not merged with the since pass. */
  records: RecordRow[];
  /** How many walk pages these rows came from. */
  pages: number;
  /** True on the walk's last page (only the since pass is left). */
  walkDone: boolean;
}

/** What {@link completeCopy} read. */
export interface CompleteCopy {
  /** Newest first, each with its body (and etag) as the platform served it. */
  records: RecordRow[];
  /** The position a later changes-since read continues from. */
  cursor: string;
  /** True when the copy may be partial (page cap, or a failure with `partialOk`). */
  truncated?: boolean;
  /** Why, when a failure and not the page cap cut it short. */
  reason?: string;
}

const DEFAULT_PAGE_LIMIT = 200;
const MAX_WALK_PAGES = 500;
const MAX_SINCE_ROUNDS = 20;
const MAX_SINCE_PAGES = 200;

function rowOf(raw: unknown): RecordRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.entity !== "string") return null;
  const body = r.body && typeof r.body === "object" && !Array.isArray(r.body) ? (r.body as Record<string, unknown>) : undefined;
  return {
    entity: r.entity,
    typeUri: typeof r.typeUri === "string" ? r.typeUri : null,
    label: typeof r.label === "string" && r.label.trim() !== "" ? r.label : null,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
    ...(body ? { body } : {}),
    ...(typeof r.etag === "string" ? { etag: r.etag } : {}),
    row: r,
  };
}

function rowsOf(json: Record<string, unknown> | null): RecordRow[] {
  const list = json ? (Array.isArray(json.records) ? json.records : Object.values(json).find((v) => Array.isArray(v))) : undefined;
  const out: RecordRow[] = [];
  for (const raw of (list as unknown[] | undefined) ?? []) {
    const row = rowOf(raw);
    if (row) out.push(row);
  }
  return out;
}

function textOf(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o["@value"] !== "undefined") return String(o["@value"]);
    if (typeof o["@id"] === "string") return o["@id"];
  }
  return String(v);
}

function refsOf(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.flatMap(refsOf);
  if (typeof v === "object" && typeof (v as Record<string, unknown>)["@id"] === "string") return [String((v as Record<string, unknown>)["@id"])];
  if (typeof v === "string" && /^https?:\/\//.test(v)) return [v];
  return [];
}

/** One record address in its one form: a `/lws/r/<id>` address and the vault's `/vault/e/<id>` address of it are the same record. */
function entityAddress(address: string): string {
  const a = new URL(address.replace(/^http:/, "https:"));
  const m = /^\/lws\/r\/([^/?#]+)/.exec(a.pathname);
  return m ? `https://${a.host}/vault/e/${m[1]}` : `https://${a.host}${a.pathname}`;
}

/** Whether a record's body holds `attribute` = `value` (any of several values; a link by address, or a term by its last segment). */
function holdsFact(doc: Record<string, unknown>, attribute: string, value: unknown): boolean {
  const bare = attribute.replace(/^a:/, "");
  const have = doc[bare] ?? doc[`a:${bare}`];
  if (have === undefined || have === null) return false;
  const addr = (x: string) => {
    try {
      return entityAddress(x);
    } catch {
      return x;
    }
  };
  const one = (h: unknown): boolean => {
    if (Array.isArray(h)) return h.some(one);
    if (value && typeof value === "object") {
      const want = (value as Record<string, unknown>)["@id"];
      const term = (x: string) => x.replace(/^.*[/#:]/, "");
      return typeof want === "string" && (typeof h === "string" ? [h] : refsOf(h)).some((r) => r === want || (want.startsWith("t:") ? term(r) === term(want) : addr(r) === addr(want)));
    }
    return textOf(h) === String(value);
  };
  return one(have);
}

/** The `filter=` text of an attribute and a value (a string is a literal, anything else its JSON). */
function filterText(attribute: string, value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    let why: string | null = null;
    if (value === "") why = "the platform refuses an empty value";
    else if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        JSON.parse(trimmed);
        why = "the platform reads this text as JSON, so it never matches the stored text";
      } catch {
        why = null;
      }
    }
    if (why) throw new PlatformError(`find ${attribute}: can't tell (${why}); nothing was asked`, 0, "", "");
  }
  return `${attribute}=${typeof value === "string" ? value : JSON.stringify(value)}`;
}

const listBase = (platform: PlatformClient, vaultId: string): string => routeUrl(platform, `lws/vault/${vaultSegment(vaultId)}/records`);

/** `since=head`: no rows, the position now. */
async function sinceHead(platform: PlatformClient, vaultId: string, type: string): Promise<string> {
  const url = `${listBase(platform, vaultId)}?type=${encodeURIComponent(type)}&since=head`;
  const answer = await request(platform, "GET", url);
  if (answer.status === 400) throw new PlatformLacks(`head ${type}: this platform does not know since=`, url, answer.text);
  if (answer.status !== 200) throw new RecordListError(answer);
  const next = answer.json?.nextCursor;
  if (typeof next !== "string" || next === "") throw new PlatformLacks(`head ${type}: the platform named no position (it ignores since=)`, url, answer.text);
  return next;
}

interface WalkCap {
  maxPages: number;
  truncated: boolean;
  partialOk?: boolean;
  reason?: unknown;
  pageLimit: number;
  onPage?: (page: CompletePage) => void;
}

type BodyPage = { rows: RecordRow[]; complete: boolean; next: number | null; cursor: string | null };

/** One `include=body` page: at `offset`, or after the bookmark `after`. A 400 on `after` means the walk goes on by offset ("after-refused"). */
async function bodyPage(platform: PlatformClient, vaultId: string, type: string, offset: number, after: string | undefined, filter: string | undefined, limit: number): Promise<BodyPage | "after-refused"> {
  const base = `${listBase(platform, vaultId)}?type=${encodeURIComponent(type)}&include=body&limit=${limit}${filter !== undefined ? `&filter=${encodeURIComponent(filter)}` : ""}`;
  const url = after !== undefined ? `${base}&after=${encodeURIComponent(after)}` : offset === 0 ? base : `${base}&offset=${offset}`;
  const answer = await request(platform, "GET", url);
  if (answer.status === 400 && after !== undefined) return "after-refused";
  if (answer.status === 400 && /include/i.test(answer.text)) throw new PlatformLacks(`copy ${type}: this platform does not list bodies, so no complete copy can be made`, url, answer.text);
  if (answer.status !== 200) throw new RecordListError(answer);
  const json = answer.json ?? {};
  const rows = rowsOf(json);
  // A platform that answers include=body always says nextOffset; one that ignores include (rows with no body) is stepped by the rows it returned.
  const next = typeof json.nextOffset === "number" && Number.isFinite(json.nextOffset) ? Math.floor(json.nextOffset) : rows.length > 0 && !rows.some((r) => r.body !== undefined) ? offset + rows.length : null;
  const cursor = typeof json.nextCursor === "string" && json.nextCursor !== "" ? json.nextCursor : null;
  return { rows, complete: json.complete !== false, next, cursor };
}

/** The walk: every row of one type with its body, newest first, by bookmark; by offset on a platform that refuses `after`. */
async function walkType(platform: PlatformClient, vaultId: string, type: string, filter: string | undefined, cap: WalkCap): Promise<RecordRow[]> {
  let out: RecordRow[] = [];
  let offset = 0;
  let cursor: string | null = null;
  let noAfter = false;
  let seen = new Set<string>();
  let pages = 0;
  let told = 0; // the most rows `onPage` has been told of: after a restart it is silent until the new walk holds as many again
  const restartByOffset = () => {
    out = [];
    seen = new Set();
    pages = 0;
    offset = 0;
    cursor = null;
    noAfter = true;
  };
  try {
    for (let page = 0; page < MAX_WALK_PAGES; page++) {
      if (page >= cap.maxPages || out.length >= cap.maxPages * 100) {
        cap.truncated = true;
        return out;
      }
      const after: string | undefined = cursor !== null && !noAfter ? cursor : undefined;
      const got = await bodyPage(platform, vaultId, type, offset, after, filter, cap.pageLimit);
      if (got === "after-refused") {
        restartByOffset();
        continue;
      }
      // A platform that ignored `after` serves the first page again: a row seen before means the bookmark did nothing.
      if (after !== undefined && got.rows.some((r) => seen.has(r.entity))) {
        restartByOffset();
        continue;
      }
      for (const r of got.rows) seen.add(r.entity);
      out.push(...got.rows);
      pages += 1;
      if (cap.onPage && out.length >= told) {
        told = out.length;
        try {
          cap.onPage({ records: [...out], pages, walkDone: got.complete });
        } catch {
          /* a listener must not break a copy */
        }
      }
      if (got.complete) return out;
      if (after !== undefined || (got.cursor !== null && !noAfter)) {
        if (got.cursor === null || got.cursor === after) throw new PlatformError(`find ${type}: the listing did not say where the next page starts`, 0, "", "");
        cursor = got.cursor;
        continue;
      }
      if (got.next === null || got.next <= offset) throw new PlatformError(`find ${type}: the listing did not say where the next page starts`, 0, "", "");
      offset = got.next;
    }
  } catch (e) {
    // A failure after some pages keeps the rows already read when the caller asked for that (the copy is then partial, with the reason).
    if (cap.partialOk && out.length > 0) {
      cap.truncated = true;
      cap.reason = e;
      return out;
    }
    throw e;
  }
  throw new PlatformError(`find ${type}: more than ${MAX_WALK_PAGES} pages`, 0, "", "");
}

/** Records of one type changed since `cursor` (null: `since=start`), with bodies, walked by the platform's opaque `nextCursor`; no `offset`. A 400 `since_cursor_invalid` restarts once from `start`. `ended` is ignored. */
async function changesSince(platform: PlatformClient, vaultId: string, type: string, cursor: string | null): Promise<{ rows: RecordRow[]; cursor: string; restarted: boolean; complete: boolean }> {
  const rows: RecordRow[] = [];
  let since = cursor;
  let restarted = false;
  let outCursor = cursor ?? "start";
  let pages = 0;
  let complete = false;
  let finished = false;
  while (pages < MAX_SINCE_PAGES) {
    const sent = since ?? "start";
    const url = `${listBase(platform, vaultId)}?type=${encodeURIComponent(type)}&since=${encodeURIComponent(sent)}&include=body&limit=${DEFAULT_PAGE_LIMIT}`;
    const answer = await request(platform, "GET", url);
    if (answer.status !== 200) {
      if (answer.status === 400 && !restarted && answer.json?.error === "since_cursor_invalid") {
        restarted = true;
        since = null;
        rows.length = 0;
        pages = 0;
        outCursor = "start";
        continue;
      }
      throw new RecordListError(answer);
    }
    pages += 1;
    const json = answer.json ?? {};
    rows.push(...rowsOf(json));
    const next = typeof json.nextCursor === "string" && json.nextCursor !== "" ? json.nextCursor : "";
    if (next) outCursor = next;
    // Missing, or the cursor just sent: stop. Only an explicit `complete: true` is finished.
    if (!next || next === sent || json.complete !== false) {
      complete = json.complete === true;
      finished = true;
      break;
    }
    since = next;
  }
  if (!finished) complete = false;
  return { rows, cursor: outCursor, restarted, complete };
}

/** The `since` pass over `copy`: every row changed after `cursor` replaces its row (or leaves, when it no longer holds the filter); changed rows go to the top. */
async function sinceMerge(platform: PlatformClient, vaultId: string, type: string, cursor: string, copy: Map<string, RecordRow>, filter: CompleteCopyOptions["filter"]): Promise<string> {
  let from = cursor;
  for (let round = 0; round < MAX_SINCE_ROUNDS; round++) {
    const got = await changesSince(platform, vaultId, type, from);
    if (got.restarted) copy.clear();
    const fresh = [...got.rows].sort((a, b) => Date.parse(a.updatedAt ?? "") - Date.parse(b.updatedAt ?? "") || 0);
    const top = new Map<string, RecordRow>();
    for (const r of fresh) {
      const holds = !filter || (r.body !== undefined && holdsFact(r.body, filter.attribute, filter.value));
      copy.delete(r.entity);
      top.delete(r.entity);
      if (holds) top.set(r.entity, r);
    }
    const rest = [...copy.entries()];
    copy.clear();
    for (const [k, r] of [...top.entries()].reverse()) copy.set(k, r); // newest first
    for (const [k, r] of rest) copy.set(k, r);
    from = got.cursor;
    if (got.complete) return got.cursor;
  }
  throw new PlatformError(`changes since ${type}: not complete after ${MAX_SINCE_ROUNDS} rounds`, 0, "", "");
}

/**
 * A COMPLETE, consistent copy of one type in one vault (optionally only the records holding `filter.attribute` = `filter.value`),
 * with bodies, and the position to ask for changes from. `since=head` first, kept; the newest-first walk by `after`; then
 * `since=<kept head>` ONCE. A row written during the walk moves to the top and is never repeated, but one written meanwhile and not
 * yet served is skipped by the walk: the `since` pass returns it, and its rows replace the walk's, by `entity`. A changed row that no
 * longer holds the filter leaves the copy (the `since` pass is of the whole type; the filter is applied here). A 400
 * `since_cursor_invalid` on the kept head restarts the pass from `start`, which returns the whole type and replaces the walk.
 * Ended records are not tracked. `opts.onPage` is told each walk page as it is read (an early view that is not the copy); it changes nothing in what is asked or returned.
 *
 * @param platform the platform client (the host app's authenticated fetch, at the vault's own origin)
 * @param vaultId the vault, as `GET /lws/vaults` names it
 * @param typeName the type (`Thing`, or `t:Thing`)
 * @param opts see {@link CompleteCopyOptions}
 * @returns the records newest first, the cursor, and `truncated` / `reason` when the copy may be partial
 * @throws PlatformLacks when the platform lacks `include=body` or `since=`; RecordListError when a page answers other than 200
 */
export async function completeCopy(platform: PlatformClient, vaultId: string, typeName: string, opts: CompleteCopyOptions = {}): Promise<CompleteCopy> {
  const type = typeName.replace(/^t:/, "");
  const f = opts.filter ? filterText(opts.filter.attribute, opts.filter.value) : undefined;
  const head = await sinceHead(platform, vaultId, type);
  const cap: WalkCap = {
    maxPages: opts.maxPages ?? MAX_WALK_PAGES,
    truncated: false,
    partialOk: opts.partialOk,
    reason: undefined,
    pageLimit: Math.max(1, Math.min(200, Math.floor(opts.pageLimit ?? DEFAULT_PAGE_LIMIT))),
    onPage: opts.onPage,
  };
  const walked = await walkType(platform, vaultId, type, f, cap);
  const copy = new Map<string, RecordRow>();
  for (const r of walked) copy.set(r.entity, r);
  let cursor = head;
  try {
    cursor = await sinceMerge(platform, vaultId, type, head, copy, opts.filter);
  } catch (e) {
    // The rows are read but the changes since the kept head could not be: the copy may miss the newest writes, so it is partial.
    if (!cap.partialOk) throw e;
    if (cap.reason === undefined) cap.reason = e;
    cap.truncated = true;
  }
  const why = cap.reason === undefined ? undefined : cap.reason instanceof Error ? cap.reason.message : String(cap.reason);
  return { records: [...copy.values()], cursor, ...(cap.truncated ? { truncated: true } : {}), ...(why !== undefined ? { reason: why } : {}) };
}
