import { useCallback, useEffect, useRef, useState } from "react";

/** Where a problem happened, as the second argument of `onProblem`. */
export type ProblemWhere = { action: "load" } | { action: "add" } | { action: "edit"; id: string } | { action: "delete"; id: string };

export interface RecordListOptions<T, D = Partial<T>, P = Partial<T>> {
  /** Reads the whole list. Called once on mount, and again on `reload()`. */
  list(): Promise<readonly T[]>;
  /** Writes a new record; answers it as the store now holds it (with its real id). */
  create(draft: D): Promise<T>;
  /** Writes a change to a record; answers the record as the store now holds it. Gets the last record the store answered, never an optimistic one. */
  update(item: T, patch: P): Promise<T>;
  /** Deletes a record for good. Called after `undoMs`, or at once from `flushPending()`. */
  remove(item: T): Promise<void>;
  /** The name of the field that holds a record's id (a string, or a value that reads as one). */
  key: keyof T & string;
  /** How long a delete waits for `undo(id)` before `remove` is called. Default 10000. */
  undoMs?: number;
  /** The order of `items`. Omitted: the order `list` gave, new records last. */
  sort?(a: T, b: T): number;
  /** Every failed load, add, edit or delete, with what went wrong. Called after the list is back to what the store holds. */
  onProblem?(err: unknown, where: ProblemWhere): void;
  /** The record to show while an add is being written. Default: the draft with `key` set to the temporary id. */
  optimisticItem?(draft: D, tempId: string): T;
  /** The record to show while an edit is being written. Default: the record with the patch spread over it. */
  optimisticEdit?(item: T, patch: P): T;
  /** Make a waiting delete real when the page is hidden or closed (visibilitychange to hidden, pagehide). Default true. */
  flushOnHide?: boolean;
}

export interface RecordList<T, D = Partial<T>, P = Partial<T>> {
  /** The records to show: an add at once, an edit at once, a waiting delete hidden. */
  items: T[];
  /** True until the first `list` has answered (or failed). */
  loading: boolean;
  /** The last `list` failure, or null. `items` keep what they were. */
  error: unknown;
  /** Shows the record at once under a temporary id, writes it, and swaps in the real record. Answers it, or null when the write failed (rolled back). */
  add(draft: D): Promise<T | null>;
  /** Shows the change at once, writes it, and answers the stored record, or null when it failed (rolled back). Ignored (null) for a record that is not shown, is still being added, or waits for its delete. */
  edit(id: string, patch: P): Promise<T | null>;
  /** Hides the record at once and calls `remove` after `undoMs`, unless `undo(id)`. Several can wait at once, each on its own clock. Ignored for a record that is not shown or is still being added. */
  del(id: string): void;
  /** Brings a waiting delete back. True when there was one. */
  undo(id: string): boolean;
  /** The records whose delete is waiting, oldest first. */
  pending: T[];
  /** Makes every waiting delete real NOW and resolves when all are done (before a sign-out or a vault switch drops the credential). Never rejects. */
  flushPending(): Promise<void>;
  /** Reads the list again. Waiting deletes stay hidden and unsaved adds and edits stay shown. */
  reload(): Promise<void>;
  /** True while a write for this id (a temporary id too) has not been answered. */
  isSaving(id: string): boolean;
}

const TEMP = "saving-";
const isTemp = (id: string): boolean => id.startsWith(TEMP);

interface Waiting<T> {
  item: T;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * A list of records with optimistic add, edit and delete. Nothing in it knows what a record is: you pass the four calls and the name of the id
 * field. No data library is needed; it is React state and refs.
 *
 * - add: shown at once under a temporary id, replaced by the record `create` answers; on failure it vanishes and `onProblem` is told.
 * - edit: shown at once; writes to one record go one after another, each from the last record the store answered; on failure the record is
 *   back to what the store holds and `onProblem` is told.
 * - delete: hidden at once; `remove` is called after `undoMs` unless `undo(id)`. `flushPending()` and unmount (and a hidden page) make waiting
 *   deletes real now. A delete that fails brings the record back and `onProblem` is told.
 */
export function useRecordList<T, D = Partial<T>, P = Partial<T>>(o: RecordListOptions<T, D, P>): RecordList<T, D, P> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<T[]>([]);

  const opts = useRef(o);
  opts.current = o;
  const itemsRef = useRef<T[]>([]);
  const alive = useRef(true);
  const seq = useRef(0);
  const reloadSeq = useRef(0);
  const confirmed = useRef(new Map<string, T>()); // the last record the store answered, by id
  const saving = useRef(new Set<string>()); // ids with a write in flight (temporary ids too)
  const inflight = useRef(new Map<string, number>()); // edits in flight, by id
  const chains = useRef(new Map<string, Promise<void>>()); // one write after another, per id
  const waiting = useRef(new Map<string, Waiting<T>>());

  const idOf = (item: T): string => String(item[opts.current.key]);
  const ordered = (list: T[]): T[] => (opts.current.sort ? [...list].sort(opts.current.sort) : list);
  const put = (list: readonly T[], item: T): T[] => {
    const id = idOf(item);
    const at = list.findIndex((x) => idOf(x) === id);
    return ordered(at < 0 ? [...list, item] : list.map((x, i) => (i === at ? item : x)));
  };
  const without = (list: readonly T[], id: string): T[] => list.filter((x) => idOf(x) !== id);
  const commit = (next: T[]): void => {
    itemsRef.current = next;
    if (alive.current) setItems(next);
  };
  const showWaiting = (): void => {
    if (alive.current) setPending([...waiting.current.values()].map((w) => w.item));
  };
  const problem = (err: unknown, where: ProblemWhere): void => opts.current.onProblem?.(err, where);

