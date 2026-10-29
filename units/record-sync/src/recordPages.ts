// A vault's typed record list, and only what changed in it since a stored position. The platform serves both on
// `GET /lws/vault/<vaultId>/records`. Read only: nothing here writes.

import { PlatformError, request, routeUrl, vaultSegment, type PlatformAnswer, type PlatformClient } from "./platform";

/** The most rows one full-row page carries (GilbPlatform `FULL_ROWS_PAGE_CAP`; a larger `limit` is clamped, never refused). */
export const RECORD_PAGE_LIMIT = 100;

/** The most pages one walk or one sync reads before it stops and says it is not complete. */
export const RECORD_WALK_MAX_PAGES = 500;

/** One row of the typed list, as the platform served it. */
export interface RecordRow {
  /** The record's address (`entity`; `@id` on a row that carries no `entity`). */
  entity: string;
  /** The record's type as the list served it (`t:Person`, or a type IRI). */
  typeUri: string | null;
  label: string | null;
  updatedAt: string | null;
  /** The record's document, as `GET /lws/r/<id>` serves it to this caller; absent on a page read without bodies. */
  body?: Record<string, unknown>;
  /** The ETag `GET /lws/r/<id>` would send (If-Match on a write); absent on a page read without bodies. */
  etag?: string;
  /** The whole row, for fields this module does not name (`vault`, `vaultAmbiguous`, …). */
  row: Readonly<Record<string, unknown>>;
}

/** What a walk read. */
export interface RecordWalk {
  rows: RecordRow[];
  /** True only when the list said `complete: true` on its last page. */
  complete: boolean;
  /** Requests sent. */
  pages: number;
}

/** A list that could not be read. `status` is the platform's answer (0: not reached). Its `name` stays `PlatformError`: callers
 *  that tell a refusal by that name (pick-or-create's `findCandidates`) see the same error as before this module. */
export class RecordListError extends PlatformError {
  /**
   * The platform's error name, when it sent one (`since_cursor_invalid`, `type_token_unresolved`, …). The platform sends it as the
   * body's `error` (GilbPlatform `src/server/app.ts`: `{ error: err.name, message, …details }`; a read of the live
   * answer `{"error":"since_cursor_invalid","message":…,"accepted":[…]}`). ⛔ Not a `code` field: the platform sends none.
   */
  readonly code: string | null;
  constructor(answer: PlatformAnswer) {
    const code = typeof answer.json?.error === "string" ? answer.json.error : null;
    super(`GET ${answer.url} answered ${answer.status}${code ? ` (${code})` : ""}`, answer.status, answer.url, answer.text);
    this.code = code;
  }
}

function listUrl(platform: PlatformClient, vaultId: string, typeNames: readonly string[], params: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const t of typeNames) q.append("type", t);
  for (const [k, v] of Object.entries(params)) q.set(k, v);
  return `${routeUrl(platform, `lws/vault/${vaultSegment(vaultId)}/records`)}?${q.toString()}`;
}

function rowOf(raw: unknown): RecordRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const entity = typeof r.entity === "string" ? r.entity : typeof r["@id"] === "string" ? (r["@id"] as string) : null;
  if (!entity) return null;
  const body = r.body && typeof r.body === "object" && !Array.isArray(r.body) ? (r.body as Record<string, unknown>) : undefined;
  return {
    entity,
    typeUri: typeof r.typeUri === "string" ? r.typeUri : null,
    label: typeof r.label === "string" && r.label.trim() !== "" ? r.label : null,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
    ...(body ? { body } : {}),
    ...(typeof r.etag === "string" ? { etag: r.etag } : {}),
    row: r,
  };
}

async function readPage(platform: PlatformClient, url: string): Promise<{ rows: RecordRow[]; json: Record<string, unknown> }> {
  const answer = await request(platform, "GET", url);
  if (answer.status !== 200) throw new RecordListError(answer);
  const records = answer.json?.records;
  if (!Array.isArray(records)) throw new PlatformError(`GET ${url} served no record list`, 200, url, answer.text);
  const rows: RecordRow[] = [];
  for (const raw of records) {
    const row = rowOf(raw);
    if (row) rows.push(row);
  }
  return { rows, json: answer.json! };
}

