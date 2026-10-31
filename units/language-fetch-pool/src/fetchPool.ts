/**
 * The one pool every read of a language entry and of a country's flag goes through.
 *
 * Why: a card of 100 languages in 30 countries asked for 160 files at once, with no cap and no timeout, and one entry that never
 * answered held back every name. Now at most {@link LANGUAGE_FETCH_PARALLEL} reads are in flight, and each read is bounded by a
 * timeout that starts when it STARTS (a read waiting its turn is not "slow").
 */

/** At most this many language or flag files are being read at once. */
export const LANGUAGE_FETCH_PARALLEL = 8;

/** The longest one read may take, from the moment it starts, before it is given up (and said so). */
export const LANGUAGE_FETCH_TIMEOUT_MS = 8000;

/** A read that did not finish in time. A distinct error, so a caller can word it. */
export class FetchTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`No answer from ${url} in ${ms} ms.`);
    this.name = "FetchTimeoutError";
  }
}

let active = 0;
const waiting: Array<() => void> = [];

function release(): void {
  active -= 1;
  const next = waiting.shift();
  if (next) next();
}

/** Run `task` when a place in the pool is free (first come, first served). */
export function pooled<T>(task: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
  if (active < LANGUAGE_FETCH_PARALLEL) return run();
  return new Promise<T>((resolve, reject) => {
    waiting.push(() => {
      run().then(resolve, reject);
    });
  });
}

/** Test seam: how many reads are in flight right now. */
export function __poolActive(): number {
  return active;
}

/** Test seam — ⛔ never called by product code. Forgets the queue (a test that leaves reads hanging). */
export function __resetFetchPool(): void {
  active = 0;
  waiting.length = 0;
}

/**
 * One GET through the pool, bounded by a timeout that covers the answer AND the reading of its body.
 *
 * @param read turns the response into the value wanted (it runs inside the time limit and the pool place)
 * @returns what `read` returned
 * @throws {FetchTimeoutError} when it did not finish in `timeoutMs`; any other failure is the fetch's or
 *   the reader's own, as it came
 */
export function pooledGet<T>(
  url: string,
  init: RequestInit,
  read: (res: Response) => Promise<T>,
  opts: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? LANGUAGE_FETCH_TIMEOUT_MS;
  return pooled(async () => {
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    init.signal?.addEventListener("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        ctl.abort();
        reject(new FetchTimeoutError(url, timeoutMs));
      }, timeoutMs);
    });
    try {
      const doFetch = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
      const work = (async () => read(await doFetch(url, { ...init, signal: ctl.signal })))();
      // If the limit wins, `work` is aborted and its late rejection is dropped here.
      work.catch(() => undefined);
      return await Promise.race([work, limit]);
    } catch (e) {
      if (timedOut) throw new FetchTimeoutError(url, timeoutMs);
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
      init.signal?.removeEventListener("abort", onAbort);
    }
  });
}
