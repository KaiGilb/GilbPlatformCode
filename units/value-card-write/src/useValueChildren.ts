// A Value's child records kept as a list (levels, qualifier definitions). The Value lines edit a whole list
// (`commit(next)`); this hook turns that into the smallest writes: one item changed = one PATCH of that item's record,
// a new item = one POST, a removed item = one DELETE. The writes themselves are in valueChildRecords.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { aliasLevelKey, levelKey, setLevelKey } from "@kaigilb/gilbplatformcode-value-card-model";
import { useValueWriteHost } from "./host";
import { ChildConflict, createChild, endChild, endMade, migrateChild, MoveStopped, patchChild, rowFor, rowLabel, type ChildEnv, type ChildKind, type ParentRef } from "./valueChildRecords";

export interface ChildListHost<T> {
  /** The items to show: the child records (or, until they are written, the person's latest edit). */
  items: T[];
  /** Write the difference between the shown items and `next`. */
  commit: (next: T[]) => void;
  /** The same, and resolves to false when a write of this commit failed (and was rolled back), true otherwise (a rename helper). */
  commitAndWait?: (next: T[]) => Promise<boolean>;
  /** Create records for the old items (a move). Returns what undoes it. Nothing runs until this is called. */
  moveIn: (old: readonly T[]) => Promise<{ undo: () => Promise<string[]> }>;
  /** True while a write is queued or running. */
  busy: boolean;
  /** While a group write (a row moved) runs: how many of its levels are written so far. Null otherwise. */
  progress?: { done: number; total: number } | null;
}

