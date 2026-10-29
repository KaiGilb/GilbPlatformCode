/**
 * Which held records are connected to an online card, as far as this session has ALREADY READ.
 *
 * The list's rows carry no link: the records door sends a label and a type, and a labelled row is a stub (`hydrated: false`, one fact).
 * So a list marker cannot come from the row for those, and it must not come from a request per row (the defect at n rows). What the
 * session does know is the link of every card the holder OPENED (the card reads the record whole) and of every link the holder made or
 * removed. This store holds exactly that, per record address, written by the card (never by a read of its own), read by the rows.
 * It is the device's memory of a read already made: empty after a reload, ⛔ never a source of a link (nothing is written to a vault from it).
 */
import { useSyncExternalStore } from "react";

const known = new Map<string, boolean>();
const listeners = new Set<() => void>();

/** The card knows the link of this record now (opened it, or linked, or unlinked). */
export function noteConnected(entityUri: string, connected: boolean): void {
  if (!entityUri || known.get(entityUri) === connected) return;
  known.set(entityUri, connected);
  for (const l of [...listeners]) l();
}

/** What this session knows of the record: `undefined` when it has not read its link. */
export function connectedKnown(entityUri: string | undefined | null): boolean | undefined {
  return entityUri ? known.get(entityUri) : undefined;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** A row's marker: what the session read of this record's link, else what the row's own read carries. No request. */
export function useConnected(entityUri: string | undefined | null, fromRow: boolean): boolean {
  return useSyncExternalStore(
    subscribe,
    () => connectedKnown(entityUri) ?? fromRow,
    () => fromRow,
  );
}

/** Test seam: forget everything. */
export function __resetConnectedRecords(): void {
  known.clear();
}
