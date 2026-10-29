/**
 * The stakeholder list reader: gathers the inputs of the one list of all stakeholders and merges them (`mergeStakeholderRows`).
 *
 * Every read goes through a door the host injects: the host owns the token, the DPoP proof, which node holds a vault, and its
 * session caches. This module holds no credential and names no route.
 *
 * ONE DRAW IN THREE STEPS: the first rows never wait for links, resolves or spelling checks.
 *   1. rows      the connections read and one records page per held vault. As soon as they are in, the subscriber
 *                (`options.onRows`) gets every placed person and every record. A record whose link is not known yet is marked
 *                `linking` (links already in the session caches are joined at once, so a refresh is joined from its first rows).
 *   2. links     the find, the link reads and the resolves for the records still `linking`. The subscriber gets the joined list.
 *   3. spellings only when `spellingCheckNeeded` says a member may be an older spelling: the canonicaliser. The subscriber gets
 *                the last list.
 * `read()`, `more()` and `refresh()` resolve with the last (settled) list, `settling: false`. A list drawn while later steps run
 * says `settling: true`. A draw started later (a refresh) silences the subscriber for the earlier one.
 *
 * WHAT ONE DRAW READS, bounded by the PAGE and the window, never by the whole list:
 *   connections()            1 (the app's session read: usually its cache answers, 0 requests)
 *   listRecords(vault, 0)    1 per held vault (one page of record stubs)
 *   linkedRecordIds(vault)   1 per held vault, once per draw, not per page: which records carry a link
 *   linkedRecordsOf(members) once per draw (`read`/`refresh`, never `more`): the records in the held vaults linked to the placed
 *                            people, so a linked record joins its person from the first draw whatever page it is on.
 *                            At most {@link LINKED_LOOKUP_CAP} members are asked; the app's door says what that costs. Not asked
 *                            when every held vault's first page was its last, nor for a person already joined on the loaded
 *                            pages; asked after the page's own links, with only the requests the screen has left.
 *   readLink(record)         only the records ON THE LOADED PAGES that the find names (or, with no find, every record on the
 *                            page), kept per record and last write
 *   resolve(record)          one per linked record on the loaded pages, kept per record and link target for the session
 *   canonical(member)        only when `spellingCheckNeeded` says so, and never for an opaque member (`membersToAsk`); bounded
 *                            by the app's canonicaliser (`createPrincipalCanonicaliser`: at most 50 per session)
 *   names                    ⛔ none: a name is read only when the list asks for a WINDOW of rows (`names(keys)`), and only
 *                            for the placed-only rows in it; with the option `linkedNames` (for a host that draws photos)
 *                            also the linked (`both`) rows in it, whose answer
 *                            carries the photo and caption; at most one per row, kept per principal. The self row is answered
 *                            from `selfName` (the own card the app already read), 0 requests.
 * ⛔ No per-row card read for the whole list.
 *
 * AT ONCE, IN TOTAL for the reader (one limiter per kind, shared by every vault, every page, every retry and every call):
 * {@link LINK_READ_CONCURRENCY} link reads, {@link RESOLVE_CONCURRENCY} resolves (the platform admits 4 resolver calls in
 * flight + 4 queued per person, so two tabs stay inside it), {@link NAME_READ_CONCURRENCY} name reads.
 * A resolver 429 waits the server's `retry-after` ({@link BUSY_DEFAULT_WAIT_MS} when it names none) plus up to half again as
 * jitter, OUTSIDE its slot, and is asked again at most {@link BUSY_RETRIES} times; then that record is `unchecked`.
 *
 * FAILURES: a partial list with a clear state, ⛔ never empty-looking silence. Each input fails on its own:
 *   connections fail          the records are still listed; `connections: { state: "failed", reason }`
 *   one vault's page fails    the other vaults are listed; that vault is `state: "failed"` and `more()` asks it again
 *   the find fails            the links on the page are read one by one instead (more requests, the same list)
 *   a link read or resolver   that record stays a record row and its id is in `links.unchecked`; `more()` asks it again
 *   the canonicaliser fails   (only when the spelling check runs) the members it could not answer are compared by their
 *                             own strings and `spellings` says "spellings unresolved": one
 *                             person may show as two rows, never silently
 *   a name read               that row is `unavailable` and asked again next time; but a sign-in failure
 *                             (`isCredentialSurfaceError`) makes `names` reject with the door's own error, so the
 *                             list can say "You are signed out — …"
 * `partial` is true whenever one of these left something out. The self row is always there, first.
 */
import {
  CANONICAL_CONCURRENCY,
  isOldWebIdMember,
  membersToAsk,
  opaqueSelf,
  type ConnectedPerson,
  type ConnectionsReading,
  type PrincipalCanonicaliser,
  type ResolveOutcome,
} from "@kaigilb/gilbplatformcode-person-connections";
import type { LinkReading } from "@kaigilb/gilbplatformcode-online-card-link";
import { isCredentialSurfaceError } from "@kaigilb/gilbplatformcode-credential-surface";
import { reachShares } from "./reachCap";
import { entityKey, mergeStakeholderRows, type StakeholderRecordInput, type StakeholderRow } from "./mergeRows";