/**
 * Walk a vault's typed list in full rows (`include=body&limit=100`), newest first (the list's own order), stepping by the page's
 * `nextOffset` until the list says `complete`. A platform that sends no `nextOffset` (a platform before the full-row page) is walked as before, by the rows
 * it served, and a page that serves nothing past a "more" ends the walk as not complete.
 *
 * @param platform the platform client (the host app's authenticated fetch, at the vault's own origin)
 * @param vaultId the vault, as `GET /lws/vaults` names it
 * @param typeNames bare type names (`Person`, not `t:Person`); ⛔ an empty list would read the whole vault, so it is refused
 * @param opts `until`: stop once it answers true for the rows read so far (the walk is then not complete); `maxRows`: stop past
 *   this many rows; `maxPages`: stop past this many requests ({@link RECORD_WALK_MAX_PAGES})
 * @returns the rows in list order, whether the list was read to its end, and the requests sent
 * @throws RecordListError when a page answers other than 200; PlatformError when the platform cannot be reached
 */
export async function walkRecordPages(
  platform: PlatformClient,
  vaultId: string,
  typeNames: readonly string[],
  opts: { until?: (rows: readonly RecordRow[]) => boolean; maxRows?: number; maxPages?: number } = {},
): Promise<RecordWalk> {
  if (typeNames.length === 0) throw new PlatformError("a typed list needs at least one type", 0, vaultId, "");
  const maxPages = opts.maxPages ?? RECORD_WALK_MAX_PAGES;
  const rows: RecordRow[] = [];
  let offset = 0;
  let pages = 0;
  while (pages < maxPages) {
    const params: Record<string, string> = { include: "body", limit: String(RECORD_PAGE_LIMIT) };
    if (offset > 0) params.offset = String(offset);
    const page = await readPage(platform, listUrl(platform, vaultId, typeNames, params));
    pages += 1;
    rows.push(...page.rows);
    // Only an explicit `true` ends the walk as complete.
    if (page.json.complete === true) return { rows, complete: true, pages };
    if (opts.until?.(rows)) break;
    if (opts.maxRows !== undefined && rows.length >= opts.maxRows) break;
    const next = page.json.nextOffset;
    if (typeof next === "number") {
      // The window position after the rows the page examined. It always moves forward; one that does not is not walked again.
      if (next <= offset) break;
      offset = next;
    } else {
      // A platform without full rows: the rows it served, as before. Nothing served past a "more" cannot advance.
      if (page.rows.length === 0) break;
      offset += page.rows.length;
    }
  }
  return { rows, complete: false, pages };
}

/** Where a sync of one typed list stands: the two stored positions. Opaque; keep it per (vault, type set) and caller. */
export interface RecordSyncState {
  /** The live list's `nextCursor`. */
  live: string;
  /** The ended list's `nextCursor`. */
  ended: string;
}

/** What one sync brought. */
export interface RecordSync {
  /**
   * `full`: `rows` is the whole list (a first load, a restart, or a platform without the feed): replace what you hold.
   * `changes`: `rows` are the records created, changed or revived since the stored position, oldest first, and `ended` the
   * addresses of the records ended since: apply the rows by `entity`, then remove the ended ones.
   */
  kind: "full" | "changes";
  rows: RecordRow[];
  ended: string[];
  /** The positions to store for the next sync; null when the platform has no feed (the next sync reads the whole list again). */
  state: RecordSyncState | null;
  /** True when every page was read (a cap or the page limit not reached). A `full` answer that is not complete is a part. */
  complete: boolean;
  /** Requests sent. */
  pages: number;
}

