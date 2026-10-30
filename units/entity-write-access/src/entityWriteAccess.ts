/**
 * Which entities THIS PAGE was refused a write on, and whether a screen may write one.
 *
 * The pure answer ("may this session write this record, from the frame it holds") lives in the unit `record-write`
 * and takes the refusal as an argument. This file is the memory of the refusals: a set of record ids, process-wide,
 * that a screen fills when a write came back 403 and reads on every render, so the Access marks and the fields
 * flip closed the moment a pin is added.
 */
import { useCallback, useEffect, useState } from "react";
import { entityWriteAllowed as entityWriteAllowedFor, recordWriteAllowed } from "@kaigilb/gilbplatformcode-record-write";

/** The one sentence a screen shows for a read-only entity. It is `record-write`'s, re-exported here so a screen takes both from one place. */
export { ENTITY_READ_ONLY_REASON } from "@kaigilb/gilbplatformcode-record-write";

const denied = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

/** True when this session already saw a write 403 for this record id. */
export function isEntityWriteDenied(recordId: string | null | undefined): boolean {
  if (!recordId) return false;
  return denied.has(recordId);
}

/** Pin a record as non-writable after Base refused a write (403 / RecordForbiddenError). */
export function markEntityWriteDenied(recordId: string): void {
  if (!recordId || denied.has(recordId)) return;
  denied.add(recordId);
  notify();
}

/** Test helper — clear session pins. */
export function clearEntityWriteDenials(): void {
  if (denied.size === 0) return;
  denied.clear();
  notify();
}

/**
 * @deprecated Prefer useEntityCanWrite with the record's facts. Kept for call sites that only have an id.
 * Vault write + not 403-pinned (no proactive grant-attr read).
 */
export function entityWriteAllowed(
  vaultWriteAllowed: boolean,
  recordId: string | null | undefined,
): boolean {
  return entityWriteAllowedFor(vaultWriteAllowed, recordId, isEntityWriteDenied(recordId));
}

/**
 * Reactive: re-renders when a pin is added so Access + fields flip closed.
 */
export function useEntityCanWrite(
  vaultWriteAllowed: boolean,
  record: { id: string; facts?: Record<string, string> } | string | null | undefined,
  identityKeys?: readonly string[] | null,
): boolean {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  if (record == null) return false;
  if (typeof record === "string") return entityWriteAllowed(vaultWriteAllowed, record);
  return recordWriteAllowed(vaultWriteAllowed, record, identityKeys, isEntityWriteDenied(record.id));
}

/** Stable mark helper for event handlers (same module singleton). */
export function useMarkEntityWriteDenied(): (recordId: string) => void {
  return useCallback((recordId: string) => {
    markEntityWriteDenied(recordId);
  }, []);
}
