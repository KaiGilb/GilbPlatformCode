/**
 * Narrow a server total by the rows this page dropped.
 *
 * `serverTotal` is the count the server reported for the whole result, when it reported one.
 * `seen` is how many rows the server sent on this page, before any row was thrown away.
 * `kept` is how many of those rows the screen will show.
 *
 * When the server sent no number, the answer is `kept`. Do not subtract in that case.
 * A string, null, or undefined is "no number". NaN is a number, and is not this branch.
 *
 * The result is never negative. It can be larger than `serverTotal` when `kept` is larger
 * than `seen`. It is a lower bound for a paged list, not an exact filtered count:
 * rows on pages that were not fetched are not in `seen`.
 */
export function narrowTotal(
  serverTotal: number | undefined,
  seen: number,
  kept: number,
): number {
  if (typeof serverTotal !== "number") return kept;
  return Math.max(0, serverTotal - (seen - kept));
}
