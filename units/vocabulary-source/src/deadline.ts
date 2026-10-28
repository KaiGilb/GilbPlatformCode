// Bounded master reads: one piece of work that ends by a deadline or when a parent signal aborts, and a source whose every read
// stops with a reading's signal. The bound holds even when the host's fetch ignores its signal.

import type { ChildrenPage, CarrierList, VocabularySource } from "./source";
import type { TermDoc } from "./terms";

/**
/** The largest delay `setTimeout` keeps: above it, Node and browsers fire at once (Node warns TimeoutOverflowWarning). */
export const MAX_BOUND_MS = 2_147_483_647;

/**
 * A bound a caller gives, checked: left out, it is `fallback`; given, it must be a finite
 * number of ms above 0 and at most `MAX_BOUND_MS`. Anything else (0, a negative number, NaN, Infinity) is refused with a
 * RangeError, ⛔ never read as "no bound": a bound is never switched off. A number above `MAX_BOUND_MS` is refused the same
 * way: the timer would fire at once, so a long bound would cut every request.
 * Called where the source, the reader or the write call is made.
 *
 * @param name the option, as the caller wrote it (`timeoutMs`, `readCapMs`, `masterReadCapMs`)
 * @param ms what the caller gave
 * @param fallback the default
 * @returns the bound to use
 * @throws RangeError when `ms` is given and is not a finite number above 0 and at most `MAX_BOUND_MS`
 */
export function checkedBound(name: string, ms: number | undefined, fallback: number): number {
  if (ms === undefined) return fallback;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0 || ms > MAX_BOUND_MS)
    throw new RangeError(
      `${name} must be a finite number of ms above 0 and at most ${MAX_BOUND_MS} (setTimeout's limit), not ${String(ms)}; leave it out for the default, ${fallback} ms (a bound is never switched off)`,
    );
  return ms;
}

export interface DeadlineOptions {
  /** The bound in ms: a finite number above 0, at most `MAX_BOUND_MS` (else a RangeError, `checkedBound`). Left out, only
   *  `parents` end the work. */
  ms?: number;
  /** Signals that stop the work when they abort (a reading's, a write call's). */
  parents?: readonly AbortSignal[];
  /** The error the work ends with when `ms` runs out. */
  timeoutError: () => Error;
  /** The error the work ends with when a parent aborts (also when one has already aborted: the work is then never started). */
  abortError: () => Error;
}

/**
 * Run `work` with a signal of its own, and end it at the deadline or when a parent aborts,
 * whichever is first. When it ends, in any way, the signal handed to `work` is aborted. The timer and the
 * parents' listeners are removed as soon as it ends, however it ends. `work`'s own late
 * answer or rejection is swallowed, so nothing reaches the runtime as unhandled.
 *
 * @param work the read, given the signal it must pass to its fetch
 * @param opts the bound, the parents and the two errors
 * @returns what `work` answered
 * @throws RangeError (at once, nothing started) when `opts.ms` is given and is not a finite number above 0, at most `MAX_BOUND_MS`
 */
export function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>, opts: DeadlineOptions): Promise<T> {
  const ms = opts.ms === undefined ? undefined : checkedBound("ms", opts.ms, 0);
  const parents = opts.parents ?? [];
  const ac = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // However the work ends, its signal is aborted: a request it left in flight (a sibling of a read that failed) is an orphan,
    // and is stopped rather than left to run to its own bound.
    const finish = (why?: unknown) => {
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const p of parents) p.removeEventListener("abort", onParent);
      ac.abort(why);
    };
    const fail = (err: Error) => {
      if (done) return;
      finish(err);
      reject(err);
    };
    const onParent = () => fail(opts.abortError());
    // A parent already stopped: the work is never started, so nothing is sent.
    if (parents.some((p) => p.aborted)) {
      done = true;
      reject(opts.abortError());
      return;
    }
    for (const p of parents) p.addEventListener("abort", onParent, { once: true });
    if (ms !== undefined) timer = setTimeout(() => fail(opts.timeoutError()), ms);
    let p: Promise<T>;
    try {
      p = work(ac.signal);
    } catch (cause) {
      p = Promise.reject(cause);
    }
    p.then(
      (value) => {
        if (done) return;
        finish();
        resolve(value);
      },
      (cause) => {
        if (done) return;
        finish();
        reject(cause);
      },
    );
  });
}

/**
 * `source`, with every read stopped by `signal`: a read in flight ends with `stopped()` when the
 * signal aborts, and a read asked for after it is refused at once, ⛔ never sent. Each read is
 * handed the signal, so a source that passes it to its fetch (as `masterSource` does) also aborts
 * the requests themselves. ⚠ The source's own methods are called, ⛔ never swapped for another
 * source's: a caller may have replaced one (`{ ...masterSource(o), term: … }`).
 *
 * @param source the master
 * @param signal the reading's signal
 * @param stopped the error a stopped read ends with
 * @returns the bounded source
 */
export function boundSource(source: VocabularySource, signal: AbortSignal, stopped: () => Error): VocabularySource {
  const guard = <T>(run: () => Promise<T>): Promise<T> => withDeadline(() => run(), { parents: [signal], timeoutError: stopped, abortError: stopped });
  const bounded: VocabularySource = {
    termIri: (path) => source.termIri(path),
    term: (iri): Promise<TermDoc> => guard(() => source.term(iri, signal)),
    children: (iri): Promise<ChildrenPage> => guard(() => source.children(iri, signal)),
    carriersOf: (keys): Promise<CarrierList> => guard(() => source.carriersOf(keys, signal)),
  };
  if (source.terms) {
    const terms = source.terms.bind(source);
    bounded.terms = (iris) => {
      if (signal.aborted) return iris.map(() => guard<TermDoc>(() => Promise.reject(stopped())));
      let read: Promise<TermDoc>[];
      try {
        read = terms(iris, signal);
      } catch (cause) {
        read = iris.map(() => Promise.reject(cause));
      }
      return read.map((p) => guard(() => p));
    };
  }
  return bounded;
}