/** How many records' links are read at the same time, in total for the reader. */
export const LINK_READ_CONCURRENCY = 3;

/** How many resolver calls are in flight at the same time, in total for the reader: under the platform's 4 per person. */
export const RESOLVE_CONCURRENCY = 3;

/** How many names are read at the same time, in total for the reader. */
export const NAME_READ_CONCURRENCY = 3;

/**
 * How many placed people one draw asks the app about (`linkedRecordsOf`), in the connections' order (more placements first).
 * The app's door answers with one find per member per store (the platform's `find-by-attribute` needs a value), so this bounds
 * the first screen's requests. A member past the bound joins its record when the record's page comes, as before the up-front read.
 */
export const LINKED_LOOKUP_CAP = 8;

/**
 * The requests one screen of the list may cost (Value List.RequestsPerScreen, Tolerable <= 40). The up-front linked read is
 * given only what the screen has left of it: this minus what the app counts the
 * screen has sent (`requestsSoFar`) minus the name reads still waiting for a slot.
 */
export const FIRST_SCREEN_REQUESTS = 40;

/** How many times a resolver 429 is asked again before the record is flagged `unchecked`. */
export const BUSY_RETRIES = 2;

/** The wait after a resolver 429 that names no `retry-after`. */
export const BUSY_DEFAULT_WAIT_MS = 2000;

/** One record stub as the app's records door lists it. */
export interface ListedRecord {
  /** The record's absolute entity address. */
  recordId: string;
  /** The title the door shows (`a:label` / title / name), or null. Shown, ⛔ never compared. */
  title: string | null;
  /**
   * The record's type as the door lists it: one of the stakeholder kinds the door was asked for (a type the
   * master's `t/Stakeholder` `a:playableBy` names, or one below it). Passed to the row as `recordType`; ⛔ never used to join.
   * Absent: not known (null on the row).
   */
  type?: string | null;
  /**
   * The record's link, when the door already carries the record's facts (e.g. `GET /lws/records?include=body`), as `readLink`
   * reads them. Absent: not known here, so the reader finds it. Present on every record of a page: no find and no record read.
   */
  link?: LinkReading;
  /** The door's last-write mark. A different mark reads the link again; absent, the link read is kept for the session. */
  updatedAt?: string | number | null;
}

/** One page of the door's answer. */
export interface RecordsPage {
  records: ListedRecord[];
  /** The offset of the next page, or null when this page is the last. */
  next: number | null;
}

/**
 * What the same name read may also say about the person, for the list row.
 * The door fills these only from the answer it already read, ⛔ never with
 * a request of its own. Absent: not known. Null: the card shows this viewer none.
 */
export interface NameExtras {
  /** The person's photo address as the card gives it to this viewer (the bytes are the app's authenticated read). */
  photoUrl?: string | null;
  /** One short line under the name. */
  caption?: string | null;
}

/** A name read's answer for one placed person (the app's `public-card` read at the viewer's rung). */
export type NameAnswer =
  /** The card answered; `name` is null when it shows no name to this viewer. */
  | ({ kind: "name"; name: string | null } & NameExtras)
  /** No person card (a group vault, nobody): an answer. The plan's list drops such a row. */
  | { kind: "none" }
  /**
   * Could not be asked (unreachable, 5xx, 429). Not an answer: asked again later. ⛔ Not for a sign-in failure: the door throws
   * its credential error and `names` passes it through.
   */
  | { kind: "unavailable" };

/** A row's name as the list may draw it. */
export type NameState = ({ state: "name"; name: string | null } & NameExtras) | { state: "none" } | { state: "unavailable" };

/**
 * The list's state for one name answer. The photo address and caption are kept with the name only when the door gave them,
 * so a host that gives neither sees exactly the shape without them.
 */
function nameStateOf(a: NameAnswer): NameState {
  if (a.kind === "none") return { state: "none" };
  if (a.kind !== "name") return { state: "unavailable" };
  const s: NameState = { state: "name", name: a.name };
  if (a.photoUrl !== undefined) s.photoUrl = a.photoUrl;
  if (a.caption !== undefined) s.caption = a.caption;
  return s;
}

