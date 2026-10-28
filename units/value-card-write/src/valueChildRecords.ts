// Child records of a Value (levels, qualifier definitions, Meters and Meter lines).
// Each child is its own record, a part of its parent (`a:partOf`), made and changed the way a Description part is:
// one edit = one PATCH of one record, an add = one POST, a remove = one DELETE (then out of the part-of find).
// This file holds the writes; the hooks (useValueLevels, useValueQualifiers, useValueMeters) decide what to write.

import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { asGrid } from "@kaigilb/gilbplatformcode-description-parts-model";
import { rowServedFact } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { recordTag } from "@kaigilb/gilbplatformcode-plan-links-model";
import { levelTagTry, nextOrderOf, VALUE_CHILD_TERMS } from "@kaigilb/gilbplatformcode-value-card-model";
import { applyPatch } from "./applyPatch";
import type { ValueWriteHost } from "./host";
import { planFindRows } from "./planFind";
import { writeSource, type MergePatchValue, type RecordCreateFacts } from "./writeSource";

const MAX_TAG_TRIES = 50;

export function httpStatus(e: unknown): number | undefined {
  if (e && typeof e === "object" && "status" in e && typeof (e as { status: unknown }).status === "number") {
    return (e as { status: number }).status;
  }
  return undefined;
}

/** What one kind of child needs: its type, tag, create facts and the patch against a stored record. */
export interface ChildKind<T extends object> {
  /** Singular noun for messages: "level", "qualifier", "meter". */
  noun: string;
  /** The type name (no `t:`) the item is stored under. */
  typeName: (item: T) => string;
  isType: (typeUri: string) => boolean;
  /** The tag without a collision number. */
  tag: (item: T) => string;
  createFacts: (item: T, tag: string, parentUri: string, order: number) => Record<string, unknown>;
  /** The facts that differ between the stored record and the item (no tag). Empty = nothing to write. */
  patch: (row: BaseRecord, item: T) => Record<string, unknown>;
  /**
   * Runs after the item's record was created or patched (the records that are a part of it, e.g. an option's definition).
   * It undoes what it wrote itself and throws when it fails. `created`: the record is new (nothing is a part of it yet).
   */
  after?: (env: ChildEnv, row: BaseRecord, item: T, parent: ParentRef, opts: { created: boolean }) => Promise<void>;
  /** Runs before the item's record is ended: ends the records that are a part of it. Throws when one cannot be ended. */
  /** `fresh`: the record was made in this session, so its parts are only those in the cache (no read). */
  beforeEnd?: (env: ChildEnv, row: BaseRecord, opts?: { fresh?: boolean }) => Promise<void>;
  /** The stored record is of an older shape; an edit of it makes the new record, then ends this one (see {@link migrateChild}). */
  isOld?: (row: BaseRecord, parentUri: string) => boolean;
  /**
   * A record of the NEW shape that already stands for `item` (same name, a part of the same parent). When the fresh find
   * holds one, someone else migrated first: it is adopted, nothing new is made and nothing is ended.
   */
  twin?: (rows: readonly BaseRecord[], item: T, old: BaseRecord, parentUri: string) => BaseRecord | undefined;
}

export interface ChildEnv {
  host: ValueWriteHost;
  planVault: string;
  del: { mutateAsync: (v: { id: string; entityUri: string | null; ifMatch?: string | null }) => Promise<unknown> };
  /** The record of each child by key (a created one before the find shows it). */
  recs: Map<string, BaseRecord>;
  /** Called when a record was ended (a delete is a change to the card: Version moves). */
  touched?: () => void;
  /** Says a sentence at once (a conflict is told BEFORE the re-read). */
  notice?: (text: string) => void;
}

/**
 * Another person changed the record first (a 412). The find was already re-read, for this record only, so the caller must not
 * re-read it again.
 */
export class ChildConflict extends Error {}

export interface ParentRef {
  id: string;
  uri: string;
}

const slugOf = (term: string) => term.slice(2);

export function findRowsOf(env: ChildEnv, parentId: string): readonly BaseRecord[] {
  return planFindRows(env.host.cachedPlanFind(env.planVault, "a:partOf", parentId));
}

export function rowFor(env: ChildEnv, parentId: string, key: string): BaseRecord | undefined {
  return env.recs.get(key) ?? findRowsOf(env, parentId).find((r) => r.id === key);
}

