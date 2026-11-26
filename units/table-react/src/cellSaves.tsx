/**
 * The saves of a table's cells: one save-as-you-type machine for each cell the person has edited, each writing its one field when the
 * edit is finished, and what each cell should show meanwhile (saving, saved, failed, changed by someone else).
 *
 * The machine is the code library's record autosave (`useAutosaveRecord`, `saveOn: "commit"`), one per edited cell, so a cell's write
 * carries that one field: it sends a value once, keeps what was typed when a write is refused, sends it again on Retry and when the
 * page is hidden or left, and never writes into a record that is not read. This file adds only what a table needs on top: what the
 * edit started from (so a host can refuse to overwrite a change the person never saw), the conflict choice, and a view for the cell.
 * Nothing is kept on the device: every value here is in memory and is gone with the page.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAutosaveRecord } from "@kaigilb/gilbplatformcode-record-autosave";
import { problemOf, type CellProblem, type CellValue, type EditPlan } from "@kaigilb/gilbplatformcode-table-core";

/** One cell write, as the host is asked to make it. */
export interface CellWriteRequest {
  rowId: string;
  columnId: string;
  /** The cell's edit plan: its write key, its label, its editor. */
  plan: EditPlan;
  /** The value to store, or `null` to remove the fact. */
  value: CellValue | null;
  /**
   * What the field held when the person started this edit (or, after "Keep mine", what they were shown that someone else had stored).
   * The host writes only over this value: when the field holds anything else, it must ask (see {@link CellWriteError}).
   */
  base: CellValue | null;
}

/**
 * Writes one cell and resolves when the vault has confirmed it (or already holds the value). It rejects with a {@link CellWriteError}:
 * a conflict when the field no longer holds `base` and does not hold `value`, else the problem.
 */
export type CellWrite = (request: CellWriteRequest) => Promise<void>;

/** Why a cell write did not land. */
export class CellWriteError extends Error {
  /** What the failure means for the cell; null for a conflict. */
  readonly problem: CellProblem | null;
  /** For a conflict: what the field holds now (`null`: nothing). `undefined` when this is not a conflict. */
  readonly theirs: CellValue | null | undefined;
  constructor(what: { problem: CellProblem } | { theirs: CellValue | null }) {
    super("problem" in what ? what.problem.message : "Changed by someone else");
    this.name = "CellWriteError";
    this.problem = "problem" in what ? what.problem : null;
    this.theirs = "theirs" in what ? what.theirs : undefined;
  }
}

/** What a cell with a save under way, or one that did not land, shows. A cell with no entry shows what the vault holds. */
export type CellSaveView =
  /** Sent, not yet confirmed: the typed value shows. */
  | { phase: "saving"; value: CellValue | null }
  /** The vault confirmed it. */
  | { phase: "saved" }
  /** Not saved: the typed value stays, with the reason. `retry`: sending it again can help. */
  | { phase: "failed"; value: CellValue | null; message: string; retry: boolean }
  /** Someone else changed the field: `value` is the person's, `theirs` what the vault holds. */
  | { phase: "conflict"; value: CellValue | null; theirs: CellValue | null }
  /** Nothing is unsaved; the cell has something to say (a change that was dropped, a refusal that put the stored value back). */
  | { phase: "note"; message: string };

/** The key of one cell among a table's saves. */
export const cellKey = (rowId: string, columnId: string): string => `${rowId}\u0000${columnId}`;

interface SaverHandle {
  /** `base` undefined: the edit goes on from the base the saver already holds (a second try after a failure). */
  commit(value: CellValue | null, base: CellValue | null | undefined): void;
  retry(): void;
  keepMine(): void;
  useTheirs(): void;
  drop(note: string | null): void;
}

type Extra = { kind: "conflict"; theirs: CellValue | null } | { kind: "problem"; problem: CellProblem } | { kind: "note"; text: string } | null;

interface SaverProps {
  id: string;
  rowId: string;
  columnId: string;
  plan: EditPlan;
  /** What the vault holds in this cell now. */
  stored: CellValue | null;
  /** False while the cell's record is not on screen or its value is not one plain value: nothing is written then. */
  readable: boolean;
  locale: string;
  write: CellWrite;
  onView: (id: string, view: CellSaveView | null) => void;
  onHandle: (id: string, handle: SaverHandle | null) => void;
}

