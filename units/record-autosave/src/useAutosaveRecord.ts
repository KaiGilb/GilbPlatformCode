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
// - At most one write is in flight for the record. A change made meanwhile is written when the first has answered.
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
  const lastStored = useRef<F | null>(stored);
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
  /** A change came in while a write was in flight: write again when it answers. */
  const again = useRef(false);

  // The caller may pass inline arrows: they are read through refs so the page listeners are registered once.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const dropSettled = () => {
    const k = known.current ?? {};
    for (const name of Object.keys(edits.current)) {
      if (sameValue(edits.current[name], k[name])) {
        delete edits.current[name];
        delete problemsRef.current[name];
      }
    }
  };

  // A re-read: what the vault holds is now the new object. Edits equal to it are settled; the others stay.
  if (stored !== lastStored.current) {
    lastStored.current = stored;
    known.current = stored;
    if (stored !== null) dropSettled();
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
  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const writeNow = useCallback(async (keepalive: boolean): Promise<void> => {
    clearTimer();
    // Never write into what was not read.
    if (known.current === null) return;
    const changed: Bag = {};
    for (const name of dirty()) if (!(name in problemsRef.current)) changed[name] = edits.current[name];
    if (Object.keys(changed).length === 0) {
      // Nothing to write: no write nobody asked for. A "not saved yet" line with nothing behind it is cleared.
      if (mounted.current && stateRef.current === "pending" && dirty().length === 0 && inFlight.current === null) setState("idle");
      return;
    }
    if (inFlight.current !== null) {
      // Same fields already on the way (pagehide and visibilitychange both fire on a reload): one request, not two.
      if (sameValue(changed, inFlight.current)) return;
      again.current = true;
      return;
    }
    inFlight.current = changed;
    if (mounted.current) setState("saving");
    try {
      await optionsRef.current.write(changed as Partial<F>, { keepalive });
    } catch (e) {
      // Released on failure: a refused write must stay retryable.
      inFlight.current = null;
      if (mounted.current) setState("error", e instanceof Error ? e.message : String(e));
      return;
    }
    inFlight.current = null;
    known.current = { ...(known.current ?? {}), ...changed };
    dropSettled();
    // Fires even when the screen is gone: the page-hide flush is when the parent most needs the landed fields.
    optionsRef.current.onSaved?.(changed as Partial<F>);
    if (mounted.current) {
      const left = dirty().filter((name) => !(name in problemsRef.current));
      if (left.length > 0) {
        setState("pending");
        clearTimer();
        timer.current = setTimeout(() => {
          timer.current = null;
          void writeNow(false);
        }, optionsRef.current.delayMs ?? AUTOSAVE_DELAY_MS);
      } else {
        setState("saved");
      }
    }
    if (again.current) {
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

  const set = useCallback(<K extends keyof F>(name: K, value: F[K]) => {
    const o = optionsRef.current;
    if (o.readOnly) return;
    // While the record is not read, the fields cannot be typed in.
    if (known.current === null) return;
    const key = name as string;
    edits.current[key] = value;
    const all = { ...(known.current ?? {}), ...edits.current } as F;
    const why = o.check ? o.check(key, value, all) : null;
    if (why === null) delete problemsRef.current[key];
    else problemsRef.current[key] = why;

    const d = dirty();
    const valid = d.filter((n) => !(n in problemsRef.current));
    if (valid.length > 0) {
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        void writeNowRef.current(false);
      }, o.delayMs ?? AUTOSAVE_DELAY_MS);
      setState("pending");
    } else {
      clearTimer();
      if (d.length > 0) setState("invalid");
      else if (inFlight.current === null) setState("idle");
      else rerender();
    }
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
