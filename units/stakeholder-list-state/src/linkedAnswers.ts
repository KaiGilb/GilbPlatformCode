// The session's list of the records deleted in this session, with its listeners and its revision.
// Taken from the app's linked-answers file: the deleted-ids state, its writer and its readers (the rest of the file is not taken).

import { idFromUri } from "@kaigilb/gilbplatformcode-lws-vault-sets";

/**
 * The ids of the records deleted in this session. The list that reads up-front answers skips every id here: in a kept answer, in a new
 * find, and in a read that was already out when the delete landed (its late answer is kept as gone). The Stakeholders grid hides these
 * records too, so a deleted record still listed by a cached page is never drawn again, whichever view it was deleted from. Kept for the
 * session; cleared on sign-out.
 */
const deletedIds = new Set<string>();
const deletedListeners = new Set<() => void>();
let deletedRev = 0;
function tellDeleted(): void {
  deletedRev += 1;
  for (const l of deletedListeners) l();
}

/** a number that changes each time the session's deleted list changes (a `useSyncExternalStore` snapshot). */
export function deletedLinkedRevision(): number {
  return deletedRev;
}

/**
 * Forget one deleted record: from now on `linkedRecordsOf` skips it in every kept answer and in
 * every new one, at no cost and with no request, so no draw brings it back. The other kept answers stay as they are.
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

/** the ids of the records deleted in this session (a copy). */
export function deletedLinkedRecords(): ReadonlySet<string> {
  return new Set(deletedIds);
}

/**
 * follow the ids deleted in this session.
 *
 * @param listener called each time the set changes
 * @returns the unsubscribe
 */
export function onDeletedLinkedRecords(listener: () => void): () => void {
  deletedListeners.add(listener);
  return () => deletedListeners.delete(listener);
}
