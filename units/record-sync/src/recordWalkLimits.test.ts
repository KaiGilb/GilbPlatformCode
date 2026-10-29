// New tests: the limits and the shape of `walkRecordPages`, and `RECORD_WALK_MAX_PAGES`, pinned over a fake platform.
import { describe, expect, it } from "vitest";
import { RECORD_PAGE_LIMIT, RECORD_WALK_MAX_PAGES, RecordListError, walkRecordPages, type RecordWalk } from "./recordPages";
import type { PlatformClient } from "./platform";

const ORIGIN = "https://holder.platform.example.test";
const VAULT = `${ORIGIN}/vault`;

/** A list of `total` rows, `size` to a page, with a nextOffset. */
function listOf(total: number, size = 2) {
  const seen: URL[] = [];
  const platform: PlatformClient = {
    origin: ORIGIN,
    fetch: async (url) => {
      const u = new URL(url);
      seen.push(u);
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const n = Math.max(0, Math.min(size, total - offset));
      const records = Array.from({ length: n }, (_, i) => ({ entity: `${VAULT}/e/r${offset + i}`, typeUri: "t:Person" }));
      return new Response(JSON.stringify({ records, complete: offset + n >= total, nextOffset: offset + n }), { status: 200 });
    },
  };
  return { platform, seen };
}

describe("walkRecordPages limits", () => {
  it("asks for full rows at the page limit, with each bare type name as its own `type` parameter", async () => {
    const f = listOf(1);
    await walkRecordPages(f.platform, VAULT, ["Person", "Company"]);
    expect(f.seen[0]!.pathname).toBe(`/lws/vault/${encodeURIComponent(VAULT)}/records`);
    expect(f.seen[0]!.searchParams.getAll("type")).toEqual(["Person", "Company"]);
    expect(f.seen[0]!.searchParams.get("include")).toBe("body");
    expect(f.seen[0]!.searchParams.get("limit")).toBe(String(RECORD_PAGE_LIMIT));
    expect(f.seen[0]!.searchParams.has("offset")).toBe(false);
  });

  it("stops at maxPages, not complete, and says how many requests it sent", async () => {
    const f = listOf(10);
    const walk: RecordWalk = await walkRecordPages(f.platform, VAULT, ["Person"], { maxPages: 2 });
    expect(walk).toMatchObject({ complete: false, pages: 2 });
    expect(walk.rows.map((r) => r.entity)).toEqual([0, 1, 2, 3].map((i) => `${VAULT}/e/r${i}`));
  });

  it("stops once maxRows rows are read, not complete", async () => {
    const f = listOf(10);
    const walk = await walkRecordPages(f.platform, VAULT, ["Person"], { maxRows: 3 });
    expect(walk.complete).toBe(false);
    expect(walk.pages).toBe(2);
    expect(walk.rows).toHaveLength(4);
  });

  it("is complete when the last page says so, even if `until` would have answered true", async () => {
    const f = listOf(3);
    const walk = await walkRecordPages(f.platform, VAULT, ["Person"], { until: () => true });
    expect(walk.complete).toBe(false);
    expect(walk.pages).toBe(1);
    const all = await walkRecordPages(listOf(2).platform, VAULT, ["Person"], { until: () => true });
    expect(all.complete).toBe(true);
  });

  it("throws a RecordListError carrying the platform's status when a page is not 200", async () => {
    const platform: PlatformClient = { origin: ORIGIN, fetch: async () => new Response(JSON.stringify({ error: "type_token_unresolved" }), { status: 400 }) };
    await expect(walkRecordPages(platform, VAULT, ["Nope"])).rejects.toMatchObject({ status: 400, code: "type_token_unresolved" });
    await expect(walkRecordPages(platform, VAULT, ["Nope"])).rejects.toBeInstanceOf(RecordListError);
  });

  it("throws a PlatformError when a 200 answer carries no record list", async () => {
    const platform: PlatformClient = { origin: ORIGIN, fetch: async () => new Response("{}", { status: 200 }) };
    await expect(walkRecordPages(platform, VAULT, ["Person"])).rejects.toThrow(/served no record list/);
  });

  it("drops a row with no address and keeps the rest", async () => {
    const platform: PlatformClient = {
      origin: ORIGIN,
      fetch: async () => new Response(JSON.stringify({ records: [{ label: "no address" }, { "@id": `${VAULT}/e/a`, label: "  " }], complete: true }), { status: 200 }),
    };
    const walk = await walkRecordPages(platform, VAULT, ["Person"]);
    expect(walk.rows).toHaveLength(1);
    expect(walk.rows[0]).toMatchObject({ entity: `${VAULT}/e/a`, label: null, typeUri: null });
  });

  it("holds its page cap at 500", () => {
    expect(RECORD_WALK_MAX_PAGES).toBe(500);
  });
});
