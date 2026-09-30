/**
 * Move the item at `from` to index `to`.
 *
 * Returns a new array. The items themselves are not copied. The length stays
 * the same when `from` points at a real item.
 *
 * The same index returns a shallow copy, not the same array.
 *
 * This does not check the indexes. The app's caller checks them before the
 * move and throws if either index is outside the list. Use that check if a
 * bad index must be an error.
 *
 * If `from` does not point at an item, nothing is inserted. This copy does
 * not punch an empty hole. A negative `from` counts from the end, because
 * that is how the underlying splice works. Do not pass a negative index
 * unless that is what you mean.
 */
export function moveIndex<T>(arr: readonly T[], from: number, to: number): T[] {
  if (from === to) return arr.slice();
  const next = arr.slice();
  const removed = next.splice(from, 1);
  const item = removed[0];
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}
