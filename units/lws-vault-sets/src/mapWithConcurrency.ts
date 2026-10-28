/**
 * Max in-flight dereferences. The same shape as `LWS_RECORDS_MAX_PARALLEL_PAGES` in
 * recordHooks.ts — browser HTTP/1.1 is ~6 connections per origin, and a cold device with N
 * new types must not open N sockets at once.
 */
export const MAX_PARALLEL_DEREFERENCES = 6;

/** Run `fn` over `items` with at most `limit` in flight. JS is single-threaded; `next` is safe.
 * Shared with recordHooks.ts (imported there), so the two bounded fan-outs are one helper.
 * When `fn` throws, no further item is started. Calls already running are allowed to finish,
 * then this rejects with the first error. Success is unchanged. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  let firstError: unknown;
  async function worker(): Promise<void> {
    while (true) {
      if (failed) return;
      const i = next;
      next += 1;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (e) {
        if (!failed) {
          failed = true;
          firstError = e;
        }
        return;
      }
    }
  }
  const n = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  if (failed) throw firstError;
  return results;
}