/** The doors the reader reads through. Every one is the app's. */
export interface StakeholderListDeps {
  /** The holder's principal, used for the self row when the connections cannot be read. */
  holder: string;
  /** The vaults the holder holds, the holder's own first. Each is listed. */
  vaults: readonly string[];
  /** The vault the connections are read for. An answer naming another vault is read as a failure. */
  holderVault?: string;
  /** The holder's own card ids (`findOwnCard`: its card first, then `otherOwnerCards`), in either address form. */
  ownCardIds: readonly string[];
  /** The app's session read of the holder's connections (`readConnections`, kept by the app). */
  connections(): Promise<ConnectionsReading>;
  /**
   * One page of the vault's stakeholder records, from `offset`, of at most `limit` records (`?limit=`). `limit` is the vault's
   * share of this reach ({@link reachShares}): up to 20 records over the vaults still open. A door should page by it; a
   * door that ignores it still works, at its own page size. The reader always passes it; it is optional only so that a wrapper
   * written for the two-argument door still type-checks.
   */
  listRecords(vaultId: string, offset: number, limit?: number): Promise<RecordsPage>;
  /**
   * Which of the vault's records carry a link (`a:sameAs`), in one request. Optional: without it (or when it fails), every record
   * on a loaded page is read for its link.
   */
  linkedRecordIds?(vaultId: string): Promise<readonly string[]>;
  /**
   * The records in the held vaults linked (`a:sameAs`) to any of these placed people, each with the vault it is listed in and,
   * as `listRecords` gives them, its title, type and link. Asked once per draw, before
   * the links are settled, so a linked record joins its person from the first draw even when it sits on a later page. A record
   * in a vault that is not held is not listed. Optional: without it, or when it fails, a record joins when its page comes.
   */
  linkedRecordsOf?(members: readonly string[], budget?: number): Promise<readonly { vaultId: string; record: ListedRecord }[]>;
  /**
   * How many requests this screen has sent so far, counted by the app from when the screen opened: its own reads (the kinds, the
   * own card) and every door's. With it, `linkedRecordsOf` gets a `budget`: the requests the screen has left of
   * {@link FIRST_SCREEN_REQUESTS}, at least 0 (a door may still answer from what it kept). A refresh counts from its own start.
   * Optional: without it the door gets no budget and is bounded by {@link LINKED_LOOKUP_CAP} only.
   */
  requestsSoFar?(): number;
  /** One record's link, from the whole record (`readLink` over its served facts). */
  readLink(recordId: string): Promise<LinkReading>;
  /** The resolver for one record (`resolveOnlineCard`, `online-card-anchor`). */
  resolve(recordId: string): Promise<ResolveOutcome>;
  /**
   * The session's canonicaliser (`createPrincipalCanonicaliser`). Optional: without it, principals are compared as stored,
   * except that an opaque member still answers itself when the spelling check runs; `spellings` is then "unresolved" for
   * the members that would have been asked.
   */
  canonical?: PrincipalCanonicaliser;
  /**
   * One person's name (`public-card` at the viewer's rung), for a placed-only row or a linked (`both`) row in the window. Throws the
   * app's credential error when signed out.
   */
  readName(principal: string): Promise<NameAnswer>;
  /**
   * The self row's answer (name, photo address, caption) from the holder's own card as the app ALREADY holds it (`findOwnCard` and
   * its card read, or the session's profile). Synchronous on purpose: it is never a request. Optional: without it (or when it
   * answers null) the self row is not in `names`' answer and shows its card's title.
   */
  selfName?(): NameAnswer | null;
}

/** One row of the list: a merged row, and whether its record's link is still being found. */
export interface StakeholderListRow extends StakeholderRow {
  /** True for a record row whose link is not known yet: it may still join a person. */
  linking: boolean;
}

/** What one draw gives the list. */
export interface StakeholderList {
  /** The merged rows (`mergeStakeholderRows`): self first, then both, record, placed. */
  rows: StakeholderListRow[];
  connections: { state: "read" } | { state: "failed"; reason: string };
  /** Each held vault, in the order given. `complete` is true when every page of it is loaded. */
  vaults: { vaultId: string; state: "read" | "failed"; complete: boolean; reason?: string }[];
  /**
   * `unchecked`: record ids on the loaded pages whose link could not be read or resolved now (listed as record rows).
   * `linking`: record ids whose link is still being found in this draw (empty once `settling` is false).
   */
  links: { unchecked: string[]; linking: string[] };
  /** True when every page of every vault is loaded. */
  complete: boolean;
  /**
   * Whether the placed people's older spellings were checked. The check runs only when
   * `spellingCheckNeeded` says a member may be an older spelling: someone is placed, and a placed member has the old `/i`
   * WebID form or a resolved link names someone other than the holder whom no member equals exactly.
   * "not-needed": the check did not run, so nothing was asked.
   * "resolved": the check ran and every member it had to ask was answered (an opaque member answers itself, with no request).
   * "unresolved": the check ran and some members could not be checked (no canonicaliser, a failed request, or past the
   * canonicaliser's bound), so one person may show as two rows; the reason says so.
   * "checking": shown while later steps of this draw still run (`settling` is true).
   */
  spellings: { state: "resolved" } | { state: "not-needed" } | { state: "checking" } | { state: "unresolved"; reason: string };
  /** True while later steps of this draw still run (links, spelling checks); a newer list will follow. */
  settling: boolean;
  /** True when an input failed and something may be missing or unjoined (including `spellings: unresolved`). */
  partial: boolean;
}