export function useChildList<T extends object>(args: {
  enabled: boolean;
  record: BaseRecord;
  vaultId: string;
  planVault: string;
  /** The Value's `a:partOf` find rows (all part types; this list's records are picked out by `read`). */
  rows: readonly BaseRecord[];
  read: (rows: readonly BaseRecord[], parentUri?: string | null) => T[];
  /** The kind, built fresh each render so it sees the latest Value tag and qualifier order. */
  kind: ChildKind<T>;
  /** An item with nothing in it is not written until it has something. */
  isBlank?: (item: T) => boolean;
  onNotice: (notice: string | null) => void;
  /** Called after a record was ended (Version moves). */
  onTouched?: () => void;
}): ChildListHost<T> {
  const { enabled, record, vaultId, planVault, rows, onNotice } = args;
  const host = useValueWriteHost();
  const del = host.useDeleteRecord(vaultId);
  const fromRows = useMemo(() => (enabled ? args.read(rows, record.entityUri ?? null) : []), [enabled, rows, record.entityUri]); // eslint-disable-line react-hooks/exhaustive-deps
  const [override, setOverride] = useState<T[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const items = override ?? fromRows;
  const shown = useRef(items);
  shown.current = items;
  const ctx = useRef({ ...args, host });
  ctx.current = { ...args, host };
  const queue = useRef(Promise.resolve());
  const failures = useRef(0);
  const busy = useRef(0);
  const seq = useRef(0);
  const latest = useRef(new Map<string, T>());
  const recs = useRef(new Map<string, BaseRecord>());

  const env = (): ChildEnv => ({ host, planVault, del, recs: recs.current, touched: () => ctx.current.onTouched?.(), notice: (text) => ctx.current.onNotice(text) });
  const parent = (): ParentRef => {
    const uri = record.entityUri;
    if (!uri) throw new Error(`This Value has no address yet, so a ${args.kind.noun} cannot be added.`);
    return { id: record.id, uri };
  };

  /** The entity addresses of the records behind `keys` (what a failed write needs re-read; absent = unknown = all). */
  const membersOf = (keys: readonly string[]): string[] | undefined => {
    const uris: string[] = [];
    for (const k of keys) {
      const uri = rowFor(env(), record.id, k)?.entityUri;
      if (!uri) return undefined;
      uris.push(uri);
    }
    return uris;
  };

  /** `keys`: the records this job writes, so a failure re-reads those and not the whole Value. */
  function run(job: () => Promise<void>, keys?: readonly string[]) {
    busy.current += 1;
    queue.current = queue.current
      .then(job)
      .catch((e: unknown) => {
        failures.current += 1;
        onNotice(
          e instanceof Error && e.message ? e.message : `Couldn't save the ${ctx.current.kind.noun}. Your change was rolled back. Try again.`,
        );
        // A conflict was already re-read (for its own record) before its sentence was said: not again.
        if (e instanceof ChildConflict) return;
        const members = keys ? membersOf(keys) : undefined;
        void host.invalidatePlanFind(planVault, "a:partOf", record.id, members ? { members } : undefined).catch(() => {});
      })
      .then(() => {
        busy.current -= 1;
        if (busy.current === 0) setOverride(null);
      });
  }

  /**
   * Several patches from one edit, in order. If one fails, the later ones are not sent and the ones already written are patched
   * back to how they were. The notice says what happened; if a patch back also fails, it names the levels that moved and those that did not.
   */
  function runGroup(group: { key: string; prev: T; next: T }[]) {
    run(async () => {
      const label = (key: string) => {
        const row = rowFor(env(), record.id, key);
        return row ? rowLabel(row) : key;
      };
      const labels = new Map(group.map((g) => [g.key, label(g.key)]));
      const done: typeof group = [];
      let failure: unknown = null;
      setProgress({ done: 0, total: group.length });
      try {
        for (const g of group) {
          try {
            await write(g.key, g.next);
            done.push(g);
            setProgress({ done: done.length, total: group.length });
          } catch (e) {
            failure = e;
            break;
          }
        }
        if (failure === null) return;
        failures.current += 1;
        const stuck: typeof group = [];
        // A level the person edited again while the group ran holds a newer value (not the group's own): that value is kept.
        const kept = group.filter((g) => latest.current.get(g.key) !== g.next);
        for (const g of group) if (!kept.includes(g)) latest.current.set(g.key, g.prev);
        for (const g of done.slice().reverse()) {
          if (kept.includes(g)) continue;
          try {
            await write(g.key, g.prev);
          } catch {
            stuck.push(g);
          }
        }
        const noun = ctx.current.kind.noun;
        const why = failure instanceof Error && failure.message ? failure.message : `Couldn't save the ${noun}s.`;
        const names = (list: typeof group) => list.map((g) => labels.get(g.key)).join(", ");
        const notMoved = group.filter((g) => !stuck.includes(g) && !kept.includes(g));
        const keptNote = kept.length ? ` Your newer edit of ${names(kept)} was kept.` : "";
        ctx.current.onNotice(
          stuck.length
            ? `${why} Only some ${noun}s moved. Moved and could not be put back: ${names(stuck)}. Not moved: ${names(notMoved)}.${keptNote}`
            : `${why} None of the ${group.length} ${noun}s moved; they are back as they were.${keptNote}`,
        );
        // Only this group's own records are read again, unless a conflict already did that.
        if (!(failure instanceof ChildConflict)) {
          const members = membersOf(group.map((g) => g.key));
          void host.invalidatePlanFind(planVault, "a:partOf", record.id, members ? { members } : undefined).catch(() => {});
        }
      } finally {
        setProgress(null);
      }
    }, group.map((g) => g.key));
  }

  const blank = (item: T) => !!ctx.current.isBlank?.(item);

  /** Write the newest edit of `key`: create it when it has no record and something in it, else patch it. */
  async function write(key: string, fallback: T): Promise<void> {
    const item = latest.current.get(key) ?? fallback;
    const kind = ctx.current.kind;
    const row = rowFor(env(), record.id, key);
    if (!row) {
      if (blank(item)) return;
      const made = await createChild(env(), kind, parent(), key, item);
      if (kind.after) {
        try {
          await kind.after(env(), made, item, parent(), { created: true });
        } catch (e) {
          // The records of the part failed: the record just made is ended again, so nothing is left half made.
          await endMade(env(), record.id, made);
          recs.current.delete(key);
          throw e;
        }
      }
      // The new item's key now names its record (a held popover or drag finds it again).
      aliasLevelKey(key, made.id);
      return;
    }
    // A record of an older shape is replaced (new record, then the old one ends) in one group with a rollback.
    if (kind.isOld?.(row, parent().uri)) {
      const made = await migrateChild(env(), kind, parent(), key, item, row);
      aliasLevelKey(key, made.id);
      return;
    }
    await patchChild(env(), kind, parent(), key, item);
    if (kind.after) await kind.after(env(), rowFor(env(), record.id, key) ?? row, item, parent(), { created: false });
  }

  function commit(next: T[]): Promise<boolean> {
    const failedBefore = failures.current;
    const kind = ctx.current.kind;
    const before = shown.current;
    const prevByKey = new Map<string, T>();
    for (const l of before) {
      const k = levelKey(l);
      if (k) prevByKey.set(k, l);
    }
    const kept = new Set<string>();
    // Plain patches of existing items: when a commit changes several (a qualifier move of a whole row), they are written as ONE
    // group that is rolled back if any of them fails.
    const patches: { key: string; prev: T; next: T }[] = [];
    const out = next.map((l) => {
      // An item made by an edit that dropped its key (a copy button) is a new item.
      if (!levelKey(l)) setLevelKey(l, `new:${++seq.current}`);
      return l;
    });
    for (const l of out) {
      const key = levelKey(l)!;
      kept.add(key);
      const prev = prevByKey.get(key);
      latest.current.set(key, l);
      if (!prev) {
        run(() => write(key, l), [key]);
        continue;
      }
      if (prev === l) continue;
      if (kind.typeName(prev) !== kind.typeName(l) && rowFor(env(), record.id, key)) {
        // An item's kind is its record type: the new kind is a new record, then the old one ends.
        const fresh = `new:${++seq.current}`;
        setLevelKey(l, fresh);
        latest.current.set(fresh, l);
        kept.add(fresh);
        run(async () => {
          await createChild(env(), kind, parent(), fresh, latest.current.get(fresh) ?? l);
          await endChild(env(), parent(), key);
        });
        continue;
      }
      patches.push({ key, prev, next: l });
    }
    if (patches.length === 1) run(() => write(patches[0]!.key, patches[0]!.next), [patches[0]!.key]);
    else if (patches.length > 1) runGroup(patches);
    for (const [key] of prevByKey) {
      if (kept.has(key)) continue;
      run(async () => {
        const row = rowFor(env(), record.id, key);
        if (row) await kind.beforeEnd?.(env(), row);
        await endChild(env(), parent(), key);
      });
    }
    setOverride(out);
    shown.current = out;
    return queue.current.then(() => failures.current === failedBefore);
  }

  async function moveIn(old: readonly T[]): Promise<{ undo: () => Promise<string[]> }> {
    await queue.current;
    const made: BaseRecord[] = [];
    const undo = async () => {
      const left: BaseRecord[] = [];
      for (const row of made.slice().reverse()) {
        let childrenGone = true;
        try {
          await ctx.current.kind.beforeEnd?.(env(), row, { fresh: true });
        } catch {
          childrenGone = false;
        }
        if (!childrenGone || !(await endMade(env(), record.id, row))) left.push(row);
      }
      made.length = 0;
      made.push(...left.reverse());
      return left.map(rowLabel);
    };
    try {
      for (const item of old) {
        const key = `new:${++seq.current}`;
        setLevelKey(item, key);
        const row = await createChild(env(), ctx.current.kind, parent(), key, item);
        made.push(row);
        await ctx.current.kind.after?.(env(), row, item, parent(), { created: true });
      }
    } catch (e) {
      throw new MoveStopped(e, undo);
    }
    return { undo };
  }

  useEffect(() => {
    // A different Value: forget the keys of the last one.
    latest.current.clear();
    recs.current.clear();
    setOverride(null);
  }, [record.id]);

  return { items, commit: (next: T[]) => void commit(next), commitAndWait: commit, moveIn, busy: override !== null, progress };
}
