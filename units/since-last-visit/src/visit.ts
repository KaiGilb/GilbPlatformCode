// "Since your last visit": which records OTHER people added, changed or deleted since this person
// was last here. Headless: no React, no network, no clock of its own. The listing the app already
// holds goes in; a small snapshot is kept in the store the app passes.
//
// Limits (also in the README):
//  - The visit time is this DEVICE's clock (`at`). The records' `updatedAt` is the platform's. A
//    device clock that is wrong by a minute can hide or show a change from that minute.
//  - The snapshot lives in the store you pass (usually localStorage): per browser, per device. Another
//    device has its own last visit.
//  - A deleted record keeps no facts, so a delete cannot say who did it: its `who` is "someone",
//    and the person's OWN deletes are not told apart. Call `noteOwn` when the person deletes.
//  - A change is seen only while the record is still listed (or listed as ended). A record added and
//    removed again between two visits is never seen.

/** A store like `localStorage`. Pass `null` for no memory (no banner, ever). */
export interface VisitStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type VisitChangeKind = "added" | "changed" | "deleted";

/** One record in the listing the app already has. */
export interface VisitItem {
  id: string;
  /** When the record last changed (for an ended record: when it ended). Epoch ms, a Date, or an ISO string. */
  updatedAt: number | string | Date;
  /** A short name for the record, shown in the banner. Default: the id. */
  label?: string | null;
  /** Who wrote it (their address or name), when the records carry it. Absent: the change is shown, as "someone". */
  statedBy?: string | null;
}

/** What is kept between visits. */
export interface VisitSnapshot {
  /** Epoch ms of the last visit, from the device clock. */
  at: number;
  /** id -> label of every record listed at that visit. Absent when the visit was written without a listing. */
  labels?: Record<string, string>;
}

export interface VisitChange {
  kind: VisitChangeKind;
  id: string;
  label: string;
  /** A short name for the writer, or "someone". */
  who: string;
  /** Epoch ms. */
  at: number;
}

export interface DiffVisitOptions {
  /** The person's own address or name (or several): changes stated by these are left out. */
  me: string | readonly string[];
  /** The records that ended (deleted) since, `updatedAt` = when they ended. Optional; without it no delete is told. */
  ended?: readonly VisitItem[];
  /** Turns `statedBy` into the word shown. Default: the first label of a URL's host, else the text itself. */
  whoLabel?: (statedBy: string) => string;
}

const SOMEONE = "someone";

/** The default writer label: "https://john.example.test/vault" -> "john"; "John" -> "John". */
export function defaultWhoLabel(statedBy: string): string {
  const t = statedBy.trim();
  if (!t) return SOMEONE;
  try {
    const first = new URL(t).hostname.split(".")[0];
    return first || SOMEONE;
  } catch {
    return t;
  }
}

function atMs(v: number | string | Date): number {
  const n = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(n) ? n : NaN;
}

function labelsOf(listing: readonly VisitItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of listing) out[it.id] = (it.label ?? "").trim() || it.id;
  return out;
}

/**
 * The last visit, or null when there is none or it cannot be read.
 *
 * @param store where visits are kept (`null`: none)
 * @param key one key per person and per list, e.g. `app:visit:<person>:<vault>`
 * @returns the snapshot, or null
 */
export function readVisit(store: VisitStore | null, key: string): VisitSnapshot | null {
  try {
    const raw = store?.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<VisitSnapshot> | null;
    if (!v || typeof v.at !== "number" || !Number.isFinite(v.at)) return null;
    if (v.labels === undefined) return { at: v.at };
    if (v.labels === null || typeof v.labels !== "object" || Array.isArray(v.labels)) return null;
    return { at: v.at, labels: v.labels };
  } catch {
    return null;
  }
}

/**
 * Remembers this visit. Never throws: a refused store means no banner next time, nothing else.
 *
 * @param store where to keep it (`null`: nowhere)
 * @param key the same key `readVisit` uses
 * @param at the time of this visit, epoch ms (the device clock: `Date.now()`)
 * @param listing the records listed now. Without it the next visit cannot tell "added" from "changed" (it says "changed").
 */
