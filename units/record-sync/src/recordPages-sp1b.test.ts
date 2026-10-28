// Ported from `gilb-stakeholders` `test/recordPages-sp1b.test.ts` at 27fe0cef: 7 of its 7 tests (the others call symbols that are not in this unit).
import { describe, expect, it } from "vitest";
import { headRecordState, RecordListError, syncRecordChanges } from "./recordPages";
import { type PlatformClient } from "./platform";


const ORIGIN = "https://holder.platform.example.test";
const VAULT = `${ORIGIN}/vault`;

function fake(opts: { feed?: boolean; status?: number } = {}) {
  const feed = opts.feed ?? true;
  let clock = 100;
  const live: { id: string; t: number }[] = [];
  const ended: { id: string; t: number }[] = [];
  const seen: string[] = [];
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  const fetch = async (url: string): Promise<Response> => {
    seen.push(url);
    if (opts.status) return json(opts.status, { error: "boom", message: "boom" });
    const q = new URL(url).searchParams;
    const isEnded = q.get("lifecycle") === "ended";
    const since = q.get("since");
    if (!feed) return json(200, { records: [], complete: true });
    if (since === "head") return json(200, { records: [], complete: true, nextCursor: `c:${isEnded ? "e" : "l"}:${clock}` });
    const m = /^c:([el]):(\d+)$/.exec(since ?? "");
    if (!m || (m[1] === "e") !== isEnded) return json(400, { error: "since_cursor_invalid", message: "since must be the nextCursor this list returned to you for this vault, or the word start, or the word head", accepted: ["start", "head", "<nextCursor>"] });
    const pool = (isEnded ? ended : live).filter((r) => r.t > Number(m[2]));
    return json(200, {
      records: pool.map((r) => ({ entity: r.id, typeUri: "t:Person", label: r.id, updatedAt: null, ...(isEnded ? {} : { body: { "@id": r.id }, etag: `"${r.t}"` }) })),
      complete: true,
      nextCursor: `c:${isEnded ? "e" : "l"}:${clock}`,
    });
  };
  const platform: PlatformClient = { origin: ORIGIN, fetch: fetch as PlatformClient["fetch"] };
  return {
    platform,
    seen,
    change: (id: string) => live.push({ id, t: ++clock }),
    end: (id: string) => ended.push({ id, t: ++clock }),
  };
}

describe("headRecordState (C214-SP1b)", () => {
  it("takes both positions with since=head: 2 requests, no rows, never since=start", async () => {
    const f = fake();
    const state = await headRecordState(f.platform, VAULT, ["Person"]);
    expect(state).toEqual({ live: "c:l:100", ended: "c:e:100" });
    expect(f.seen).toHaveLength(2);
    expect(f.seen.every((u) => new URL(u).searchParams.get("since") === "head")).toBe(true);
  });

  it("answers null on a platform without the feed", async () => {
    expect(await headRecordState(fake({ feed: false }).platform, VAULT, ["Person"])).toBeNull();
  });
});

describe("syncRecordChanges (C214-SP1b)", () => {
  it("a quiet sync is 2 requests (live and ended) and brings nothing", async () => {
    const f = fake();
    const state = (await headRecordState(f.platform, VAULT, ["Person"]))!;
    f.seen.length = 0;
    const s = await syncRecordChanges(f.platform, VAULT, ["Person"], state);
    expect(s).toMatchObject({ kind: "changes", rows: [], ended: [], complete: true, pages: 2 });
    expect(f.seen).toHaveLength(2);
  });

  it("a change and a delete made after the head come back, with their documents, and the new positions", async () => {
    const f = fake();
    const state = (await headRecordState(f.platform, VAULT, ["Person"]))!;
    f.change(`${ORIGIN}/vault/e/a`);
    f.end(`${ORIGIN}/vault/e/b`);
    const s = (await syncRecordChanges(f.platform, VAULT, ["Person"], state))!;
    expect(s.rows.map((r) => [r.entity, r.body])).toEqual([[`${ORIGIN}/vault/e/a`, { "@id": `${ORIGIN}/vault/e/a` }]]);
    expect(s.ended).toEqual([`${ORIGIN}/vault/e/b`]);
    expect(s.state).toEqual({ live: "c:l:102", ended: "c:e:102" });
  });

  it("an invalid position answers null and never reads the list from the start", async () => {
    const f = fake();
    expect(await syncRecordChanges(f.platform, VAULT, ["Person"], { live: "c:l:x", ended: "c:e:1" })).toBeNull();
    expect(f.seen.some((u) => new URL(u).searchParams.get("since") === "start")).toBe(false);
    expect(f.seen).toHaveLength(1);
  });

  it("a platform without the feed answers null", async () => {
    expect(await syncRecordChanges(fake({ feed: false }).platform, VAULT, ["Person"], { live: "c:l:1", ended: "c:e:1" })).toBeNull();
  });

  it("another error is not swallowed", async () => {
    await expect(syncRecordChanges(fake({ status: 500 }).platform, VAULT, ["Person"], { live: "c:l:1", ended: "c:e:1" })).rejects.toBeInstanceOf(RecordListError);
  });
});
