/**
 * Whether one record may be written, from the frame the host already holds.
 * The session pin (a write that was refused) is an argument. This file does not remember it.
 */

export const ENTITY_READ_ONLY_REASON = "You can read this item but not edit it.";

export const GRANT_READER_KEYS = ["directReader", "a:directReader"] as const;
export const GRANT_WRITER_KEYS = ["directWriter", "a:directWriter"] as const;
export const STORED_BY_KEYS = ["fileStoredBy", "a:fileStoredBy"] as const;

export interface RecordWriteFrame {
  id: string;
  facts?: Record<string, string>;
}

/** Principal, then the short address, each trimmed. A blank is left out. */
export function sessionIdentityKeys(
  principal: string | null | undefined,
  shortWebId?: string | null,
): string[] {
  const out: string[] = [];
  if (principal?.trim()) out.push(principal.trim());
  if (shortWebId?.trim()) out.push(shortWebId.trim());
  return out;
}

/**
 * Vault write, and this record is not pinned, and the frame does not say
 * "reader only" for this session.
 *
 * `sessionDenied` is the pin for this record's id. Pass false only when this
 * session has not already been refused a write of this id.
 */
export function recordWriteAllowed(
  vaultWriteAllowed: boolean,
  record: RecordWriteFrame | null | undefined,
  identityKeys: readonly string[] | null | undefined,
  sessionDenied: boolean,
): boolean {
  if (!vaultWriteAllowed || !record?.id) return false;
  if (sessionDenied) return false;

  const readers = grantValues(record.facts, GRANT_READER_KEYS);
  const writers = grantValues(record.facts, GRANT_WRITER_KEYS);
  if (readers.length === 0 && writers.length === 0) return true;

  const me = identitySet(identityKeys);
  if (includesIdentity(writers, me)) return true;
  if (includesIdentity(readers, me)) return storedByIdentity(record.facts, me);
  return true;
}

/** Vault write, and this id is not pinned. Does not read grants. */
export function entityWriteAllowed(
  vaultWriteAllowed: boolean,
  recordId: string | null | undefined,
  sessionDenied: boolean,
): boolean {
  if (!vaultWriteAllowed || !recordId) return false;
  return !sessionDenied;
}

function refValue(raw: string): string {
  const s = raw.trim();
  if (!s.startsWith("{")) return s;
  try {
    const parsed: unknown = JSON.parse(s);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { "@id"?: unknown })["@id"] === "string"
    ) {
      return (parsed as { "@id": string })["@id"].trim();
    }
  } catch {
    /* not JSON — the literal will not match an identity */
  }
  return s;
}

function storedByIdentity(
  facts: Record<string, string> | undefined,
  me: Set<string>,
): boolean {
  if (!facts || me.size === 0) return false;
  for (const key of STORED_BY_KEYS) {
    const raw = facts[key]?.trim();
    if (!raw) continue;
    const parts = raw.startsWith("{") ? [raw] : raw.split(/[\n,]+/);
    for (const part of parts) {
      const value = refValue(part);
      if (value && me.has(value.toLowerCase())) return true;
    }
  }
  return false;
}

function grantValues(
  facts: Record<string, string> | undefined,
  keys: readonly string[],
): string[] {
  if (!facts) return [];
  const out: string[] = [];
  for (const key of keys) {
    const raw = facts[key]?.trim();
    if (!raw) continue;
    for (const part of raw.split(/[\n,]+/)) {
      const value = part.trim();
      if (value) out.push(value);
    }
  }
  return out;
}

function identitySet(keys: readonly string[] | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const key of keys ?? []) {
    const trimmed = key?.trim();
    if (trimmed) set.add(trimmed.toLowerCase());
  }
  return set;
}

function includesIdentity(granted: readonly string[], me: Set<string>): boolean {
  if (me.size === 0) return false;
  for (const grant of granted) {
    if (me.has(grant.trim().toLowerCase())) return true;
  }
  return false;
}
