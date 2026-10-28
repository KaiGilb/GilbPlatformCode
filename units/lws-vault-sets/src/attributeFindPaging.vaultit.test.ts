import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageAllByAttribute } from "./attributeFindPaging";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
import { setUp, tearDown } from "../test/support";

const ORIGIN = "https://plan.platform.example.test";
const PARENT = `${ORIGIN}/base/e/parent`;

function page(count: number, ids: string[]): Response {
  return Response.json({ count, ids });
}

function ids(prefix: string, n: number, from = 0): string[] {
  return Array.from({ length: n }, (_, i) => `${ORIGIN}/base/e/${prefix}${from + i}`);
}

describe("pageAllByAttribute", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setUp();
  });
  afterEach(() => tearDown());

  it("reads three pages", async () => {
    fetchMock
      .mockResolvedValueOnce(page(6, ids("p", 2, 0)))
      .mockResolvedValueOnce(page(6, ids("p", 2, 2)))
      .mockResolvedValueOnce(page(6, ids("p", 2, 4)));
    const found = await pageAllByAttribute("a:partOf", { "@id": PARENT }, ORIGIN, { pageSize: 2, cap: 100 });
    expect(found.ids).toEqual(ids("p", 6));
    expect(found.count).toBe(6);
    expect(found.capped).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const offsets = fetchMock.mock.calls.map((c) => new URL(String(c[0])).searchParams.get("offset"));
    expect(offsets).toEqual([null, "2", "4"]);
  });

  it("stops when a page adds nothing new", async () => {
    const first = ids("p", 2);
    fetchMock.mockResolvedValueOnce(page(10, first)).mockResolvedValueOnce(page(10, first));
    const found = await pageAllByAttribute("a:partOf", { "@id": PARENT }, ORIGIN, { pageSize: 2, cap: 100 });
    expect(found.ids).toEqual(first);
    expect(found.capped).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops on a short page", async () => {
    fetchMock.mockResolvedValueOnce(page(10, ids("p", 1)));
    const found = await pageAllByAttribute("a:partOf", { "@id": PARENT }, ORIGIN, { pageSize: 2, cap: 100 });
    expect(found.ids).toHaveLength(1);
    expect(found.capped).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops at the cap and says there were more", async () => {
    fetchMock
      .mockResolvedValueOnce(page(10, ids("p", 2, 0)))
      .mockResolvedValueOnce(page(10, ids("p", 2, 2)))
      .mockResolvedValueOnce(page(10, ids("p", 2, 4)));
    const found = await pageAllByAttribute("a:partOf", { "@id": PARENT }, ORIGIN, { pageSize: 2, cap: 4 });
    expect(found.ids).toEqual(ids("p", 4));
    expect(found.count).toBe(10);
    expect(found.capped).toBe(true);
    // The third ask is the one-id probe. It is not added to the result.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const probe = new URL(String(fetchMock.mock.calls[2]![0]));
    expect(probe.searchParams.get("limit")).toBe("1");
    expect(probe.searchParams.get("offset")).toBe("4");
  });

  it("is not capped when the ids already reach the count, and does not ask again", async () => {
    fetchMock.mockResolvedValueOnce(page(4, ids("p", 2, 0))).mockResolvedValueOnce(page(4, ids("p", 2, 2)));
    const found = await pageAllByAttribute("a:partOf", { "@id": PARENT }, ORIGIN, { pageSize: 2, cap: 4 });
    expect(found.ids).toEqual(ids("p", 4));
    expect(found.count).toBe(4);
    expect(found.capped).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops when the count is reached", async () => {
    fetchMock.mockResolvedValueOnce(page(4, ids("p", 2, 0))).mockResolvedValueOnce(page(4, ids("p", 2, 2)));
    const found = await pageAllByAttribute("a:partOf", { "@id": PARENT }, ORIGIN, { pageSize: 2, cap: 100 });
    expect(found.ids).toEqual(ids("p", 4));
    expect(found.count).toBe(4);
    expect(found.capped).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
