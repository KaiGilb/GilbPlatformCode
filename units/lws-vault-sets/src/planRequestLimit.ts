// One pool of in-flight Plan finds and record reads per query client.
// The slot is taken before the request function runs and released when it settles.
// Never wrap work that itself waits on this limiter: the queue would deadlock.

import type { QueryClient } from "@tanstack/react-query";
import { MAX_PARALLEL_DEREFERENCES } from "./mapWithConcurrency";

export type LimitRun = <T>(fn: () => Promise<T>) => Promise<T>;

export type Limiter = { run: LimitRun };

/** FIFO. `limit` is how many `fn` calls may be running at once. A slot is taken
 * before `fn` runs, including when `fn` throws or rejects, and released in `finally`. */
export function createLimiter(limit: number): Limiter {
  let active = 0;
  const queue: Array<() => void> = [];

  function pump(): void {
    while (active < limit && queue.length > 0) {
      const start = queue.shift()!;
      active += 1;
      start();
    }
  }

  const run: LimitRun = (fn) =>
    new Promise((resolve, reject) => {
      queue.push(() => {
        // `fn` starts on a later turn, but the slot is already taken, so a
        // synchronous `run` from the caller cannot exceed `limit`.
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            pump();
          });
      });
      pump();
    });

  return { run };
}

const limits = new WeakMap<QueryClient, Limiter>();

/** One limiter of {@link MAX_PARALLEL_DEREFERENCES} for this client. Every open Plan card shares it. */
export function planReadLimit(qc: QueryClient): Limiter {
  let limiter = limits.get(qc);
  if (!limiter) {
    limiter = createLimiter(MAX_PARALLEL_DEREFERENCES);
    limits.set(qc, limiter);
  }
  return limiter;
}
