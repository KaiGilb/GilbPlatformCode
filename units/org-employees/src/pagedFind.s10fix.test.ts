// Cycle214 s10 organization card FIX — Agent.Scaling N1: with both address spellings in use ONE page must still hold at most `limit`
// records (it held up to 2 x limit: 100 employments and 100 person reads, 6.3 s at +140 ms). The two spellings are one list to the reader:
// spelling A's records, then spelling B's, paged by one logical offset, the counts carried from page to page.
import { describe, expect, it } from "vitest";
import { pagedFindBothSpellings } from "./pagedFind";

const BASE = "https://v.example.test/base/e/org1";
const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `https://v.example.test/base/e/${p}${String(i).padStart(3, "0")}`);

/** A platform with `a` records stored under the /base/e/ spelling and `b` under /vault/e/. */
function platform(a: number, b: number) {
  const calls: { value: string; offset: number; limit: number }[] = [];
  const A = ids("a", a);
  const B = ids("b", b);
  const find = async (_attr: string, value: unknown, page: { limit: number; offset: number }) => {
    const v = (value as { "@id": string })["@id"];
    calls.push({ value: v, offset: page.offset, limit: page.limit });
    const all = v.includes("/base/e/") ? A : B;
    return { count: all.length, ids: all.slice(page.offset, page.offset + page.limit) };
  };
  return { find, calls, all: [...A, ...B] };
}

async function walk(a: number, b: number, limit: number) {
  const pl = platform(a, b);
  const pages: string[][] = [];
  let offset = 0;
  let counts: number[] | undefined;
  for (let i = 0; i < 50; i++) {
    const r = await pagedFindBothSpellings(pl.find, "a:employer", BASE, { offset, limit, counts }, "https://v.example.test");
    pages.push(r.ids);
    expect(r.total).toBe(a + b);
    counts = r.counts;
    if (r.next === null) break;
    offset = r.next;
  }
  return { pages, pl };
}

describe("a page of the two spellings never holds more than `limit`", () => {
  it("50 + 50 records: pages of 50 and 50, every record once, none missing", async () => {
    const { pages, pl } = await walk(50, 50, 50);
    expect(pages.map((p) => p.length)).toEqual([50, 50]);
    expect(pages.flat().sort()).toEqual([...pl.all].sort());
  });
  it("60 + 40: the second page takes the tail of the first spelling and the head of the second", async () => {
    const { pages, pl } = await walk(60, 40, 50);
    expect(pages.map((p) => p.length)).toEqual([50, 50]);
    expect(pages.flat().sort()).toEqual([...pl.all].sort());
  });
  it("120 + 130 with a small limit: no page over the limit, no duplicate, none missing", async () => {
    const { pages, pl } = await walk(120, 130, 25);
    expect(Math.max(...pages.map((p) => p.length))).toBeLessThanOrEqual(25);
    expect(pages.flat()).toHaveLength(250);
    expect(new Set(pages.flat()).size).toBe(250);
    expect(pages.flat().sort()).toEqual([...pl.all].sort());
  });
  it("one spelling only (0 in the other): same as before, 3 pages of 50, 50 and 20", async () => {
    const { pages } = await walk(120, 0, 50);
    expect(pages.map((p) => p.length)).toEqual([50, 50, 20]);
  });
  it("the first page asks both spellings together at offset 0 (it learns both counts there)", async () => {
    const pl = platform(10, 10);
    await pagedFindBothSpellings(pl.find, "a:employer", BASE, { offset: 0, limit: 50 }, "o");
    expect(pl.calls.map((c) => c.offset)).toEqual([0, 0]);
  });
  it("a later page asks only the spelling that holds records at that offset (counts known)", async () => {
    const pl = platform(120, 30);
    await pagedFindBothSpellings(pl.find, "a:employer", BASE, { offset: 50, limit: 50, counts: [120, 30] }, "o");
    expect(pl.calls.map((c) => c.value.includes("/base/e/"))).toEqual([true]); // 50..99 of A; B starts at 120
  });
  it("without counts at a later offset it learns them first (one cheap find each), then pages correctly", async () => {
    const pl = platform(60, 40);
    const r = await pagedFindBothSpellings(pl.find, "a:employer", BASE, { offset: 50, limit: 50 }, "o");
    expect(r.ids).toHaveLength(50);
    expect(r.counts).toEqual([60, 40]);
  });
  it("a find that answers no id for an offset below the total ends the walk (no endless Show more)", async () => {
    const find = async () => ({ count: 100, ids: [] as string[] });
    const r = await pagedFindBothSpellings(find, "a:employer", BASE, { offset: 0, limit: 50 }, "o");
    expect(r.next).toBeNull();
  });
});