export async function createChild<T extends object>(
  env: ChildEnv,
  kind: ChildKind<T>,
  parent: ParentRef,
  key: string,
  item: T,
  /** The record's `a:elementOrder` when it must not be the next free one (a migrated record keeps its place). */
  opts: { order?: number } = {},
): Promise<BaseRecord> {
  const { host, planVault } = env;
  const typeUri = host.typeUriForVaultNamespace(kind.typeName(item), planVault);
  const known = [...findRowsOf(env, parent.id), ...env.recs.values()];
  // The find shows at most its cap: when it stopped there, the rows on screen are not all the rows, so the highest order is
  // not among them. The find's own total is the next safest bound.
  const found = host.cachedPlanFind(planVault, "a:partOf", parent.id);
  const order = opts.order ?? Math.max(nextOrderOf(known, kind.isType), found?.capped ? found.total + 1 : 0);
  const base = kind.tag(item);
  for (let n = 1; n <= MAX_TAG_TRIES; n++) {
    const tag = levelTagTry(base, n);
    const facts = kind.createFacts(item, tag, parent.uri, order) as RecordCreateFacts;
    let made: { id: string; etag: string | null };
    try {
      made = await host.createRecord(planVault, typeUri, facts, tag);
    } catch (e) {
      if (httpStatus(e) === 409) continue;
      throw e;
    }
    if (!made.id) throw new Error(`The ${kind.noun} was not created.`);
    const fresh = await host.readRecord(made.id, planVault).catch(() => null);
    const entityUri = fresh?.entityUri;
    await host.rememberRecord({ id: made.id, vaultId: planVault, typeUri, updatedAt: Date.now() });
    host.markFreshlyCreated(made.id);
    const stringFacts: Record<string, string> = {};
    const servedFacts: Record<string, unknown> = {};
    for (const [slug, value] of Object.entries(facts)) {
      servedFacts[slug] = value;
      stringFacts[slug] = typeof value === "string" ? value : typeof value === "number" ? String(value) : JSON.stringify(value);
    }
    const row: GridRecord = {
      id: made.id,
      ...(entityUri ? { entityUri } : {}),
      typeUri,
      facts: stringFacts,
      opaqueFacts: [],
      etag: made.etag,
      updatedAt: Date.now(),
      servedKeys: Object.keys(stringFacts),
      served: { facts: servedFacts, context: undefined, etag: made.etag },
    };
    host.storePlanRow(planVault, row, { insert: true });
    host.invalidatePlanSearch(planVault);
    host.prependPlanFind(planVault, "a:partOf", parent.id, row, {
      members: row.entityUri ? [row.entityUri] : [],
      refresh: false,
    });
    env.recs.set(key, row);
    return row;
  }
  throw new Error(`Could not find a free tag for this ${kind.noun}.`);
}

