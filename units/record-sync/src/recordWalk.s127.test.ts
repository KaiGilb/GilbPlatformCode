// More gap tests for `walkRecordPages`, over a fake platform. The fake answers as the GilbPlatform record list does, more closely than
// the one in recordWalk.test.ts on four points that file does not reach:
//   - a page examines up to `limit` rows; a row the single read refuses is DROPPED from `records` but counted in `nextOffset`;
//   - a page stops BEFORE the row that would pass the byte budget (the first row is always served), `complete` false;
//   - the since feed orders by (time, entity) and resumes strictly after the cursor's (time, entity): ties across a cut;
//   - the ended list is STATE-based (`ended_at IS NOT NULL`): a revived record leaves it.
import { describe, expect, it } from "vitest";
import { walkRecordPages } from "./recordPages";
import type { PlatformClient } from "./platform";

const ORIGIN = "https://holder.platform.example.test";
const VAULT = `${ORIGIN}/vault`;

interface Rec {
  id: string;
  type: string;
  t: number;
  size: number;
  ended?: number;
  /** The single read refuses it (a husk, or the second read check): examined and dropped. */
  dropped?: boolean;
  /** The window predicate refuses it (not readable): never in the window at all. */
  unreadable?: boolean;
}

function platform(opts: { budget?: number; feed?: boolean; stuckFeed?: boolean } = {}) {
  const recs: Rec[] = [];
  let clock = 1000;
  const sent: string[] = [];
  const budget = opts.budget ?? Infinity;
  let feed = opts.feed ?? true;
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  const row = (r: Rec, withBody: boolean) => ({
    entity: r.id,
    typeUri: r.type,
    label: r.id,
    updatedAt: new Date(r.t).toISOString(),
    ...(withBody ? { body: { "@id": r.id, t: r.t }, etag: `"sha256:${r.t}"` } : {}),
  });
  // One page of the examined window: drop refused rows, stop before the budget (never before the first served row).
  const cut = (window: Rec[], withBody: boolean) => {
    if (!withBody) return { served: window, examined: window.length, truncated: false };
    const served: Rec[] = [];
    let bytes = 0;
    let examined = window.length;
    let truncated = false;
    for (let i = 0; i < window.length; i++) {
      const r = window[i]!;
      if (r.dropped) continue;
      if (served.length > 0 && bytes + r.size > budget) {
        truncated = true;
        examined = i;
        break;
      }
      served.push(r);
      bytes += r.size;
    }
    return { served, examined, truncated };
  };
  const fetch = async (url: string): Promise<Response> => {
    sent.push(url);
    const q = new URL(url).searchParams;
    const types = q.getAll("type").map((t) => `t:${t}`);
    const ended = q.get("lifecycle") === "ended";
    const withBody = q.get("include") === "body";
    const limit = withBody ? Math.min(Number(q.get("limit") ?? 100) || 100, 100) : 20;
    const pos = (r: Rec) => (ended ? r.ended! : r.t);
    const pool = recs.filter((r) => types.includes(r.type) && !r.unreadable && (ended ? r.ended !== undefined : r.ended === undefined));
    const since = feed ? q.get("since") : null;
    if (since !== null) {
      const horizon = clock + 1;
      let after: [number, string] | null = null;
      if (since === "head") return json(200, { records: [], complete: true, nextCursor: `c:${ended ? "e" : "l"}:${horizon}:` });
      if (since !== "start") {
        const m = /^c:([el]):(\d+):(.*)$/.exec(since);
        if (!m || (m[1] === "e") !== ended) return json(400, { error: "since_cursor_invalid", message: "since must be the nextCursor this list returned to you for this vault, or the word start, or the word head", accepted: ["start", "head", "<nextCursor>"] });
        after = [Number(m[2]), m[3]!];
      }
      const ordered = pool
        .filter((r) => pos(r) < horizon && (!after || pos(r) > after[0] || (pos(r) === after[0] && r.id > after[1])))
        .sort((a, b) => pos(a) - pos(b) || (a.id < b.id ? -1 : 1));
      const window = ordered.slice(0, limit + 1);
      const hasMore = window.length > limit;
      const page = window.slice(0, limit);
      const { served, examined, truncated } = cut(page, withBody);
      const complete = !hasMore && !truncated;
      const last = !complete ? page[examined - 1] : undefined;
      if (opts.stuckFeed) return json(200, { records: [], complete: false, nextCursor: since === "start" ? `c:${ended ? "e" : "l"}:0:` : since });
      return json(200, {
        records: served.map((r) => row(r, withBody)),
        complete,
        nextCursor: last ? `c:${ended ? "e" : "l"}:${pos(last)}:${last.id}` : `c:${ended ? "e" : "l"}:${horizon}:`,
      });
    }
    const ordered = [...pool].sort((a, b) => pos(b) - pos(a) || (a.id < b.id ? -1 : 1));
    const offset = Number(q.get("offset") ?? 0);
    const window = ordered.slice(offset, offset + limit + 1);
    const hasMore = window.length > limit;
    const page = window.slice(0, limit);
    const { served, examined, truncated } = cut(page, withBody);
    return json(200, {
      records: served.map((r) => row(r, withBody)),
      complete: !hasMore && !truncated,
      offset,
      ...(withBody ? { nextOffset: offset + examined } : {}),
    });
  };
  const p: PlatformClient = { origin: ORIGIN, fetch: fetch as PlatformClient["fetch"] };
  let n = 0;
  const add = (k: number, extra: Partial<Rec> = {}, sameTime = false) => {
    if (sameTime) clock += 1;
    for (let i = 0; i < k; i++) {
      if (!sameTime) clock += 1;
      recs.push({ id: `${ORIGIN}/vault/e/r${String(n++).padStart(5, "0")}`, type: "t:Person", t: clock, size: 1000, ...extra });
    }
  };
  const touch = (r: Rec) => {
    clock += 1;
    r.t = clock;
  };
  const end = (r: Rec) => {
    clock += 1;
    r.ended = clock;
  };
  const revive = (r: Rec) => {
    clock += 1;
    delete r.ended;
    r.t = clock; // ingest's upsert sets updated_at = now() on the revive write (src/write/ingest.ts step 6)
  };
  return { p, recs, sent, add, touch, end, revive, setFeed: (on: boolean) => (feed = on) };
}