  const reload = useCallback(async (): Promise<void> => {
    const mine = ++reloadSeq.current;
    try {
      const fetched = await opts.current.list();
      if (!alive.current || mine !== reloadSeq.current) return;
      const next: T[] = [];
      const seen = new Set<string>();
      for (const f of fetched) {
        const id = idOf(f);
        seen.add(id);
        if (waiting.current.has(id)) continue; // its delete is waiting: stays hidden
        confirmed.current.set(id, f);
        // an edit still in flight keeps what is shown
        next.push((inflight.current.has(id) ? itemsRef.current.find((x) => idOf(x) === id) : undefined) ?? f);
      }
      for (const id of [...confirmed.current.keys()]) if (!seen.has(id) && !saving.current.has(id)) confirmed.current.delete(id);
      for (const x of itemsRef.current) if (isTemp(idOf(x)) && saving.current.has(idOf(x))) next.push(x); // an add still in flight
      commit(ordered(next));
      setError(null);
      setLoading(false);
    } catch (e) {
      if (!alive.current || mine !== reloadSeq.current) return;
      setError(e);
      setLoading(false);
      problem(e, { action: "load" });
    }
  }, []);

  const add = useCallback(async (draft: D): Promise<T | null> => {
    const tempId = `${TEMP}${++seq.current}`;
    const temp = opts.current.optimisticItem ? opts.current.optimisticItem(draft, tempId) : ({ ...draft, [opts.current.key]: tempId } as unknown as T);
    saving.current.add(tempId);
    commit(put(itemsRef.current, temp));
    try {
      const made = await opts.current.create(draft);
      saving.current.delete(tempId);
      confirmed.current.set(idOf(made), made);
      commit(put(without(itemsRef.current, tempId), made));
      return made;
    } catch (e) {
      saving.current.delete(tempId);
      commit(without(itemsRef.current, tempId));
      problem(e, { action: "add" });
      return null;
    }
  }, []);

  const edit = useCallback(async (id: string, patch: P): Promise<T | null> => {
    const shown = itemsRef.current.find((x) => idOf(x) === id);
    if (!shown || isTemp(id) || waiting.current.has(id)) return null;
    if (!confirmed.current.has(id)) confirmed.current.set(id, shown);
    commit(put(itemsRef.current, opts.current.optimisticEdit ? opts.current.optimisticEdit(shown, patch) : ({ ...shown, ...patch } as unknown as T)));
    saving.current.add(id);
    inflight.current.set(id, (inflight.current.get(id) ?? 0) + 1);
    let result: T | null = null;
    const run = (chains.current.get(id) ?? Promise.resolve()).then(async () => {
      try {
        result = await opts.current.update(confirmed.current.get(id) ?? shown, patch);
        confirmed.current.set(id, result);
      } catch (e) {
        problem(e, { action: "edit", id });
      }
    });
    chains.current.set(id, run);
    await run;
    const left = (inflight.current.get(id) ?? 1) - 1;
    if (left > 0) {
      inflight.current.set(id, left);
      return result;
    }
    inflight.current.delete(id);
    saving.current.delete(id);
    if (chains.current.get(id) === run) chains.current.delete(id);
    const settled = confirmed.current.get(id);
    if (settled && !waiting.current.has(id)) commit(put(itemsRef.current, settled)); // the answer, or the rollback to what the store holds
    return result;
  }, []);

  const finish = useCallback(async (id: string): Promise<void> => {
    const w = waiting.current.get(id);
    if (!w) return;
    clearTimeout(w.timer);
    waiting.current.delete(id);
    showWaiting();
    try {
      await (chains.current.get(id) ?? Promise.resolve());
      await opts.current.remove(confirmed.current.get(id) ?? w.item);
      confirmed.current.delete(id);
    } catch (e) {
      commit(put(itemsRef.current, confirmed.current.get(id) ?? w.item));
      problem(e, { action: "delete", id });
    }
  }, []);

  const del = useCallback(
    (id: string): void => {
      const item = itemsRef.current.find((x) => idOf(x) === id);
      if (!item || isTemp(id) || waiting.current.has(id)) return;
      commit(without(itemsRef.current, id));
      waiting.current.set(id, { item, timer: setTimeout(() => void finish(id), opts.current.undoMs ?? 10_000) });
      showWaiting();
    },
    [finish],
  );

  const undo = useCallback((id: string): boolean => {
    const w = waiting.current.get(id);
    if (!w) return false;
    clearTimeout(w.timer);
    waiting.current.delete(id);
    showWaiting();
    commit(put(itemsRef.current, confirmed.current.get(id) ?? w.item));
    return true;
  }, []);

  const flushPending = useCallback(async (): Promise<void> => {
    await Promise.all([...waiting.current.keys()].map((id) => finish(id)));
  }, [finish]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
      void flushPending(); // leaving: a waiting delete is made real now
    };
  }, [reload, flushPending]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const hide = () => {
      if (opts.current.flushOnHide !== false && document.visibilityState === "hidden") void flushPending();
    };
    const gone = () => {
      if (opts.current.flushOnHide !== false) void flushPending();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", gone);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", gone);
    };
  }, [flushPending]);

  const isSaving = useCallback((id: string): boolean => saving.current.has(id), []);
  return { items, loading, error, add, edit, del, undo, pending, flushPending, reload, isSaving };
}
