/**
 * Run `fn` over `items` with at most `limit` calls in flight.
 * The result array is in the same order as `items`, not completion order.
 *
 * A limit below 1 is treated as 1. `Math.max(1, limit)` does that for
 * finite numbers. Do not pass `NaN`: `Math.max` does not turn `NaN` into 1,
 * and then no worker runs.
 *
 * An empty list returns `[]` and does not call `fn`.
 * If `fn` throws, this promise rejects. It does not return a partial list.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      // index was taken from the list, so the slot is present.
      results[index] = await fn(items[index]!, index);
    }
  }
  const workers = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
