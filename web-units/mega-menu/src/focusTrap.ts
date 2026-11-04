/**
 * Next index in a tab cycle. Pure: no document, no focus calls.
 *
 * `list` is the cycle. `current` is the focused entry's index, or -1 when focus
 * is outside the list. `shift` is Shift+Tab.
 *
 * Forward wraps from the last entry to the first. Backward wraps from the first
 * to the last. Focus outside the list returns 0 (the first entry), with or
 * without Shift. An empty list returns -1.
 */
export function nextFocusIndex<T>(list: readonly T[], current: number, shift: boolean): number {
  const count = list.length;
  if (count === 0) return -1;
  if (current < 0 || current >= count) return 0;
  if (shift) return (current - 1 + count) % count;
  return (current + 1) % count;
}

/** What the open sheet cycles: links with an href, and buttons that are not disabled. */
export const FOCUSABLE_SELECTOR = "a[href], button:not([disabled])";