/** A small deterministic random source (so a failing case can be re-run). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const served = (f: ReturnType<typeof platform>) =>
  f.recs.filter((r) => !r.unreadable && !r.dropped && r.ended === undefined).sort((a, b) => b.t - a.t || (a.id < b.id ? -1 : 1)).map((r) => r.id);

describe("walkRecordPages, more gaps", () => {
  // The walk steps by nextOffset, never by row count; no record missed or repeated.
  it("200 seeded walks with random dropped rows and random byte-budget cuts: every readable row exactly once, in list order", async () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const f = platform({ budget: 5000 + Math.floor(r() * 60000) });
      f.add(Math.floor(r() * 450));
      for (const x of f.recs) {
        x.size = 200 + Math.floor(r() * 9000);
        if (r() < 0.08) x.dropped = true;
        if (r() < 0.05) x.unreadable = true;
      }
      const walk = await walkRecordPages(f.p, VAULT, ["Person"]);
      const ids = walk.rows.map((x) => x.entity);
      expect(ids, `seed ${seed}`).toEqual(served(f));
      expect(walk.complete, `seed ${seed}`).toBe(true);
      expect(walk.pages, `seed ${seed}`).toBe(f.sent.length);
    }
  });

  it("a page whose every row is dropped still moves on (nextOffset past them), and the rows after it are read", async () => {
    const f = platform();
    f.add(250);
    // newest first: the middle page (positions 100..199) is r149..r050 — drop all of it.
    for (const x of f.recs.slice(50, 150)) x.dropped = true;
    const walk = await walkRecordPages(f.p, VAULT, ["Person"]);
    expect(walk.rows).toHaveLength(150);
    expect(walk.complete).toBe(true);
    expect(f.sent.map((u) => new URL(u).searchParams.get("offset"))).toEqual([null, "100", "200"]);
  });

  it("a page whose nextOffset does not move forward ends the walk at once, not complete (no repeated page)", async () => {
    const sent: string[] = [];
    const stuck: PlatformClient = {
      origin: ORIGIN,
      fetch: (async (url: string) => {
        sent.push(url);
        const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
        return new Response(JSON.stringify({ records: [{ entity: `${ORIGIN}/vault/e/x${offset}`, typeUri: "t:Person" }], complete: false, offset, nextOffset: offset === 0 ? 5 : 5 }), { status: 200 });
      }) as PlatformClient["fetch"],
    };
    const walk = await walkRecordPages(stuck, VAULT, ["Person"]);
    expect(walk.complete).toBe(false);
    expect(sent).toHaveLength(2);
  });

  it("only an explicit complete: true ends the walk; a page that leaves complete out is walked on", async () => {
    const sent: string[] = [];
    const noFlag: PlatformClient = {
      origin: ORIGIN,
      fetch: (async (url: string) => {
        sent.push(url);
        const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
        const last = offset >= 100;
        return new Response(JSON.stringify({ records: [{ entity: `${ORIGIN}/vault/e/x${offset}`, typeUri: "t:Person" }], ...(last ? { complete: true } : {}), offset, nextOffset: offset + 100 }), { status: 200 });
      }) as PlatformClient["fetch"],
    };
    const walk = await walkRecordPages(noFlag, VAULT, ["Person"]);
    expect(sent).toHaveLength(2);
    expect(walk.complete).toBe(true);
    expect(walk.rows).toHaveLength(2);
  });

  it("a record larger than the budget is served alone, and the walk does not stall on it", async () => {
    const f = platform({ budget: 3000 });
    f.add(5);
    f.recs[2]!.size = 50_000;
    const walk = await walkRecordPages(f.p, VAULT, ["Person"]);
    expect(walk.rows.map((x) => x.entity)).toEqual(served(f));
    expect(walk.complete).toBe(true);
  });
});