export function writeVisit(store: VisitStore | null, key: string, at: number, listing?: readonly VisitItem[]): void {
  try {
    const snap: VisitSnapshot = listing ? { at, labels: labelsOf(listing) } : { at };
    store?.setItem(key, JSON.stringify(snap));
  } catch {
    /* storage refused: no banner next time */
  }
}

/**
 * What other people did since the snapshot, newest first. Pure. The first visit (no snapshot) answers nothing.
 *
 * @param previous the snapshot from `readVisit`
 * @param current the records listed now
 * @param opts who "me" is, the ended list, and the writer label
 * @returns the changes
 */
export function diffVisit(previous: VisitSnapshot | null, current: readonly VisitItem[], opts: DiffVisitOptions): VisitChange[] {
  if (!previous) return [];
  const mine = new Set(typeof opts.me === "string" ? [opts.me] : opts.me);
  const whoOf = opts.whoLabel ?? defaultWhoLabel;
  const isMine = (s: string | null | undefined): boolean => s != null && mine.has(s);
  const known = previous.labels;
  const out: VisitChange[] = [];
  const liveIds = new Set<string>();
  for (const it of current) {
    liveIds.add(it.id);
    const at = atMs(it.updatedAt);
    if (!Number.isFinite(at) || at <= previous.at || isMine(it.statedBy)) continue;
    const was = known ? Object.prototype.hasOwnProperty.call(known, it.id) : true;
    out.push({
      kind: was ? "changed" : "added",
      id: it.id,
      label: (it.label ?? "").trim() || known?.[it.id] || it.id,
      who: it.statedBy ? whoOf(it.statedBy) : SOMEONE,
      at,
    });
  }
  if (known) {
    for (const it of opts.ended ?? []) {
      const at = atMs(it.updatedAt);
      if (!Number.isFinite(at) || at <= previous.at || liveIds.has(it.id)) continue;
      if (!Object.prototype.hasOwnProperty.call(known, it.id)) continue; // never seen here: nothing to say
      out.push({ kind: "deleted", id: it.id, label: known[it.id] || it.id, who: SOMEONE, at });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * The whole pattern in one call: read the last visit, diff it, write this visit. Any failure of the
 * diff answers nothing and still writes nothing it cannot trust (a thrown error keeps the old snapshot).
 *
 * @param store where visits are kept
 * @param key the visit key
 * @param current the records listed now
 * @param opts as for `diffVisit`, plus `now` (default `Date.now()`)
 * @returns the changes to show
 */
export function recordVisit(store: VisitStore | null, key: string, current: readonly VisitItem[], opts: DiffVisitOptions & { now?: number }): VisitChange[] {
  const previous = readVisit(store, key);
  let changes: VisitChange[] = [];
  try {
    changes = diffVisit(previous, current, opts);
  } catch {
    return [];
  }
  writeVisit(store, key, opts.now ?? Date.now(), current);
  return changes;
}

/**
 * The person's own add or delete, noted at once so the next visit does not call it someone else's.
 * Does nothing before a first visit has been written.
 *
 * @param store where visits are kept
 * @param key the visit key
 * @param what the record the person added (`{ id, label }`) or deleted (`{ id }`)
 */
export function noteOwn(store: VisitStore | null, key: string, what: { added: { id: string; label?: string } } | { deleted: { id: string } }): void {
  const snap = readVisit(store, key);
  if (!snap) return;
  const labels = { ...(snap.labels ?? {}) };
  if ("added" in what) labels[what.added.id] = (what.added.label ?? "").trim() || what.added.id;
  else delete labels[what.deleted.id];
  try {
    store?.setItem(key, JSON.stringify({ at: snap.at, labels }));
  } catch {
    /* storage refused */
  }
}

/** "just now", "5 min ago", "2 h ago", "3 d ago". */
export function ago(at: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