export async function patchChild<T extends object>(
  env: ChildEnv,
  kind: ChildKind<T>,
  parent: ParentRef,
  key: string,
  item: T,
  /** True: a changed tag alone is a change to write (a Meter line follows its Meter's new name). */
  opts: { retag?: boolean } = {},
): Promise<void> {
  const { host, planVault } = env;
  const row = rowFor(env, parent.id, key);
  if (!row) return;
  let live = host.liveRow(planVault, row.id, row);
  const probe = kind.patch(live, item);
  const retag = !!opts.retag && rowTag(live) !== kind.tag(item);
  if (Object.keys(probe).length === 0 && !retag) return;
  const gate = await host.ensureEtagUnchanged(planVault, live, (fresh) =>
    Object.keys(probe).every((slug) => JSON.stringify(rowServedFact(fresh, slug) ?? null) === JSON.stringify(rowServedFact(live, slug) ?? null)),
  );
  if ("unreadable" in gate) throw new Error(`This ${kind.noun}'s version could not be read, so it was not saved. Reload and try again.`);
  const changed = `This ${kind.noun} changed elsewhere. The card now shows the latest; your change was not saved.`;
  // One conflict = one re-read, of this record only; the sentence is said first.
  const reread = () => host.invalidatePlanFind(planVault, "a:partOf", parent.id, { members: live.entityUri ? [live.entityUri] : [] });
  if ("conflict" in gate) {
    env.notice?.(changed);
    await reread();
    throw new ChildConflict(changed);
  }
  live = gate.row;
  const patch = kind.patch(live, item) as Record<string, MergePatchValue>;
  const retagNow = !!opts.retag && rowTag(live) !== kind.tag(item);
  if (Object.keys(patch).length === 0 && !retagNow) return;
  // The tag is a label built from the facts: rebuilt when they change; a taken tag gets .2, .3 ...
  const wantTag = kind.tag(item);
  const haveTag = rowTag(live);
  let etag: string | null = null;
  let landed = false;
  for (let n = 1; n <= MAX_TAG_TRIES && !landed; n++) {
    const tag = levelTagTry(wantTag, n);
    const send: Record<string, MergePatchValue> = { ...patch };
    if (tag !== haveTag) send[slugOf(VALUE_CHILD_TERMS.tag)] = tag;
    const src = writeSource(live);
    try {
      const res = src.length
        ? await host.patchRecord(live.id, send, live.entityUri ?? null, src[0], { ifMatch: live.etag })
        : await host.patchRecord(live.id, send, live.entityUri ?? null, undefined, { ifMatch: live.etag });
      etag = res.etag;
      Object.assign(patch, send);
      landed = true;
    } catch (e) {
      if (httpStatus(e) === 409 && !host.isConflict(e)) continue;
      if (!host.isConflict(e)) throw e;
      const fresh = await host.reconcileAfterConflict(planVault, live);
      if (fresh) host.patchPlanFindRows(planVault, live.id, () => asGrid(fresh));
      env.notice?.(changed);
      try {
        await reread();
      } catch {
        // The notice already says what happened.
      }
      throw new ChildConflict(changed);
    }
  }
  if (!landed) throw new Error(`Could not find a free tag for this ${kind.noun}.`);
  const stored = { ...applyPatch(live, patch, etag), updatedAt: Date.now() };
  host.storePlanRow(planVault, stored);
  if (stored.entityUri) host.setPlanRecord(stored.id, stored.entityUri, stored);
  host.patchPlanFindRows(planVault, live.id, (current) => ({ ...applyPatch(asGrid(current), patch, etag), updatedAt: Date.now() }));
  env.recs.set(key, stored);
}

const rowTag = (row: BaseRecord) => recordTag(row.facts);

/** End a child the way a Description part is ended: the record delete door, then out of the part-of find. */
export async function endChild(env: ChildEnv, parent: ParentRef, key: string): Promise<void> {
  const row = rowFor(env, parent.id, key);
  if (!row) return;
  await env.del.mutateAsync({ id: row.id, entityUri: row.entityUri ?? null });
  env.host.dropPlanFind(env.planVault, "a:partOf", parent.id, row.id, { members: [], refresh: false });
  env.recs.delete(key);
  env.touched?.();
}

/** End a record that is only known as a row (a child found by `a:partOf` that the card could not read). */
export async function endRow(env: ChildEnv, parentId: string, row: BaseRecord, opts: { ifMatch?: string | null } = {}): Promise<void> {
  await env.del.mutateAsync({ id: row.id, entityUri: row.entityUri ?? null, ...(opts.ifMatch ? { ifMatch: opts.ifMatch } : {}) });
  env.host.dropPlanFind(env.planVault, "a:partOf", parentId, row.id, { members: [], refresh: false });
  for (const [k, r] of env.recs) if (r.id === row.id) env.recs.delete(k);
  env.touched?.();
}

/** The label of a record in a message: its tag, else its id. */
export const rowLabel = (row: BaseRecord) => rowTag(row) || row.id;

/** End a record by id (a rollback of what a failed move made). True when it is gone; false when the delete failed. */
export async function endMade(env: ChildEnv, parentId: string, row: BaseRecord): Promise<boolean> {
  try {
    await env.del.mutateAsync({ id: row.id, entityUri: row.entityUri ?? null });
  } catch {
    return false;
  }
  env.host.dropPlanFind(env.planVault, "a:partOf", parentId, row.id, { members: [], refresh: false });
  return true;
}

/** A move that stopped. `undo` retries removing what it made (only what is still there); it returns the tags still there. */
export class MoveStopped extends Error {
  reason: unknown;
  undo: () => Promise<string[]>;
  constructor(reason: unknown, undo: () => Promise<string[]>) {
    super(reason instanceof Error ? reason.message : "The move stopped.");
    this.reason = reason;
    this.undo = undo;
  }
}

