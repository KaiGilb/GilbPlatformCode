/**
 * The session's up-front answers of the Stakeholders list: per holder, held stores and member, the records the find named, and the read
 * of each record, so a refresh (after a create) or a holder switch back with the same members asks nothing again. Kept for the page's
 * life; never a stand-in for a record's own read (the record's page, when it comes, replaces it). `linkedRecordsOf` (the list's doors)
 * is their one reader and writer.
 *
 * They are forgotten:
 *   - the finds and reads, on a link write (`forgetLinkedFinds`), since a new or removed link changes which records a member has;
 *     what the session knows was deleted or ended is kept;
 *   - whole, on sign-out (`forgetLinkedRecords`);
 *   - one record, on its delete (`forgetDeletedLinkedRecord`), so a deleted record is never drawn again from what was kept. The app's
 *     one delete door calls it once the DELETE has landed.
 *
 *   - one record, on a resolve that answers 404 for a record kept as read (`forgetEndedLinkedRecord`): the record ended in another
 *     tab or device. Taken back when a page lists it again (`relistLinkedRecord`).
 *
 * This module does not import the list's doors: the type of a listed record comes from the list reader, and `idFromUri` from the
 * vault sets, which the delete door imports too.
 */
import type { ListedRecord } from "@kaigilb/gilbplatformcode-stakeholder-list-reader";
import { idFromUri } from "@kaigilb/gilbplatformcode-lws-vault-sets";

/** One linked record the up-front read found, as the reader takes it. */
export type LinkedFound = { vaultId: string; record: ListedRecord };

/**
 * Member key (`linkedRecordsOf`'s `keyOf`) → the record addresses its find named, and whether every one was read (`complete`).
 * A member cut short by the budget is kept too: its records already read come back at 0 cost, and it is asked again when the budget
 * allows.
 */
export const memberAnswers = new Map<string, { ids: readonly string[]; complete: boolean }>();

/** Record address → its read as the list takes it, or null: the record is gone. */
export const recordReads = new Map<string, LinkedFound | null>();

/**
 * The kept answers that came from the SCREEN, not from a find or a read: a member answered by the screen's loaded links (key: the
 * member key) and a record answered by a document its page carried (key: the record address), each with the time it lapses (the
 * list's read + the app's own 15 s record freshness). Past it `linkedRecordsOf` forgets the answer and asks again, so an answer the
 * screen gave never lives longer than main's own find and read would have shown it.
 */
export const screenAnswerUntil = new Map<string, number>();

/**
 * Whether a kept answer that came from the screen has lapsed (false for an answer from a find or a read, or none).
 *
 * @param key the member key or the record address
 * @param now the time now (ms)
 */
export function screenAnswerLapsed(key: string, now: number = Date.now()): boolean {
  const until = screenAnswerUntil.get(key);
  return until !== undefined && now >= until;
}

/**
 * Each linked record's anchor ask (`resolveOnlineCard`) is SHARED while it is in flight: the same record asked again by an overlapping
 * draw or reader waits for the first ask instead of sending its own (the duplicates of the end-of-list screen). ⚠ Not kept after it
 * answers: a later reader asks again, because a record ended since answers 404 only to a new ask ("a record this session saw joined,
 * that then answers 404, is taken as ended").
 */
const resolveAnswers = new Map<string, Promise<unknown>>();

/**
 * The anchor ask in flight for this key, or `ask()` (shared until it answers).
 *
 * @param key holder and record
 * @param ask the one request
 */
export function keptResolve<T>(key: string, ask: () => Promise<T>): Promise<T> {
  const was = resolveAnswers.get(key) as Promise<T> | undefined;
  if (was) return was;
  const p = ask().finally(() => resolveAnswers.delete(key));
  resolveAnswers.set(key, p);
  return p;
}

/**
 * The ids of the records deleted in this session. `linkedRecordsOf` skips every id here: in a kept answer, in a new find, and in a read
 * that was already out when the delete landed (its late answer is kept as gone). The Stakeholders grid hides these records too, so a
 * deleted record still listed by a cached page is never drawn again, whichever view it was deleted from. Kept for the session (a link
 * write keeps it, `forgetLinkedFinds`); cleared on sign-out.
 */
const deletedIds = new Set<string>();
const deletedListeners = new Set<() => void>();
let deletedRev = 0;
function tellDeleted(): void {
  deletedRev += 1;
  for (const l of deletedListeners) l();
}

/** A number that changes each time the session's deleted list changes (a `useSyncExternalStore` snapshot). */
export function deletedLinkedRevision(): number {
  return deletedRev;
}

/**
 * Whether a record was deleted in this session, or is taken as ended (a resolve's 404: `forgetEndedLinkedRecord`).
 *
 * @param uri the record's address (or its id)
 */
export function isDeletedLinkedRecord(uri: string): boolean {
  const id = idFromUri(uri);
  return deletedIds.has(id) || endedIds.has(id);
}

