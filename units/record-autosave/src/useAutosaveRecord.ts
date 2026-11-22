// Saves the fields of one record as the person types. The screen holds no Save and no Cancel and has no Edit mode: a field is a box you type in,
// and what you typed reaches the vault by itself.
//
// This is NOT a Save button. GilbPlatform apps have none (Kai, 2026-11-22): the save is made automatic and reliable, not manual.
//
// It is the record-wide form of contact-annotation's `useAnnotationDraft`, with the same nets: a quiet-typing delay while typing, a write at blur,
// and a flush with `keepalive` when the page is hidden or the screen is left. It differs in two ways: it holds every field of the record (one
// write carries all the fields changed, and only those), and the transport is a function the caller passes in (`write`).
//
// What it keeps from that machine:
// - The delay is 400 ms. Each save is a real write to the vault (a new version), so writing at every keystroke would store a revision per letter.
// - Blur writes at once. Page hide, a tab going to the background, and unmount write with `keepalive` (best effort: the browser may still drop a
//   request when the page is torn down, which is why the delay is the main net).
// - Nothing is ever written while `stored` is null (the vault has not been read, or the read failed). Writing into what was not read can only destroy.
//   While the record is not read, the fields cannot be typed in: `set()` does nothing and `text(name).readOnly` is true.
// - A write for the same fields is not sent twice at once. A reload fires both `pagehide` and `visibilitychange`; that is one request, not two.
// - At most one write is in flight for the record. A change made meanwhile is written when the first has answered. The one exception is a page
//   that is going away: then the newer fields are sent at once with `keepalive`, because there will be no later.
// - `stored` may be a new object on every render. Only a change of its VALUES is a new read. A write that landed is remembered until the vault's
//   own value has caught up, so a read that is older than the write never puts the old text back.
// - What the person typed always shows on screen until it is written. When the vault turns read-only, unsaved edits are dropped.
// - A refused write releases its in-flight marker, so it stays retryable (by `retry()` or by the next keystroke); the edits are kept.
// - The page listeners are registered once and read the latest values through refs. A listener removed and added again during the render in which
//   the person reloads is a listener that was not there.
// - Nothing sets state after the screen is gone; `onSaved` is still called, because the parent most needs the landed value then.
// - There is no local draft store. The vault is the data of record: the write comes sooner, a draft is never kept on the device.

import { useCallback, useEffect, useReducer, useRef } from "react";
import { sameValue } from "./sameValue";

/** Quiet-typing delay before the changed fields are written, in ms. */
export const AUTOSAVE_DELAY_MS = 400;

export type AutosaveState = "idle" | "pending" | "saving" | "saved" | "invalid" | "error";
export type FieldValues = Record<string, unknown>;

export interface UseAutosaveRecordOptions<F extends FieldValues> {
  /** What the vault holds now. null = not read yet, or the read failed: then NOTHING is ever written. */
  stored: F | null;
  /** Writes only the changed fields. Throws on failure (its Error message is shown to the person). */
  write: (changed: Partial<F>, how: { keepalive: boolean }) => Promise<void>;
  /** A sentence saying why this value may not be written, or null when it may. */
  check?: (name: keyof F & string, value: F[keyof F], all: F) => string | null;
  /** Quiet-typing delay. Default AUTOSAVE_DELAY_MS. */
  delayMs?: number;
  /** View-only vault: set() does nothing and nothing is written. */
  readOnly?: boolean;
  /** Called with the fields each time a write LANDS. Never on a failed or scheduled write. */
  onSaved?: (written: Partial<F>) => void;
}

