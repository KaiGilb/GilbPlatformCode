/** A wait that must end. The message always ends with "timed out", which callers match. */
export class BoundTimeoutError extends Error {
  constructor(what: string) {
    super(`${what} timed out`);
    this.name = "BoundTimeoutError";
  }
}

export function isBoundTimeout(e: unknown): e is Error {
  return e instanceof Error && /timed out$/.test(e.message);
}

/**
 * Settle `p`, or reject when `ms` passes. The original promise is not cancelled: a late
 * resolution is ignored. Callers that hold a lock must still settle their own callback.
 */
export function boundAwait<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new BoundTimeoutError(what));
    }, ms);
    p.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
