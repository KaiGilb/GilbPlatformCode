import { findByAttribute } from "./attributeFind";

/**
 * Every id for one attribute value, paged. Skip ids already seen, and stop on an
 * empty page, a page that adds no new id, a page shorter than `pageSize`,
 * `ids.length >= count`, or the cap. `until` only stops early, on a match.
 *
 * `capped` is true only when the walk stopped at the cap on a full page and one
 * more find says another id exists. That ask is `findByAttribute` with `limit: 1`
 * at the offset already advanced past the last page, through `opts.run` when one
 * was given. An id from it that is not already in `seen` means capped. That id is
 * not added to `ids`. When `ids.length >= count` (count is never too low), the
 * walk is complete: not capped, and that extra find is not asked. A short page,
 * an empty page, or a page that added nothing ends the walk and is not capped.
 * `opts.run`, when given, wraps each find and nothing else.
 */
export async function pageAllByAttribute(
  attr: string,
  value: unknown,
  origin: string,
  opts: {
    pageSize: number;
    cap: number;
    until?: (id: string) => boolean;
    run?: <T>(fn: () => Promise<T>) => Promise<T>;
  },
): Promise<{ ids: string[]; count: number; capped: boolean }> {
  const ids: string[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let count = 0;
  let capped = false;
  const { pageSize, cap, until, run } = opts;
  const call = <T>(fn: () => Promise<T>): Promise<T> => (run ? run(fn) : fn());
  for (;;) {
    const page = await call(() => findByAttribute(attr, value, { limit: pageSize, offset }, origin));
    count = page.count;
    const before = ids.length;
    let matched = false;
    for (const id of page.ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (until?.(id)) {
        matched = true;
        break;
      }
    }
    if (matched) break;
    offset += page.ids.length;
    const empty = page.ids.length === 0;
    const noNew = ids.length === before;
    const lastPageWasFull = page.ids.length >= pageSize;
    const short = !lastPageWasFull;
    const atCount = ids.length >= count;
    const atCap = ids.length >= cap;
    if (empty || noNew || short || atCount || atCap) {
      // An empty page, or a page that added nothing, stops before the cap does.
      if (atCap && lastPageWasFull && !empty && !noNew && ids.length < count) {
        const probe = await call(() => findByAttribute(attr, value, { limit: 1, offset }, origin));
        capped = probe.ids.some((id) => !seen.has(id));
      }
      break;
    }
  }
  return { ids, count, capped };
}
