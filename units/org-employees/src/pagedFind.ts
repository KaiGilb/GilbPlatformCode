// ONE page of "who points at this record" across the record's TWO address spellings
// (`/base/e/` and `/vault/e/`; the platform matches the stored text exactly, so both are asked).
// The two spellings are ONE list to the reader: spelling A's records, then spelling B's, paged by ONE logical offset. A page holds at
// most `limit` records however the records are split (it used to hold up to 2 x limit: 100 employments and 100 person reads, which put
// the open at 6.3 s at +140 ms). The platform's own counts per spelling travel from page to page (`counts`), so a later page asks only the
// spelling that holds records at its offset; a first page asks both together (it learns both counts there).
import type { AttributeFindResult } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { subjectSpellings } from "@kaigilb/gilbplatformcode-held-notes";

export type FindFn = (attr: string, value: unknown, page: { limit: number; offset: number }, origin: string) => Promise<AttributeFindResult>;

export interface PagedFind {
  /** The page's record addresses, each once, at most `limit`. */
  ids: string[];
  /** The platform's count for this reader over both spellings (all pages). */
  total: number;
  /** The platform's count per spelling, in the order asked: hand it to the next page. */
  counts: number[];
  /** The next logical offset, or null when this page reached the end (or answered nothing). */
  next: number | null;
}

export async function pagedFindBothSpellings(
  find: FindFn,
  attr: string,
  org: string,
  page: { offset: number; limit: number; counts?: readonly number[] },
  origin: string,
): Promise<PagedFind> {
  const spellings = subjectSpellings(org);
  const { offset, limit } = page;
  const ask = (spelling: string, at: number, n: number) => find(attr, { "@id": spelling }, { limit: n, offset: at }, origin);
  let counts = page.counts && page.counts.length === spellings.length ? [...page.counts] : null;
  let ids: string[] = [];
  if (counts === null && offset === 0) {
    // The first page: ask every spelling together; the counts come with the answers.
    const rs = await Promise.all(spellings.map((s) => ask(s, 0, limit)));
    counts = rs.map((r) => r.count);
    ids = rs.flatMap((r) => r.ids);
  } else {
    if (counts === null) counts = (await Promise.all(spellings.map((s) => ask(s, 0, 1)))).map((r) => r.count);
    const known = counts;
    const rs = await Promise.all(
      spellings.map(async (s, i) => {
        const before = known.slice(0, i).reduce((a, b) => a + b, 0);
        const local = offset - before;
        if (local >= known[i]! || offset + limit <= before) return { count: known[i]!, ids: [] as string[] };
        return ask(s, Math.max(local, 0), limit);
      }),
    );
    ids = rs.flatMap((r) => r.ids);
  }
  const unique = [...new Set(ids)].slice(0, limit);
  const total = counts.reduce((a, b) => a + b, 0);
  const consumed = offset + unique.length;
  return { ids: unique, total, counts, next: unique.length > 0 && consumed < total ? consumed : null };
}