/** The served facts of two reads of one record are the same (key by key). */
function sameServed(a: BaseRecord, b: BaseRecord): boolean {
  const fa = (a.served?.facts ?? {}) as Record<string, unknown>;
  const fb = (b.served?.facts ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  for (const k of keys) if (JSON.stringify(fa[k] ?? null) !== JSON.stringify(fb[k] ?? null)) return false;
  return true;
}

/**
 * An edit of a record of an older shape (a Scale variable typed t:ScaleQualifierDefinition) is ONE group with a rollback:
 * the new record (and what is a part of it) is made first, then the old record is ended. If any step fails, what this made is
 * ended again and the old record is left as it was. The new record keeps the old one's place (`a:elementOrder`).
 *
 * Safe for a second editor.
 *   - The old record is read again before anything is made. Gone (404) or changed since the card read it: nothing is made, the
 *     card is re-read and says "Someone else changed this ...".
 *   - A fresh find of the parent's parts is looked at for a record of the new shape that already stands for the item (someone else
 *     migrated): it is adopted; nothing new is made and nothing is ended.
 *   - The old record is ended with If-Match (the version just read). A 404 (already gone) or 412 is NOT success: the new record
 *     is ended again (rollback) and the same sentence is said.
 */
export async function migrateChild<T extends object>(
  env: ChildEnv,
  kind: ChildKind<T>,
  parent: ParentRef,
  key: string,
  item: T,
  oldRow: BaseRecord,
): Promise<BaseRecord> {
  const changed = `Someone else changed this ${kind.noun}; it is shown as it is now.`;
  const reread = async () => {
    try {
      await env.host.invalidatePlanFind(env.planVault, "a:partOf", parent.id, { members: oldRow.entityUri ? [oldRow.entityUri] : [] });
    } catch {
      // The sentence already says what happened.
    }
  };
  const conflict = async (): Promise<never> => {
    env.notice?.(changed);
    await reread();
    throw new ChildConflict(changed);
  };
  // 1. The old record as it is on the server now.
  let fresh: BaseRecord | null;
  try {
    fresh = await env.host.readRecord(oldRow.id, oldRow.entityUri ?? null);
  } catch {
    throw new Error(`This ${kind.noun}'s version could not be read, so it was not saved. Reload and try again.`);
  }
  if (!fresh) return conflict();
  if (!sameServed(fresh, oldRow)) return conflict();
  const ifMatch = fresh.etag ?? oldRow.etag ?? null;
  // 2. A twin of the new shape, in a fresh find (the cached rows when the find cannot be read).
  if (kind.twin) {
    let rows: readonly BaseRecord[] = findRowsOf(env, parent.id);
    try {
      const found = await env.host.fetchPlanFind(env.planVault, "a:partOf", parent.id, parent.uri, { staleTime: 0 });
      rows = planFindRows(found);
    } catch {
      // Best effort: the old record's own check above is the guard that does not need the find.
    }
    const twin = kind.twin(rows, item, oldRow, parent.uri);
    if (twin) {
      env.recs.set(key, twin);
      return conflict();
    }
  }
  const heldOrder = rowServedFact(oldRow, "elementOrder");
  const order = typeof heldOrder === "number" ? heldOrder : typeof heldOrder === "string" && heldOrder.trim() && Number.isFinite(Number(heldOrder)) ? Number(heldOrder) : undefined;
  const made = await createChild(env, kind, parent, key, item, order === undefined ? {} : { order });
  const back = async (why: unknown, others: boolean): Promise<never> => {
    let left = false;
    try {
      await kind.beforeEnd?.(env, made, { fresh: true });
    } catch {
      left = true;
    }
    if (!left && !(await endMade(env, parent.id, made))) left = true;
    env.recs.delete(key);
    if (others && !left) return conflict();
    const reason = others ? changed : why instanceof Error && why.message ? why.message : `Couldn't save the ${kind.noun}.`;
    throw new Error(
      left
        ? `${reason} The new ${kind.noun} ${rowLabel(made)} could not be removed; the old one is as it was. Remove ${rowLabel(made)} by hand.`
        : `${reason} Nothing was changed; the ${kind.noun} is back as it was.`,
    );
  };
  try {
    await kind.after?.(env, made, item, parent, { created: true });
  } catch (e) {
    return back(e, false);
  }
  try {
    await endRow(env, parent.id, oldRow, { ifMatch });
  } catch (e) {
    // 404: already gone, 412: changed. Someone else got there first.
    return back(e, httpStatus(e) === 404 || env.host.isConflict(e));
  }
  env.touched?.();
  // The old record held the plain tag while the new one was made (a taken tag gets .2): now that it is gone the new one takes the plain tag.
  // Best effort: a refusal here leaves a correct record under a longer tag.
  await patchChild(env, kind, parent, key, item, { retag: true }).catch(() => {});
  return env.recs.get(key) ?? made;
}