export interface UseAutosaveRecord<F extends FieldValues> {
  /** What the screen shows: stored, with the person's unsaved edits on top. {} as F while stored is null. */
  values: F;
  /** Wire to onChange. Schedules the write after delayMs of quiet. */
  set: <K extends keyof F>(name: K, value: F[K]) => void;
  /** Wire to onBlur. Writes now. */
  flush: () => Promise<void>;
  /** Props for a text <input>/<textarea> bound to one string field: value, onChange, onBlur, readOnly, aria-invalid. */
  text: (name: keyof F & string) => {
    value: string;
    onChange: (e: { target: { value: string } }) => void;
    onBlur: () => void;
    readOnly: boolean;
    "aria-invalid": boolean;
  };
  state: AutosaveState;
  /** The failed write's own message, verbatim. null otherwise. */
  error: string | null;
  /** Per-field sentences from check(). */
  problems: Partial<Record<keyof F, string>>;
  /** Writes the unsaved changes again (wire to "Try again"). */
  retry: () => Promise<void>;
}

type Bag = Record<string, unknown>;

export function useAutosaveRecord<F extends FieldValues>(options: UseAutosaveRecordOptions<F>): UseAutosaveRecord<F> {
  const { stored, readOnly = false } = options;
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  /** What the vault is known to hold. Only ever assigned from `stored` or from a write that landed. */
  const known = useRef<Bag | null>(stored);
  /** The last `stored` VALUE seen (never null once there was one): a new object with the same values is not a re-read. */
  const lastStored = useRef<F | null>(stored);
  /**
   * Per field, the values written (and landed) since the vault's own value was last seen to match, oldest first. A read older than the latest
   * write must not undo it, and a read that shows an earlier written value is stale, not another writer's.
   */
  const landed = useRef<Record<string, unknown[]>>({});
  /** Every write has a number; per field, the number of the latest write sent for it. An older write that answers late never overwrites a newer one. */
  const seqCounter = useRef(0);
  const latestSeq = useRef<Record<string, number>>({});
  /** A re-read changed what is unsaved: after this render the state and the timer are worked out again. */
  const rereadPending = useRef(false);
  /** What the person typed that is not yet known to be in the vault. */
  const edits = useRef<Bag>({});
  const problemsRef = useRef<Bag>({});
  const stateRef = useRef<AutosaveState>("idle");
  const errorRef = useRef<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Never set state after unmount: the page-hide flush deliberately outlives the tree. */
  const mounted = useRef(true);
  /** The fields a write is carrying now, or null. */
  const inFlight = useRef<Bag | null>(null);
  /** The payloads of every write on the way: the normal one and any sent while the page leaves. A payload already on the way is not sent again. */
  const sent = useRef<Bag[]>([]);
  /** A change came in while a write was in flight: write again when it answers. */
  const again = useRef(false);
  const wasReadOnly = useRef(readOnly);

  // The caller may pass inline arrows: they are read through refs so the page listeners are registered once.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const dropSettled = () => {
    const k = known.current ?? {};
    for (const name of Object.keys(edits.current)) {
      if (sameValue(edits.current[name], k[name])) {
        delete edits.current[name];
        delete problemsRef.current[name];
      }
    }
  };

  // The vault turned read-only: the person may no longer change anything, so what they had typed and not saved is dropped.
  if (readOnly && !wasReadOnly.current) {
    clearTimer();
    edits.current = {};
    problemsRef.current = {};
    again.current = false;
    stateRef.current = "idle";
    errorRef.current = null;
  }
  wasReadOnly.current = readOnly;

  // A re-read. `stored` null means the vault is not read. A new object with the same values is NOT a re-read (a caller may build `stored`
  // inline on every render). On a real change: a field whose write landed is kept until the vault shows it (it caught up), or shows something
  // else than before (someone else changed it after us: theirs wins), so a stale read never puts the old text back.
  if (stored === null) {
    if (known.current !== null) rereadPending.current = true;
    known.current = null;
  } else if (known.current === null || !sameValue(stored, lastStored.current)) {
    const before = lastStored.current as Bag | null;
    const latest: Bag = {};
    for (const f of Object.keys(landed.current)) {
      const list = landed.current[f]!;
      const shown = (stored as Bag)[f];
      if (sameValue(shown, list[list.length - 1])) delete landed.current[f]; // the vault caught up
      else if (list.some((v) => sameValue(shown, v)) || sameValue(shown, before?.[f])) latest[f] = list[list.length - 1]; // a stale read
      else delete landed.current[f]; // someone else changed it: theirs wins
    }
    known.current = { ...stored, ...latest };
    lastStored.current = stored;
    dropSettled();
    rereadPending.current = true;
  }

  const setState = (s: AutosaveState, err: string | null = null) => {
    stateRef.current = s;
    errorRef.current = err;
    rerender();
  };

  const dirty = (): string[] => {
    const k = known.current ?? {};
    return Object.keys(edits.current).filter((name) => !sameValue(edits.current[name], k[name]));
  };

  const schedule = () => {
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      void writeNowRef.current(false);
    }, optionsRef.current.delayMs ?? AUTOSAVE_DELAY_MS);
  };

  /** The state from what is unsaved: a field with a problem is `invalid`, else unsaved fields are `pending`, else `saved` (after a landing) or `idle`. */
  const refreshState = (afterLanding: boolean) => {
    const d = dirty();
    const hasProblem = d.some((n) => n in problemsRef.current);
    const hasValid = d.some((n) => !(n in problemsRef.current));
    if (hasValid) schedule();
    else clearTimer();
    setState(hasProblem ? "invalid" : hasValid ? "pending" : afterLanding ? "saved" : "idle");
  };

  /**
   * After a re-read what is unsaved may be different (the vault caught up with an edit, or went away and came back), so the state and the timer
   * are worked out again. Nothing unsaved: `idle` (a `saved` stays; so does `saving`); an `error` with nothing left unsaved also ends, because the
   * value is in the vault. A field with a problem: `invalid`. Something valid unsaved: `pending` and the timer, except that an `error` stays, so the
   * person sees it failed (Try again, or typing, writes).
   */
  const settleAfterRead = () => {
    if (known.current === null) {
      clearTimer(); // not read: nothing will be written until it is
      return;
    }
    const s = stateRef.current;
    const d = dirty();
    const hasProblem = d.some((n) => n in problemsRef.current);
    const hasValid = d.some((n) => !(n in problemsRef.current));
    if (d.length === 0) {
      clearTimer();
      if (s !== "saved" && s !== "saving" && s !== "idle") setState("idle");
      return;
    }
    if (s === "saving") return;
    if (hasProblem) {
      if (hasValid) schedule();
      else clearTimer();
      setState("invalid");
    } else if (s !== "error") {
      schedule();
      setState("pending");
    }
  };

  const writeNow = useCallback(async (keepalive: boolean): Promise<void> => {
    clearTimer();
    if (optionsRef.current.readOnly) return;
    // Never write into what was not read.
    if (known.current === null) return;
    const changed: Bag = {};
    for (const name of dirty()) if (!(name in problemsRef.current)) changed[name] = edits.current[name];
    if (Object.keys(changed).length === 0) {
      // Nothing to write: no write nobody asked for. A "not saved yet" line with nothing behind it is cleared.
      // Nothing is left unsaved, so an `error` no longer applies either (the value is in the vault).
      const s = stateRef.current;
      if (mounted.current && (s === "pending" || s === "error") && dirty().length === 0 && sent.current.length === 0) setState("idle");
      return;
    }
    // These fields are already on the way (pagehide and visibilitychange both fire on a reload): one request, not two.
    if (sent.current.some((p) => sameValue(p, changed))) return;
    let leaving = false;
    if (inFlight.current !== null) {
      if (!keepalive) {
        again.current = true;
        return;
      }
      // The page is going away with newer fields than the write in flight carries. There will be no later turn, so this is the one case where
      // two writes overlap: the newer fields go out now, with keepalive. `sent` keeps a second pagehide from sending the same fields twice. The
      // vault keeps the one that arrives last; on screen the newer write's value is kept whichever answers first (see `latestSeq`).
      leaving = true;
    } else {
      inFlight.current = changed;
    }
    sent.current.push(changed);
    const mySeq = ++seqCounter.current;
    for (const f of Object.keys(changed)) latestSeq.current[f] = mySeq;
    const done = () => {
      const at = sent.current.indexOf(changed);
      if (at >= 0) sent.current.splice(at, 1);
      if (!leaving) inFlight.current = null;
    };
    if (mounted.current) setState("saving");
    try {
      await optionsRef.current.write(changed as Partial<F>, { keepalive });
    } catch (e) {
      // Released on failure: a refused write must stay retryable. The retry sends everything unsaved, so no write is left waiting.
      done();
      if (!leaving) again.current = false;
      if (mounted.current) setState("error", e instanceof Error ? e.message : String(e));
      return;
    }
    done();
    // Only the fields this write was the latest to be sent for are taken: an older write answering late never overwrites a newer value.
    const mine: Bag = {};
    for (const f of Object.keys(changed)) if (latestSeq.current[f] === mySeq) mine[f] = changed[f];
    if (known.current !== null) known.current = { ...known.current, ...mine };
    for (const f of Object.keys(mine)) (landed.current[f] ??= []).push(mine[f]);
    dropSettled();
    // Fires even when the screen is gone: the page-hide flush is when the parent most needs the landed fields.
    optionsRef.current.onSaved?.(changed as Partial<F>);
    if (mounted.current) refreshState(true);
    if (!leaving && again.current) {
      again.current = false;
      // After unmount this is the last chance to write, so it asks for keepalive.
      void writeNow(!mounted.current);
    }
  }, []);
  const writeNowRef = useRef(writeNow);
  writeNowRef.current = writeNow;

  useEffect(() => {
    mounted.current = true;
    const onHide = () => void writeNowRef.current(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void writeNowRef.current(true);
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      // `mounted` goes false BEFORE the flush: the flush is fire-and-forget and its answer must not reach setState.
      mounted.current = false;
      void writeNowRef.current(true);
      clearTimer();
    };
  }, []);

  // No dependency list: it runs after every render and acts only when a re-read happened in that render (no setState while rendering).
  useEffect(() => {
    if (!rereadPending.current) return;
    rereadPending.current = false;
    if (mounted.current) settleAfterRead();
  });

  const set = useCallback(<K extends keyof F>(name: K, value: F[K]) => {
    const o = optionsRef.current;
    if (o.readOnly) return;
    // While the record is not read, the fields cannot be typed in.
    if (known.current === null) return;
    edits.current[name as string] = value;
    // Every unsaved field is checked again with the new values, so a rule that looks at other fields stays right.
    const all = { ...known.current, ...edits.current } as F;
    const d = dirty();
    for (const n of Object.keys(edits.current)) {
      const why = d.includes(n) && o.check ? o.check(n as keyof F & string, edits.current[n] as F[keyof F], all) : null;
      if (why === null) delete problemsRef.current[n];
      else problemsRef.current[n] = why;
    }
    if (d.length === 0 && sent.current.length > 0) {
      clearTimer();
      rerender();
      return;
    }
    refreshState(false);
  }, []);

  const flush = useCallback(() => writeNowRef.current(false), []);

  const values = (known.current === null ? {} : { ...known.current, ...edits.current }) as F;

  return {
    values,
    set,
    flush,
    text: (name) => ({
      value: String(values[name] ?? ""),
      onChange: (e) => set(name, e.target.value as F[typeof name]),
      onBlur: () => void flush(),
      readOnly: readOnly || known.current === null,
      "aria-invalid": name in problemsRef.current,
    }),
    state: stateRef.current,
    error: errorRef.current,
    problems: { ...problemsRef.current } as Partial<Record<keyof F, string>>,
    retry: flush,
  };
}