/** Forget every kept up-front answer and every deleted id: the session ends (sign-out). A link write forgets only the finds. */
export function forgetLinkedRecords(): void {
  memberAnswers.clear();
  recordReads.clear();
  screenAnswerUntil.clear();
  resolveAnswers.clear();
  if (deletedIds.size > 0) {
    deletedIds.clear();
    tellDeleted();
  }
  joinedIds.clear();
  if (endedIds.size > 0) {
    endedIds.clear();
    tellEnded();
  }
}

/**
 * Forget the kept find answers (a record was just made and linked), ⛔ keeping what this session knows was deleted or ended, so a
 * deleted record still drawn somewhere is never taken for live. A link write (the card controller's `onLinkChanged`) calls this too.
 */
export function forgetLinkedFinds(): void {
  memberAnswers.clear();
  recordReads.clear();
  screenAnswerUntil.clear();
  joinedIds.clear();
}

/**
 * Forget one deleted record: from now on `linkedRecordsOf` skips it in every kept answer and in every new one, at no cost and with no
 * request, so no draw brings it back. The other kept answers stay as they are.
 *
 * @param id the record's id, as the delete door has it (or its address). A record id names one record on the platform, whichever
 *   host spells its address, so the kept addresses are matched by their last segment.
 */
export function forgetDeletedLinkedRecord(id: string): void {
  const bare = idFromUri(id);
  if (deletedIds.has(bare)) return;
  deletedIds.add(bare);
  tellDeleted();
}

/** The ids of the records deleted in this session (a copy). */
export function deletedLinkedRecords(): ReadonlySet<string> {
  return new Set(deletedIds);
}

/**
 * Follow the ids deleted in this session.
 *
 * @param listener called each time the set changes
 * @returns the unsubscribe
 */
export function onDeletedLinkedRecords(listener: () => void): () => void {
  deletedListeners.add(listener);
  return () => deletedListeners.delete(listener);
}

/**
 * The ids of the records kept as read that a resolve answered 404 for, and that no page of the reader that asked had listed: ended in
 * another tab or device. `linkedRecordsOf` skips them as it skips the deleted ones, and the list hides their rows
 * (`useStakeholderListReader`). ⚠ The platform answers the same 404 for "no link / not a card / ambiguous", so this is not proof the
 * record ended: a page that lists one of them again takes it out of here (`relistLinkedRecord`).
 */
/**
 * The record ids this session saw resolve to a person or an organization. The platform answers the same 404 for an ended record and
 * for a live one with no card behind its link (or in a non-home held vault), so a 404 is taken as "ended" only for a record in this
 * set. Cleared with the rest in {@link forgetLinkedRecords}.
 */
const joinedIds = new Set<string>();

/**
 * Note that a record resolved to a person or an organization in this session.
 *
 * @param uri the record's id or address
 */
export function noteJoinedLinkedRecord(uri: string): void {
  joinedIds.add(idFromUri(uri));
}

/**
 * Whether this session saw the record resolve to a person or an organization before.
 *
 * @param uri the record's id or address
 */
export function wasJoinedLinkedRecord(uri: string): boolean {
  return joinedIds.has(idFromUri(uri));
}

const endedIds = new Set<string>();
const endedListeners = new Set<(ids: ReadonlySet<string>) => void>();
function tellEnded(): void {
  const now = new Set(endedIds);
  for (const l of endedListeners) l(now);
}

/**
 * Whether a record is kept as read by the up-front read (its read answered a record, ⛔ not "gone").
 *
 * @param uri the record's address (or its id)
 */
export function isKeptLinkedRecord(uri: string): boolean {
  const id = idFromUri(uri);
  for (const [k, v] of recordReads) if (v && idFromUri(k) === id) return true;
  return false;
}

/**
 * Forget one kept record whose resolve answered 404. The caller checks that the record is kept as read and that its reader's pages did
 * not list it. No request.
 *
 * @param uri the record's address (or its id)
 */
export function forgetEndedLinkedRecord(uri: string): void {
  const id = idFromUri(uri);
  if (endedIds.has(id)) return;
  endedIds.add(id);
  tellEnded();
}

/**
 * A page listed this record: it is live, so it is no longer taken as ended. No request.
 *
 * @param uri the record's address (or its id)
 */
export function relistLinkedRecord(uri: string): void {
  if (endedIds.delete(idFromUri(uri))) tellEnded();
}

/** The ids taken as ended now (`forgetEndedLinkedRecord`). */
export function endedLinkedRecords(): ReadonlySet<string> {
  return new Set(endedIds);
}

/**
 * Follow the ids taken as ended.
 *
 * @param listener called with the whole set each time it changes
 * @returns the unsubscribe
 */
export function onEndedLinkedRecords(listener: (ids: ReadonlySet<string>) => void): () => void {
  endedListeners.add(listener);
  return () => endedListeners.delete(listener);
}