/** One cell's save machine. It draws nothing. */
function CellSaver({ id, rowId, columnId, plan, stored, readable, locale, write, onView, onHandle }: SaverProps) {
  const base = useRef<CellValue | null>(stored);
  const [extra, setExtra] = useState<Extra>(null);
  const storedRef = useRef(stored);
  storedRef.current = stored;
  const callRef = useRef({ write, rowId, columnId, plan, locale });
  callRef.current = { write, rowId, columnId, plan, locale };

  const r = useAutosaveRecord<{ v: CellValue | null }>({
    stored: readable ? { v: stored } : null,
    saveOn: "commit",
    write: async (changed) => {
      const now = callRef.current;
      const value = (changed.v ?? null) as CellValue | null;
      try {
        await now.write({ rowId: now.rowId, columnId: now.columnId, plan: now.plan, value, base: base.current });
        setExtra(null);
      } catch (e) {
        if (e instanceof CellWriteError && e.theirs !== undefined) setExtra({ kind: "conflict", theirs: e.theirs });
        else if (e instanceof CellWriteError && e.problem) setExtra({ kind: "problem", problem: e.problem });
        // Anything else thrown is a write that got no answer the host could read: not saved, and it can be tried again.
        else setExtra({ kind: "problem", problem: problemOf({ kind: "network", message: e instanceof Error ? e.message : String(e) }, { label: now.plan.label, typed: value, locale: now.locale }) });
        throw e;
      }
    },
  });
  const api = useRef(r);
  api.current = r;

  // A refusal that leaves nothing to try again with the same value (the field is required, the record is read-only or gone): the cell
  // goes back to what the vault holds, and says why.
  useEffect(() => {
    if (extra?.kind !== "problem" || extra.problem.keepsTyped || r.state !== "error") return;
    api.current.set("v", storedRef.current);
    setExtra({ kind: "note", text: extra.problem.message });
  }, [extra, r.state]);

  useEffect(() => {
    onHandle(id, {
      commit(value, from) {
        if (from !== undefined) base.current = from;
        setExtra(null);
        api.current.set("v", value);
        void api.current.flush();
      },
      retry() {
        void api.current.retry();
      },
      keepMine() {
        // The person was shown what someone else stored, and chose their own value over it: that shown value is now what the write
        // may replace. If the field has changed again since, the host asks again.
        setExtra((now) => {
          if (now?.kind === "conflict") base.current = now.theirs;
          return null;
        });
        void api.current.retry();
      },
      useTheirs() {
        api.current.set("v", storedRef.current);
        setExtra(null);
      },
      drop(note) {
        api.current.set("v", storedRef.current);
        setExtra(note === null ? null : { kind: "note", text: note });
      },
    });
    return () => onHandle(id, null);
  }, [id, onHandle]);

  const typed = (r.values.v ?? null) as CellValue | null;
  let view: CellSaveView | null = null;
  if (r.state === "error" && extra?.kind === "conflict") view = { phase: "conflict", value: typed, theirs: extra.theirs };
  else if (r.state === "error") view = { phase: "failed", value: typed, message: extra?.kind === "problem" ? extra.problem.message : `Not saved: ${r.error ?? "the write failed"}`, retry: extra?.kind === "problem" ? extra.problem.retry : true };
  else if (r.state === "saving" || r.state === "pending") view = { phase: "saving", value: typed };
  else if (r.state === "saved") view = { phase: "saved" };
  else if (extra?.kind === "note") view = { phase: "note", message: extra.text };
  const viewKey = JSON.stringify(view);
  useEffect(() => {
    onView(id, viewKey === "null" ? null : (JSON.parse(viewKey) as CellSaveView));
  }, [id, viewKey, onView]);
  useEffect(() => () => onView(id, null), [id, onView]);
  return null;
}

/** One finished edit of a cell, as a host that owns the saves takes it (see {@link HostCellSaves}). */
export interface CellCommit {
  rowId: string;
  columnId: string;
  plan: EditPlan;
  /** The value the person gave, or `null` to remove the fact. */
  value: CellValue | null;
  /** What the cell showed as stored when the edit started; `undefined` after a save of the cell that did not land (its base stands). */
  base: CellValue | null | undefined;
}

/**
 * The saves of a table whose host owns them (since 0.4.0): the host holds every value after it is committed, decides every send, and
 * says what each cell shows. The table then keeps no copy of a value once it is committed: only the text of the box being typed in is
 * the table's, and it is handed to `commit` when the edit is finished. Retry, "Try again", "Keep mine", "Use theirs" and "Change
 * dropped" are the host's acts, and a cell's clash choice is shown only while the host's view of it is a conflict.
 */
export interface HostCellSaves {
  /** What each cell with something unsaved or something to say shows, by {@link cellKey}. A cell with no entry shows what the vault holds. */
  views: ReadonlyMap<string, CellSaveView>;
  /** A finished edit: the value really changed from what the cell showed. */
  commit(edit: CellCommit): void;
  /** The cell's Retry. */
  retry(rowId: string, columnId: string): void;
  /** "Try again" under the table: every cell that can be tried again. */
  retryAll(): void;
  /** After a conflict: the person keeps their value. */
  keepMine(rowId: string, columnId: string): void;
  /** After a conflict: the person takes what the vault holds. */
  useTheirs(rowId: string, columnId: string): void;
  /** The person gave the cell's unsaved change up (Escape on a cell not saved). */
  drop(rowId: string, columnId: string): void;
}