async function readFeed(
  platform: PlatformClient,
  vaultId: string,
  typeNames: readonly string[],
  since: string,
  ended: boolean,
  maxPages: number,
): Promise<{ rows: RecordRow[]; cursor: string | null; complete: boolean; pages: number }> {
  const rows: RecordRow[] = [];
  let cursor = since;
  let pages = 0;
  while (pages < maxPages) {
    const params: Record<string, string> = ended ? { since: cursor, lifecycle: "ended" } : { since: cursor, include: "body", limit: String(RECORD_PAGE_LIMIT) };
    const page = await readPage(platform, listUrl(platform, vaultId, typeNames, params));
    pages += 1;
    const next = page.json.nextCursor;
    // No `nextCursor`: this platform has no feed and answered the plain list. ⛔ Never loop on its `complete`.
    if (typeof next !== "string" || next === "") return { rows, cursor: null, complete: false, pages };
    rows.push(...page.rows);
    cursor = next;
    if (page.json.complete === true) return { rows, cursor, complete: true, pages };
  }
  return { rows, cursor, complete: false, pages };
}

/**
 * Take a typed list's two positions NOW, live and ended (`since=head`, no rows). A screen that shows the list from its own
 * pages (newest first) takes them before it reads its first page, and later asks only what changed since ({@link syncRecordChanges}),
 * without ever reading the list from `since=start`.
 *
 * @param platform the platform client (the host app's authenticated fetch, at the vault's own origin)
 * @param vaultId the vault, as `GET /lws/vaults` names it
 * @param typeNames bare type names; keep the SAME set for the later syncs
 * @returns the positions, or null when the platform has no feed (no `nextCursor`): the caller then reads the list as before
 * @throws RecordListError when a list answers other than 200
 */
export async function headRecordState(platform: PlatformClient, vaultId: string, typeNames: readonly string[]): Promise<RecordSyncState | null> {
  if (typeNames.length === 0) throw new PlatformError("a typed list needs at least one type", 0, vaultId, "");
  const [live, ended] = await Promise.all([
    readFeed(platform, vaultId, typeNames, "head", false, 1),
    readFeed(platform, vaultId, typeNames, "head", true, 1),
  ]);
  return live.cursor !== null && ended.cursor !== null ? { live: live.cursor, ended: ended.cursor } : null;
}

/**
 * Only what changed in a typed list since the stored positions: the live list's changes (full rows), then the ended
 * list's deletes. Unlike {@link syncRecordPages} it never starts again from `since=start`: a position the platform no longer takes
 * (`400 since_cursor_invalid`) or a platform without the feed answers null, and the caller reads its list again as it did before.
 *
 * @param platform the platform client
 * @param vaultId the vault
 * @param typeNames the same bare type names the positions were taken for
 * @param state the positions ({@link headRecordState}, or the last answer's `state`)
 * @param opts `maxPages`: the most requests of each list's read (default 10); past it the answer is not complete
 * @returns the changes (`kind: "changes"`) with the positions to keep, or null (read the list again)
 * @throws RecordListError when a list answers other than 200 or 400 `since_cursor_invalid`
 */
export async function syncRecordChanges(
  platform: PlatformClient,
  vaultId: string,
  typeNames: readonly string[],
  state: RecordSyncState,
  opts: { maxPages?: number } = {},
): Promise<RecordSync | null> {
  if (typeNames.length === 0) throw new PlatformError("a typed list needs at least one type", 0, vaultId, "");
  const maxPages = opts.maxPages ?? 10;
  try {
    const live = await readFeed(platform, vaultId, typeNames, state.live, false, maxPages);
    if (live.cursor === null) return null;
    const ended = await readFeed(platform, vaultId, typeNames, state.ended, true, maxPages);
    if (ended.cursor === null) return null;
    return {
      kind: "changes",
      rows: live.rows,
      ended: ended.rows.map((r) => r.entity),
      state: { live: live.cursor, ended: ended.cursor },
      complete: live.complete && ended.complete,
      pages: live.pages + ended.pages,
    };
  } catch (e) {
    if (e instanceof RecordListError && e.status === 400 && e.code === "since_cursor_invalid") return null;
    throw e;
  }
}