/** Options of one reader. */
export interface StakeholderListOptions {
  /** Gets each list of a draw as it is ready: the first rows, the joined rows, the settled rows. */
  onRows?(list: StakeholderList): void;
  /**
   * Also read the name answer of a linked (`both`) row among the keys asked: for an app
   * that draws its photo and caption. Default false: the reader reads exactly the placed-only rows, as
   * before that option, so a host that draws no photos pays no request for them, not even for a placed key that a link turned
   * into a linked row before its read.
   */
  linkedNames?: boolean;
  /** Waits `ms` (default: a timer). Injected for tests. */
  wait?(ms: number): Promise<void>;
  /** A number in [0, 1) for the jitter (default `Math.random`). Injected for tests. */
  random?(): number;
}

export interface StakeholderListReader {
  /** The first draw: the first page of every vault. Resolves with the settled list; the first rows go to `onRows` at once. */
  read(): Promise<StakeholderList>;
  /** The next page of every vault that has one (and a failed vault again, from where it stopped). */
  more(): Promise<StakeholderList>;
  /** Draw again from the first page: the connections, the pages and the finds are asked again; links and resolver answers are kept. */
  refresh(): Promise<StakeholderList>;
  /**
   * The names of the placed-only rows among `keys` (the rows in the visible window). Other keys are not read.
   * A `readName` that throws a sign-in failure ({@link isCredentialSurfaceError}) makes this reject with that same
   * error, so the list can say it is signed out; the names already answered are kept, the failed one is asked again next time.
   * Every other failure is `{ state: "unavailable" }` for that row only.
   */
  names(keys: readonly string[]): Promise<Map<string, NameState>>;
}

interface VaultState {
  vaultId: string;
  records: Map<string, ListedRecord>;
  next: number | null;
  /** Where to read next: the offset of the page that failed, or of the next page. */
  pending: number | null;
  failed: string | null;
  /** The find's answer for this draw (entity keys), or null when there is none or it failed. */
  linked: Set<string> | null;
  findAsked: boolean;
}

const reasonOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Runs a task when one of `limit` slots is free. One limiter is shared by every call that uses it. */
type Limiter = (<T>(task: () => Promise<T>) => Promise<T>) & {
  /** How many tasks wait for a slot now (not sent yet, so no count of sent requests has them). */
  queued(): number;
};

/**
 * A limiter of `limit` slots. A finished task hands its slot straight to the next waiting one, so a new caller can never
 * slip in between and push the count past `limit`.
 */
function createLimiter(limit: number): Limiter {
  let active = 0;
  const waiting: (() => void)[] = [];
  const run = async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < limit) active++;
    else await new Promise<void>((go) => waiting.push(go));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
  return Object.assign(run, { queued: () => waiting.length });
}

/**
 * A reader for one holder's session. Its caches (links, resolver answers, names) and its limiters live as long as it does.
 *
 * @param deps the app's doors, the holder, the held vaults and the own card ids
 * @param options `onRows` (the first rows and each update), and the clock and jitter for tests
 * @returns `read`, `more`, `refresh` and `names`
 */
