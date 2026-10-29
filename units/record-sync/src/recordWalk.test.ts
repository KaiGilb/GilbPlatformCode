// The typed list walked in full rows by `nextOffset`: `walkRecordPages`, pinned over a fake platform.
// The fake platform below answers as the GilbPlatform record list does:
//   include=body: `limit` (cap 100), rows newest first with `body` and `etag`, `nextOffset` = window position after the rows the
//   page EXAMINED (a row the caller may not read is examined and dropped, so `nextOffset` runs ahead of the rows served);
//   since=start|head|<cursor>: oldest first, `nextCursor` on every page; an unknown cursor is 400 `since_cursor_invalid`;
//   lifecycle=ended lists the ended records the same way. `feed: false` answers as a platform without the feed (since ignored).
import { describe, expect, it } from "vitest";
import { RECORD_PAGE_LIMIT, walkRecordPages } from "./recordPages";
import type { PlatformClient } from "./platform";

const ORIGIN = "https://holder.platform.example.test";
const VAULT = `${ORIGIN}/vault`;

interface Rec {
  id: string;
  type: string;
  name: string;
  t: number;
  ended?: number;
  hidden?: boolean;
}

function fakePlatform(opts: { fullRows?: boolean; feed?: boolean; budgetRows?: number } = {}) {
  const fullRows = opts.fullRows ?? true;
  const feed = opts.feed ?? true;
  const recs: Rec[] = [];
  let clock = 1000;
  const seen: string[] = [];
  const add = (n: number, type = "t:Person") => {
    for (let i = 0; i < n; i++) {
      clock += 1;
      recs.push({ id: `${ORIGIN}/base/e/r${String(recs.length).padStart(4, "0")}`, type, name: `P ${recs.length}`, t: clock });
    }
  };
  const touch = (i: number) => {
    clock += 1;
    recs[i]!.t = clock;
    recs[i]!.name += "*";
  };
  const end = (i: number) => {
    clock += 1;
    recs[i]!.ended = clock;
  };
  const body = (r: Rec) => ({ "@id": r.id, "@type": r.type, name: r.name });
  const row = (r: Rec, withBody: boolean) => ({
    entity: r.id,
    typeUri: r.type,
    label: r.name,
    updatedAt: new Date(r.t).toISOString(),
    vault: VAULT,
    vaultAmbiguous: false,
    ...(withBody ? { body: body(r), etag: `"sha256:${r.t}"` } : {}),
  });
  const fetch = async (url: string): Promise<Response> => {
    seen.push(url);
    const u = new URL(url);
    const q = u.searchParams;
    const types = q.getAll("type").map((t) => `t:${t}`);
    const ended = q.get("lifecycle") === "ended";
    const withBody = fullRows && q.get("include") === "body";
    const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    const pool = recs.filter((r) => types.includes(r.type) && (ended ? r.ended !== undefined : r.ended === undefined));
    const pos = (r: Rec) => (ended ? r.ended! : r.t);
    const since = feed ? q.get("since") : null;
    if (since !== null) {
      if (q.get("offset")) return json(400, { error: "since_with_offset", message: "since is the position; offset cannot be combined with it", accepted: "since alone, or offset alone" });
      let from: number;
      if (since === "start") from = 0;
      else if (since === "head") return json(200, { records: [], complete: true, nextCursor: `c:${ended ? "e" : "l"}:${clock}` });
      else {
        const m = /^c:([el]):(\d+)$/.exec(since);
        if (!m || (m[1] === "e") !== ended) return json(400, { error: "since_cursor_invalid", message: "since must be the nextCursor this list returned to you for this vault, or the word start, or the word head", accepted: ["start", "head", "<nextCursor>"] });
        from = Number(m[2]);
      }
      const after = pool.filter((r) => pos(r) > from).sort((a, b) => pos(a) - pos(b));
      const take = Math.min(Number(q.get("limit") ?? 20) || 100, 100);
      const page = after.slice(0, withBody ? take : 20);
      const last = page.at(-1);
      return json(200, {
        records: page.filter((r) => !r.hidden).map((r) => row(r, withBody)),
        complete: page.length === after.length,
        nextCursor: `c:${ended ? "e" : "l"}:${last ? pos(last) : clock}`,
      });
    }
    // The plain list, newest first.
    const ordered = [...pool].sort((a, b) => pos(b) - pos(a));
    const offset = Number(q.get("offset") ?? 0);
    const take = withBody ? Math.min(Number(q.get("limit") ?? 100) || 100, 100, opts.budgetRows ?? 100) : 20;
    const window = ordered.slice(offset, offset + take);
    return json(200, {
      records: window.filter((r) => !r.hidden).map((r) => row(r, withBody)),
      total: offset + window.length,
      complete: offset + window.length >= ordered.length,
      offset,
      ...(withBody ? { nextOffset: offset + window.length } : {}),
    });
  };
  const platform: PlatformClient = { origin: ORIGIN, fetch: fetch as PlatformClient["fetch"] };
  return { platform, recs, seen, add, touch, end };
}

describe("walkRecordPages", () => {
  it("reads 201 records in 3 full-row pages, newest first, each row with its body and etag", async () => {
    const f = fakePlatform();
    f.add(201);
    const walk = await walkRecordPages(f.platform, VAULT, ["Person"]);
    expect(walk.complete).toBe(true);
    expect(walk.pages).toBe(3);
    expect(walk.rows).toHaveLength(201);
    expect(walk.rows[0]!.entity).toBe(f.recs[200]!.id);
    expect(walk.rows[0]!.body).toEqual({ "@id": f.recs[200]!.id, "@type": "t:Person", name: "P 200" });
    expect(walk.rows[0]!.etag).toMatch(/^"sha256:/);
    expect(f.seen[0]).toContain("include=body");
    expect(f.seen[0]).toContain(`limit=${RECORD_PAGE_LIMIT}`);
  });

  it("steps by nextOffset, so a row the caller may not read neither stalls nor repeats the walk", async () => {
    const f = fakePlatform();
    f.add(250);
    // Rows the single read refuses: dropped from `records`, still in the window. Adding the rows served would repeat 3 rows.
    for (const i of [249, 248, 200]) f.recs[i]!.hidden = true;
    const walk = await walkRecordPages(f.platform, VAULT, ["Person"]);
    const ids = walk.rows.map((r) => r.entity);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(247);
    expect(f.seen.map((u) => new URL(u).searchParams.get("offset"))).toEqual([null, "100", "200"]);
  });

  it("follows a page cut early by the byte budget (fewer than 100 rows, nextOffset after them)", async () => {
    const f = fakePlatform({ budgetRows: 30 });
    f.add(70);
    const walk = await walkRecordPages(f.platform, VAULT, ["Person"]);
    expect(walk.rows).toHaveLength(70);
    expect(walk.pages).toBe(3);
    expect(walk.complete).toBe(true);
  });

  it("walks a platform without full rows as before (by the rows served), and stops when told", async () => {
    const f = fakePlatform({ fullRows: false });
    f.add(45);
    const walk = await walkRecordPages(f.platform, VAULT, ["Person"]);
    expect(walk.rows).toHaveLength(45);
    expect(walk.pages).toBe(3);
    const early = await walkRecordPages(f.platform, VAULT, ["Person"], { until: (rows) => rows.length >= 20 });
    expect(early.complete).toBe(false);
    expect(early.pages).toBe(1);
  });

  it("refuses an empty type list (it would read the whole vault)", async () => {
    const f = fakePlatform();
    await expect(walkRecordPages(f.platform, VAULT, [])).rejects.toThrow(/at least one type/);
    expect(f.seen).toHaveLength(0);
  });
});