/** A host's saves in the shape the table draws from: no machine, no state of the table's own. */
export function hostCellSaves(host: HostCellSaves): CellSaves {
  const split = (key: string): [string, string] => {
    const at = key.indexOf("\u0000");
    return [key.slice(0, at), key.slice(at + 1)];
  };
  return {
    views: host.views,
    commit: (rowId, columnId, plan, value, base) => host.commit({ rowId, columnId, plan, value, base }),
    retry: (key) => host.retry(...split(key)),
    retryAll: () => host.retryAll(),
    keepMine: (key) => host.keepMine(...split(key)),
    useTheirs: (key) => host.useTheirs(...split(key)),
    drop: (key) => host.drop(...split(key)),
    machines: null,
  };
}

/** What the table's cells are saved through. */
export interface CellSaves {
  /** What each cell with a save under way or not landed shows, by {@link cellKey}. */
  views: ReadonlyMap<string, CellSaveView>;
  /**
   * Finish an edit of one cell: the value is shown at once and written. `base` is what the field held when the edit started;
   * `undefined` goes on from the base of the edit that did not land.
   */
  commit(rowId: string, columnId: string, plan: EditPlan, value: CellValue | null, base: CellValue | null | undefined): void;
  /** Send a value that was not saved again. */
  retry(key: string): void;
  /** Send every value that was not saved and can be tried again. */
  retryAll(): void;
  /** After a conflict: write the person's value over the one they were shown. */
  keepMine(key: string): void;
  /** After a conflict: take what the vault holds. */
  useTheirs(key: string): void;
  /** Give an unsaved value up: the cell shows what the vault holds, and `note` (for example "Change dropped"). */
  drop(key: string, note: string | null): void;
  /** The save machines, to be placed once anywhere in the table's tree. They draw nothing. */
  machines: ReactNode;
}

/**
 * The saves of a table's cells.
 *
 * While any cell is being saved or was not saved, the browser asks before the page is left (`beforeunload`).
 *
 * @param options `write`: the host's cell write (absent: nothing can be saved, and `commit` does nothing); `storedOf`: what the vault
 *   holds in a cell now, and whether that is one plain value of a record on screen; `locale`: for the sentences of a failure
 */
export function useCellSaves(options: { write: CellWrite | undefined; storedOf: (rowId: string, columnId: string) => { readable: boolean; value: CellValue | null }; locale: string }): CellSaves {
  const { write, storedOf, locale } = options;
  const [live, setLive] = useState<ReadonlyMap<string, { rowId: string; columnId: string; plan: EditPlan }>>(new Map());
  const [views, setViews] = useState<ReadonlyMap<string, CellSaveView>>(new Map());
  const handles = useRef(new Map<string, SaverHandle>());
  /** A commit made before its cell's machine was on the page: it is run as soon as the machine is. */
  const waiting = useRef(new Map<string, { value: CellValue | null; base: CellValue | null | undefined }>());

  const onHandle = useCallback((id: string, handle: SaverHandle | null) => {
    if (!handle) {
      handles.current.delete(id);
      return;
    }
    handles.current.set(id, handle);
    const first = waiting.current.get(id);
    if (first) {
      waiting.current.delete(id);
      handle.commit(first.value, first.base);
    }
  }, []);
  const onView = useCallback((id: string, view: CellSaveView | null) => {
    setViews((prev) => {
      const had = prev.get(id) ?? null;
      if (JSON.stringify(had) === JSON.stringify(view)) return prev;
      const next = new Map(prev);
      if (view) next.set(id, view);
      else next.delete(id);
      return next;
    });
  }, []);

  // Leaving the page while a cell is being saved, or was not saved, would lose what the person typed without telling them.
  const unsettled = useMemo(() => [...views.values()].some((v) => v.phase === "saving" || v.phase === "failed" || v.phase === "conflict"), [views]);
  useEffect(() => {
    if (!unsettled) return undefined;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers ask only when this is set.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unsettled]);

  const commit = useCallback<CellSaves["commit"]>((rowId, columnId, plan, value, base) => {
    const id = cellKey(rowId, columnId);
    const handle = handles.current.get(id);
    if (handle) {
      handle.commit(value, base);
      return;
    }
    waiting.current.set(id, { value, base });
    setLive((prev) => new Map(prev).set(id, { rowId, columnId, plan }));
  }, []);
  const viewsRef = useRef(views);
  viewsRef.current = views;

  const machines = write
    ? [...live].map(([id, cell]) => {
        const stored = storedOf(cell.rowId, cell.columnId);
        return <CellSaver key={id} id={id} rowId={cell.rowId} columnId={cell.columnId} plan={cell.plan} stored={stored.value} readable={stored.readable} locale={locale} write={write} onView={onView} onHandle={onHandle} />;
      })
    : null;

  return {
    views,
    commit: write ? commit : () => undefined,
    retry: (key) => handles.current.get(key)?.retry(),
    retryAll: () => {
      for (const [key, view] of viewsRef.current) if (view.phase === "failed" && view.retry) handles.current.get(key)?.retry();
    },
    keepMine: (key) => handles.current.get(key)?.keepMine(),
    useTheirs: (key) => handles.current.get(key)?.useTheirs(),
    drop: (key, note) => handles.current.get(key)?.drop(note),
    machines,
  };
}