export function createStakeholderListReader(deps: StakeholderListDeps, options: StakeholderListOptions = {}): StakeholderListReader {
  const wait = options.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = options.random ?? Math.random;

  // --- Session caches ---
  // A link read is kept per record AND its last-write mark: a record the door says changed is read again.
  const linkCache = new Map<string, LinkReading>();
  // A resolver ANSWER is kept per record AND link target; "could not ask" is not an answer and is not kept.
  const resolveCache = new Map<string, string | null>();
  // A name ANSWER is kept per principal; in-flight reads are shared so one name is never read twice at once.
  const nameCache = new Map<string, NameState>();
  const nameInFlight = new Map<string, Promise<NameState>>();
  // Canonical answers kept for this session (member -> today's principal): the canonicaliser's, and each opaque member's
  // own (`opaqueSelf`, no request).
  const canonical = new Map<string, string>();
  // ONE limiter per kind of read for the whole reader, so the bound holds across held vaults, pages,
  // retries and overlapping calls.
  const linkSlots = createLimiter(LINK_READ_CONCURRENCY);
  const resolveSlots = createLimiter(RESOLVE_CONCURRENCY);
  const nameSlots = createLimiter(NAME_READ_CONCURRENCY);
  const canonicalSlots = createLimiter(CANONICAL_CONCURRENCY);

  // --- The draws ---
  // Each `read()`/`refresh()` starts a DRAW: its own vaults, links and flags. `more()` continues the current draw. A draw that a
  // newer one replaces stops sending (its writes go to its own maps, never the newer draw's), and the promise of every
  // overtaken call resolves with the NEWEST complete list.
  interface Draw {
    vaults: VaultState[];
    /** The link principal of each record on the loaded pages whose link is KNOWN (null: none). */
    links: Map<string, string | null>;
    unchecked: Set<string>;
    /** One link job per record at a time, so `more()` beside a joining draw never asks twice. */
    inflight: Map<string, Promise<void>>;
    spellings: StakeholderList["spellings"];
    /** This draw's connections answer. */
    reading: ConnectionsReading | null;
    connectionsFailed: string | null;
    /** The first pages of this draw; `more()` waits for them so page 0 is never read twice. */
    firstPages: Promise<void>;
    /** `requestsSoFar` when this draw started: 0 for the reader's first draw (the screen's start), else its own start. */
    sentAtStart: number;
  }
  let generation = 0;
  let current: Draw = {
    vaults: [],
    links: new Map(),
    unchecked: new Set(),
    inflight: new Map(),
    spellings: { state: "not-needed" },
    reading: null,
    connectionsFailed: null,
    firstPages: Promise.resolve(),
    sentAtStart: 0,
  };
  // The newest call's own promise; an overtaken call waits for it.
  let newest: Promise<StakeholderList> | null = null;
  let rows: StakeholderListRow[] = [];

  const freshDraw = (): Draw => ({
    vaults: deps.vaults.map((vaultId) => ({ vaultId, records: new Map(), next: null, pending: 0, failed: null, linked: null, findAsked: false })),
    links: new Map(),
    unchecked: new Set(),
    inflight: new Map(),
    spellings: { state: "not-needed" },
    reading: null,
    connectionsFailed: null,
    firstPages: Promise.resolve(),
    sentAtStart: 0,
  });
  const stale = (D: Draw): boolean => D !== current;

  /** This draw's connections. The answer is written into the draw itself, never into another one. */
  async function readConnectionsOnce(D: Draw): Promise<void> {
    let r: ConnectionsReading;
    try {
      r = await deps.connections();
    } catch (e) {
      D.reading = null;
      D.connectionsFailed = reasonOf(e);
      return;
    }
    // The read follows the write: an answer for another vault is the wrong place, ⛔ never "no circles".
    if (deps.holderVault && r.vaultId && r.vaultId !== deps.holderVault) {
      D.reading = null;
      D.connectionsFailed = `the circles were answered for another vault (${r.vaultId}), not ${deps.holderVault}`;
      return;
    }
    D.reading = r;
    D.connectionsFailed = null;
  }

  async function readPage(v: VaultState, limit: number): Promise<void> {
    if (v.pending === null) return;
    const offset = v.pending;
    try {
      const page = await deps.listRecords(v.vaultId, offset, limit);
      for (const r of page.records) if (r.recordId?.trim()) v.records.set(r.recordId.trim(), r);
      v.next = page.next;
      v.pending = page.next;
      v.failed = null;
    } catch (e) {
      v.failed = reasonOf(e);
    }
  }

  /**
   * ONE REACH: one page of every vault still open (a failed vault is open: it is asked again from where
   * it stopped), each of at most its share of the 20 ({@link reachShares}), so a finished vault's share goes to the others.
   */
  function readReach(D: Draw): Promise<void> {
    const open = D.vaults.filter((v) => v.pending !== null);
    const shares = reachShares(deps.vaults, open.map((v) => v.vaultId));
    return Promise.all(open.map((v) => readPage(v, shares.get(v.vaultId) ?? 1))).then(() => undefined);
  }

  /** The link a record's reading names, from the caches only: a principal, null (no person), or undefined (not known yet). */
  function known(id: string, reading: LinkReading): string | null | undefined {
    if (reading.state !== "linked") return null;
    const key = `${id}\u0000${reading.target}`;
    return resolveCache.has(key) ? resolveCache.get(key)! : undefined;
  }

  /** Step 1: every record on the loaded pages whose link the door or the caches already answer gets it now. */
  function joinFromCaches(D: Draw): void {
    for (const v of D.vaults)
      for (const r of v.records.values()) {
        const id = r.recordId.trim();
        if (D.links.has(id) || D.unchecked.has(id)) continue;
        const reading = r.link ?? linkCache.get(`${id}\u0000${r.updatedAt ?? ""}`);
        if (!reading) continue;
        const p = known(id, reading);
        if (p !== undefined) D.links.set(id, p);
      }
  }

  async function findLinked(v: VaultState, pending: readonly ListedRecord[]): Promise<void> {
    // The find is asked once per draw per vault, and only when the door did not already carry the links.
    if (v.findAsked || !deps.linkedRecordIds || pending.every((r) => r.link)) return;
    v.findAsked = true;
    try {
      v.linked = new Set((await deps.linkedRecordIds(v.vaultId)).map(entityKey));
    } catch {
      // Not a gap in the list: the reader falls back to reading each record on the page.
      v.linked = null;
    }
  }

  /** One resolve, polite on a 429: wait the server's time plus jitter OUTSIDE the slot, at most BUSY_RETRIES times. */
  async function resolveOnce(D: Draw, id: string): Promise<ResolveOutcome | null> {
    for (let attempt = 0; ; attempt++) {
      if (stale(D)) return null;
      let answer: ResolveOutcome;
      try {
        answer = await resolveSlots(() => (stale(D) ? Promise.resolve<ResolveOutcome>({ kind: "unavailable", status: 0 }) : deps.resolve(id)));
      } catch {
        answer = { kind: "unavailable", status: 0 };
      }
      if (answer.kind !== "busy" || attempt >= BUSY_RETRIES) return answer;
      const base = answer.retryAfterMs ?? BUSY_DEFAULT_WAIT_MS;
      await wait(base + Math.floor(random() * base * 0.5));
    }
  }

  /** Step 2 for one record: its link principal (a PERSON answer) or null; a record that could not be checked is `unchecked`. */
  async function linkOf(D: Draw, v: VaultState, r: ListedRecord): Promise<void> {
    const id = r.recordId.trim();
    let reading: LinkReading | undefined = r.link;
    if (!reading && v.linked && !v.linked.has(entityKey(id))) reading = { state: "none" };
    if (!reading) {
      const key = `${id}\u0000${r.updatedAt ?? ""}`;
      reading = linkCache.get(key);
      if (!reading) {
        if (stale(D)) return;
        try {
          reading = await linkSlots<LinkReading>(() => (stale(D) ? Promise.reject(new Error("overtaken")) : deps.readLink(id)));
          linkCache.set(key, reading);
        } catch {
          if (!stale(D)) D.unchecked.add(id);
          return;
        }
      }
    }
    const kept = known(id, reading);
    if (kept !== undefined || reading.state !== "linked") {
      D.links.set(id, kept ?? null);
      return;
    }
    const answer = await resolveOnce(D, id);
    if (!answer) return;
    const key = `${id}\u0000${reading.target}`;
    if (answer.kind === "person") {
      resolveCache.set(key, answer.principal);
      D.links.set(id, answer.principal);
    } else if (answer.kind === "organization" || answer.kind === "none") {
      // An answer: no person is named. Kept, so a refresh does not ask again.
      resolveCache.set(key, null);
      D.links.set(id, null);
    } else if (!stale(D)) {
      // unavailable, busy after the retries, unauthenticated: not an answer about this record. An overtaken draw's failure is
      // never written: the newer draw asks for itself.
      D.unchecked.add(id);
    }
  }

  /** Step 2: the links of every record on the loaded pages that is not known yet. */
  async function settleLinks(D: Draw): Promise<void> {
    await Promise.all(
      D.vaults.map(async (v) => {
        const pending = [...v.records.values()].filter((r) => !D.links.has(r.recordId.trim()) && !D.unchecked.has(r.recordId.trim()));
        if (!pending.length) return;
        await findLinked(v, pending);
        await Promise.all(
          pending.map((r) => {
            const id = r.recordId.trim();
            let job = D.inflight.get(id);
            if (!job) {
              job = linkOf(D, v, r).finally(() => D.inflight.delete(id));
              D.inflight.set(id, job);
            }
            return job;
          }),
        );
      }),
    );
  }

  /**
   * Whether a member may be an older spelling. False when nobody is placed. Else true when a placed member has the old `/i`
   * WebID form (two spellings of one placed-only person), or a resolved link names someone other than the holder
   * whom no member equals exactly.
   */
  function spellingCheckNeeded(D: Draw, people: readonly ConnectedPerson[]): boolean {
    const members = new Set(people.map((p) => p.principal.trim()).filter(Boolean));
    if (!members.size) return false;
    if ([...members].some(isOldWebIdMember)) return true;
    return [...D.links.values()].some((p) => p && !members.has(p) && p !== D.reading?.holder);
  }

  /** Step 3: the canonicaliser, and whether every member could be checked. */
  async function checkSpellings(D: Draw, people: readonly ConnectedPerson[]): Promise<void> {
    if (!spellingCheckNeeded(D, people)) {
      D.spellings = { state: "not-needed" };
      return;
    }
    const members = [...new Set(people.map((p) => p.principal.trim()).filter(Boolean))];
    // An opaque member names itself (no request, not counted toward the canonicaliser's 50).
    for (const m of members) {
      const self = opaqueSelf(m);
      if (self !== null) canonical.set(m, self);
    }
    // `/i` members first, so the bound is spent where an old spelling is likeliest.
    const pending = membersToAsk(members).filter((m) => !canonical.has(m));
    if (!pending.length) {
      D.spellings = { state: "resolved" };
      return;
    }
    if (!deps.canonical) {
      D.spellings = { state: "unresolved", reason: `spellings unresolved: no spelling check is available for ${pending.length} placed people` };
      return;
    }
    const ask = deps.canonical;
    let notKnown = 0;
    await Promise.all(
      pending.map(async (m) => {
        try {
          const c = await canonicalSlots(() => ask(m));
          if (c) canonical.set(m, c);
          // null is "no person" only when the canonicaliser says it answered; else it is "could not ask" (5xx, the limit).
          else if (ask.answered && !ask.answered(m)) notKnown++;
        } catch {
          notKnown++;
        }
      }),
    );
    D.spellings = notKnown
      ? { state: "unresolved", reason: `spellings unresolved: ${notKnown} placed people could not be checked for an older spelling` }
      : { state: "resolved" };
  }

  function draw(D: Draw, settling: boolean): StakeholderList {
    const { reading, connectionsFailed } = D;
    const people = reading?.people ?? [];
    const records: StakeholderRecordInput[] = [];
    const linking = new Set<string>();
    for (const v of D.vaults) {
      for (const r of v.records.values()) {
        const id = r.recordId.trim();
        if (!D.links.has(id) && !D.unchecked.has(id)) linking.add(id);
        records.push({ recordId: id, vaultId: v.vaultId, title: r.title ?? null, type: r.type ?? null, link: D.links.get(id) ?? null });
      }
    }
    const drawn = mergeStakeholderRows({
      people,
      records,
      self: { principal: reading?.holder?.trim() || deps.holder, cardIds: [...deps.ownCardIds] },
      canonical: (p) => canonical.get(p) ?? "",
    }).map((row) => ({ ...row, linking: row.principal === null && row.recordId !== null && linking.has(row.recordId) }));
    if (!stale(D)) rows = drawn;
    const vaultStates = D.vaults.map((v) =>
      v.failed
        ? { vaultId: v.vaultId, state: "failed" as const, complete: false, reason: v.failed }
        : { vaultId: v.vaultId, state: "read" as const, complete: v.pending === null },
    );
    const stillUnchecked = [...D.unchecked].sort();
    const shownSpellings: StakeholderList["spellings"] = settling ? { state: "checking" } : D.spellings;
    return {
      rows: drawn,
      connections: connectionsFailed === null ? { state: "read" } : { state: "failed", reason: connectionsFailed },
      vaults: vaultStates,
      links: { unchecked: stillUnchecked, linking: [...linking].sort() },
      complete: vaultStates.every((v) => v.complete),
      spellings: shownSpellings,
      settling,
      partial:
        connectionsFailed !== null || vaultStates.some((v) => v.state === "failed") || stillUnchecked.length > 0 || shownSpellings.state === "unresolved",
    };
  }

  /**
   * Whether something can be off the loaded pages: a held vault has a next page, or its page failed.
   * When every held vault's first page was its last, every record is on the page and the up-front read would find nothing new.
   */
  function offPagePossible(D: Draw): boolean {
    return D.vaults.some((v) => v.pending !== null || v.failed !== null);
  }

  /**
   * The placed people to ask the app about up front: each once, in the connections' order (more placements first: the people
   * the holder placed most, whose records matter most), minus those a record on the loaded pages already joins (by its resolved
   * link, whatever its spelling, or by a link to the same address), at most {@link LINKED_LOOKUP_CAP}.
   */
  function upFrontMembers(D: Draw, people: readonly ConnectedPerson[]): string[] {
    if (!deps.linkedRecordsOf) return [];
    const onPage = new Set<string>();
    for (const p of D.links.values()) if (p) onPage.add(p.trim());
    for (const v of D.vaults)
      for (const r of v.records.values()) if (r.link?.state === "linked") onPage.add(r.link.target.trim());
    const out: string[] = [];
    for (const p of people) {
      const m = p.principal.trim();
      if (!m || onPage.has(m) || out.includes(m)) continue;
      out.push(m);
      if (out.length >= LINKED_LOOKUP_CAP) break;
    }
    return out;
  }

  /**
   * The requests the up-front read may cost: what this screen has left of {@link FIRST_SCREEN_REQUESTS}, counted from
   * the draw's start, minus the name reads waiting for a slot (the app's count has only what was sent). Undefined without
   * `requestsSoFar`.
   */
  function upFrontBudget(D: Draw): number | undefined {
    if (!deps.requestsSoFar) return undefined;
    const spent = deps.requestsSoFar() - D.sentAtStart + nameSlots.queued();
    return Math.max(0, FIRST_SCREEN_REQUESTS - spent);
  }

  /** The app's linked records, added to their held vault's records (a later page of the same record replaces it: one row). */
  async function addLinkedRecords(D: Draw, members: readonly string[]): Promise<void> {
    let found: readonly { vaultId: string; record: ListedRecord }[];
    try {
      found = await deps.linkedRecordsOf!(members, upFrontBudget(D));
    } catch {
      // Not a gap: each record still joins when its page comes, as without the door.
      return;
    }
    if (stale(D)) return;
    for (const { vaultId, record } of found) {
      const v = D.vaults.find((x) => x.vaultId === vaultId);
      const id = record?.recordId?.trim();
      if (!v || !id || v.records.has(id)) continue;
      v.records.set(id, record);
    }
  }

  /** Steps 1-3 after the pages are in. Lists go to the subscriber only while this call is the newest; an overtaken call stops. */
  async function settle(D: Draw, my: number, upFront = false): Promise<StakeholderList | null> {
    const newestCall = () => my === generation;
    const emit = (list: StakeholderList): StakeholderList => {
      if (newestCall()) options.onRows?.(list);
      return list;
    };
    if (stale(D)) return null;
    joinFromCaches(D);
    const people = D.reading?.people ?? [];
    const pendingLinks = () => D.vaults.some((v) => [...v.records.keys()].some((id) => !D.links.has(id) && !D.unchecked.has(id)));
    // The linked records of the placed people, asked once per draw, after the first rows are out and after
    // the page's own links (so a person joined on the page is not asked for, and the budget sees the page's resolves); only when
    // something can be off the page.
    // Before the links this is a superset of who will be asked (a link resolved on the page only takes people out).
    const upFrontWanted = upFront && offPagePossible(D) && upFrontMembers(D, people).length > 0;
    let linksPending = pendingLinks();
    let linked = false;
    if (linksPending || upFrontWanted || spellingCheckNeeded(D, people)) emit(draw(D, true));
    if (linksPending) {
      await settleLinks(D);
      if (stale(D)) return null;
      linked = true;
    }
    const ask = upFrontWanted ? upFrontMembers(D, people) : [];
    if (ask.length > 0) {
      // The joined rows of the page are drawn before the up-front read answers.
      if (linked) emit(draw(D, true));
      await addLinkedRecords(D, ask);
      if (stale(D)) return null;
      joinFromCaches(D);
      linksPending = pendingLinks();
      if (linksPending) {
        await settleLinks(D);
        if (stale(D)) return null;
        linked = true;
      }
    }
    if (linked && spellingCheckNeeded(D, people)) emit(draw(D, true));
    await checkSpellings(D, people);
    if (stale(D) || !newestCall()) return null;
    return emit(draw(D, false));
  }

  /**
   * Runs one call and resolves with the NEWEST complete list: its own when no newer call started meanwhile, else the newest
   * call's (which may itself be overtaken: then the one after it). ⛔ Never an overtaken draw's half-joined or emptied list.
   */
  function track(run: (my: number) => Promise<StakeholderList | null>): Promise<StakeholderList> {
    const my = ++generation;
    const own = run(my);
    const result = (async (): Promise<StakeholderList> => {
      const list = await own;
      if (list && my === generation) return list;
      // Overtaken: wait for the newest call (it is set below before this line can run, since `own` awaited at least once).
      return newest!;
    })();
    newest = result;
    return result;
  }

  // The reader's first draw counts from the screen's start (the app's count is the screen's); a later draw from its own start.
  let draws = 0;
  const first = (): Promise<StakeholderList> =>
    track(async (my) => {
      const D = freshDraw();
      D.sentAtStart = draws++ === 0 ? 0 : (deps.requestsSoFar?.() ?? 0);
      current = D;
      D.firstPages = readReach(D);
      await Promise.all([readConnectionsOnce(D), D.firstPages]);
      return settle(D, my, true);
    });

  return {
    read: first,
    refresh: first,
    more() {
      if (!current.vaults.length) return first();
      return track(async (my) => {
        const D = current;
        // Called before the first pages are in, it waits for them; then it reads the page AFTER them.
        await D.firstPages;
        if (stale(D)) return null;
        // A record whose link could not be checked is asked again with the next page (inside the same limiters).
        D.unchecked = new Set();
        await readReach(D);
        return settle(D, my);
      });
    },
    async names(keys) {
      // With `linkedNames`, a linked (both) row is read as a placed one is, by its principal (one read, kept,
      // shared by both kinds). Without it, only placed-only rows, as without the option.
      const readable = (r: StakeholderListRow) => r.kind === "placed" || (r.kind === "both" && options.linkedNames === true);
      const placed = new Map(rows.filter((r) => readable(r) && r.principal).map((r) => [r.key, r.principal!]));
      const asked = [...new Set(keys)];
      const wanted = asked.filter((k) => placed.has(k));
      const out = new Map<string, NameState>();
      const self = rows.find((r) => r.kind === "self");
      if (self && deps.selfName && asked.includes(self.key)) {
        const a = deps.selfName();
        if (a) out.set(self.key, nameStateOf(a));
      }
      await Promise.all(
        wanted.map(async (key) => {
          const principal = placed.get(key)!;
          const kept = nameCache.get(principal);
          if (kept) return out.set(key, kept);
          let flight = nameInFlight.get(principal);
          if (!flight) {
            flight = (async (): Promise<NameState> => {
              try {
                const a = await nameSlots(() => deps.readName(principal));
                const s = nameStateOf(a);
                if (s.state !== "unavailable") nameCache.set(principal, s);
                return s;
              } catch (e) {
                // A sign-in failure is passed through, the door's own error, so the
                // list can say "You are signed out". It is not kept: once signed in again, the next ask reads it.
                if (isCredentialSurfaceError(e)) throw e;
                return { state: "unavailable" };
              } finally {
                nameInFlight.delete(principal);
              }
            })();
            nameInFlight.set(principal, flight);
          }
          return out.set(key, await flight);
        }),
      );
      return out;
    },
  };
}

/**
 * One draw of the list (the first page of every held vault), settled, for a caller that keeps no reader.
 *
 * @param deps the app's doors, the holder, the held vaults and the own card ids
 * @param options `onRows` gets the first rows before the links are in
 */
export async function readStakeholderList(deps: StakeholderListDeps, options: StakeholderListOptions = {}): Promise<StakeholderList> {
  return createStakeholderListReader(deps, options).read();
}
