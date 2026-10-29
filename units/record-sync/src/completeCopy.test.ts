// completeCopy over a fake platform that answers as GilbPlatform's record list does (src/lws/records.ts, as read in the live check of 2026-10-29):
//   include=body pages of at most `pageSize` rows, newest first, `nextOffset`; `after=<cursor>` bookmark paging of that list (one type, never with
//   offset or since), `nextCursor` on a page with more rows behind it; `since=head` names the position and serves no rows; `since=<cursor>` serves
//   records written after it, oldest first, with `nextCursor`; a cursor this fake did not seal is 400 `since_cursor_invalid`.
// Ported from Social's p153-vault-paging.test.ts (completeCopy block) and tester-s1-completeCopy.test.ts (C1-C11) at a1f65a5b, with the rig rebuilt here.
import { describe, expect, it } from "vitest";
import { completeCopy, PlatformLacks } from "./completeCopy";
import { PlatformError, type PlatformClient } from "./platform";
import { RecordListError } from "./recordPages";

const ORIGIN = "https://holder.platform.example.test";
const VAULT = `${ORIGIN}/vault`;

interface Rec {
  id: string;
  type: string;
  facts: Record<string, unknown>;
  at: number;
}
interface Opts {
  pageSize?: number;
  refuseAfter?: boolean;
  invalidCursorOnce?: boolean;
  onList?: (url: URL, n: number) => void;
}

const many = (n: number, type = "t:Thing"): Rec[] => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, type, facts: { n: i }, at: 1000 + i }));
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function rig(records: Rec[], o: Opts = {}, wrap?: (f: typeof fetch) => typeof fetch) {
  const store = new Map<string, Rec>(records.map((r) => [r.id, r]));
  let clock = 1000 + records.length + 1000;
  const tick = () => ++clock;
  const urls: URL[] = [];
  let listed = 0;
  const pageSize = o.pageSize ?? 200;
  const row = (r: Rec) => ({ entity: `${VAULT}/e/${r.id}`, typeUri: r.type, updatedAt: new Date(r.at).toISOString(), body: { "@id": `${VAULT}/e/${r.id}`, ...r.facts }, etag: `"v${r.at}"` });
  const inner = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input));
    urls.push(url);
    o.onList?.(url, ++listed);
    const q = url.searchParams;
    const type = `t:${q.get("type")}`;
    const limit = Math.min(pageSize, Math.max(1, Number(q.get("limit") ?? pageSize)));
    const filter = q.get("filter");
    let attr = "";
    let want = "";
    if (filter !== null) {
      const eq = filter.indexOf("=");
      attr = filter.slice(0, eq).replace(/^a:/, "");
      want = filter.slice(eq + 1);
    }
    const mine = [...store.values()].filter((r) => r.type === type && (filter === null || String(r.facts[attr]) === want));
    const head = Math.max(0, ...[...store.values()].map((r) => r.at));
    if (q.has("since")) {
      if (q.has("offset")) return json(400, { error: "since_with_offset" });
      const s = q.get("since")!;
      if (s === "head") return json(200, { records: [], complete: true, nextCursor: `s${head}` });
      const m = /^s(\d+)$/.exec(s);
      const from = s === "start" ? 0 : m ? Number(m[1]) : null;
      if (o.invalidCursorOnce && s !== "start") {
        o.invalidCursorOnce = false;
        return json(400, { error: "since_cursor_invalid", message: "x" });
      }
      if (from === null || from > head) return json(400, { error: "since_cursor_invalid" });
      const later = mine.filter((r) => r.at > from).sort((a, b) => a.at - b.at);
      const page = later.slice(0, limit);
      const more = later.length > limit;
      return json(200, { records: page.map(row), complete: !more, nextCursor: `s${more ? page[page.length - 1]!.at : head}` });
    }
    const sorted = mine.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
    let start = Number(q.get("offset") ?? 0);
    if (q.has("after")) {
      if (q.has("offset")) return json(400, { error: "after_with_offset" });
      if (o.refuseAfter) return json(400, { error: "unknown_parameter: after" });
      const m = /^b(\d+):(.*)$/.exec(q.get("after")!);
      if (!m) return json(400, { error: "after_cursor_invalid" });
      const at = Number(m[1]);
      start = sorted.findIndex((r) => r.at < at || (r.at === at && r.id > m[2]!));
      if (start < 0) start = sorted.length;
    }
    const page = sorted.slice(start, start + limit);
    const more = start + limit < sorted.length;
    const last = page[page.length - 1];
    return json(200, { records: page.map(row), complete: !more, ...(q.has("after") ? {} : { nextOffset: start + page.length }), ...(more && last ? { nextCursor: `b${last.at}:${last.id}` } : {}) });
  }) as typeof fetch;
  const platform: PlatformClient = { origin: ORIGIN, fetch: wrap ? wrap(inner) : inner };
  const put = (id: string, facts: Record<string, unknown>, type = "t:Thing") => store.set(id, { id, type, facts, at: tick() });
  return { platform, urls, store, put, tick };
}

const kind = (u: URL) => (u.searchParams.get("since") === "head" ? "head" : u.searchParams.has("since") ? "since" : u.searchParams.has("after") ? "after" : "first");
const ids = (rows: Array<{ entity: string }>) => rows.map((r) => r.entity.replace(/^.*\/e\//, ""));

describe("completeCopy: the recipe", () => {
  it("order: since=head FIRST (nothing else on it), the walk, then ONE since=<kept head>", async () => {
    const r = rig(many(450));
    const copy = await completeCopy(r.platform, VAULT, "Thing");
    expect(r.urls.map(kind)).toEqual(["head", "first", "after", "after", "since"]);
    expect([...r.urls[0]!.searchParams.keys()].sort()).toEqual(["since", "type"]);
    expect(r.urls.filter((u) => kind(u) === "head" || kind(u) === "since")).toHaveLength(2);
    expect(copy.records).toHaveLength(450);
    expect(new Set(ids(copy.records)).size).toBe(450);
    expect(copy.records[0]!.body).toBeTruthy();
    expect(copy.records[0]!.etag).toBeTruthy();
    expect(copy.truncated).toBeUndefined();
  });

  it("each after= is the nextCursor of the page before, and the since pass sends the head the head request answered", async () => {
    const r = rig(many(450));
    const { cursor } = await completeCopy(r.platform, VAULT, "Thing");
    const afters = r.urls.filter((u) => kind(u) === "after").map((u) => u.searchParams.get("after"));
    expect(new Set(afters).size).toBe(afters.length);
    expect(afters.every((a) => /^b\d+:/.test(a!))).toBe(true);
    const sinceReq = r.urls.find((u) => kind(u) === "since")!;
    expect(sinceReq.searchParams.get("since")).toBe("s1449");
    expect(cursor).toBe("s1449");
  });

  it("never an offset: a 1050-row list is copied with ZERO offset= parameters, in 6 walk pages of 200", async () => {
    const r = rig(many(1050));
    const { records } = await completeCopy(r.platform, VAULT, "Thing");
    expect(records).toHaveLength(1050);
    expect(r.urls.some((u) => u.searchParams.has("offset"))).toBe(false);
    expect(r.urls.filter((u) => kind(u) === "first" || kind(u) === "after")).toHaveLength(6);
  });

  it("exactly one type= on every request, include=body and limit=200 on the walk, bare type name for t:Thing", async () => {
    const r = rig(many(450));
    await completeCopy(r.platform, VAULT, "t:Thing");
    expect(r.urls.every((u) => u.searchParams.getAll("type").join() === "Thing")).toBe(true);
    for (const u of r.urls.filter((x) => kind(x) === "first" || kind(x) === "after")) {
      expect(u.searchParams.get("include")).toBe("body");
      expect(u.searchParams.get("limit")).toBe("200");
    }
    expect(r.urls[0]!.pathname).toBe("/vault/records".replace("/vault", `/lws/vault/${encodeURIComponent(VAULT)}`));
  });

  it("the closing since pass merges a row created AND a row updated during the walk: both once, on top, with the new body", async () => {
    const r = rig(many(450), {
      onList: (_u, n) => {
        if (n === 3) {
          r.put("mid", { n: "new" });
          r.store.get("t5")!.facts = { n: "edited" }; // deep in the list: the walk has not served it
          r.store.get("t5")!.at = r.tick();
        }
      },
    });
    const { records, cursor } = await completeCopy(r.platform, VAULT, "Thing");
    const got = ids(records);
    expect(new Set(got).size).toBe(got.length);
    expect(got).toHaveLength(451);
    expect((records.find((x) => x.entity.endsWith("/t5"))!.body as { n: unknown }).n).toBe("edited");
    expect(got.slice(0, 2).sort()).toEqual(["mid", "t5"]);
    expect(r.urls.filter((u) => kind(u) === "since")).toHaveLength(1);
    expect(cursor).toMatch(/^s\d+$/);
  });

  it("a row written during the walk, which the walk would skip, is caught by the one since pass, once", async () => {
    const r = rig(many(450), { onList: (_u, n) => { if (n === 3) r.put("mid", { n: -1 }); } });
    const { records } = await completeCopy(r.platform, VAULT, "Thing");
    expect(ids(records).filter((x) => x === "mid")).toHaveLength(1);
    expect(records).toHaveLength(451);
  });

  it("the closing since pass follows its own nextCursor when it is not complete (pageLimit does not shrink it: 200 a page)", async () => {
    const r = rig(many(10), { pageSize: 2, onList: (_u, n) => { if (n === 2) for (let i = 0; i < 5; i++) r.put(`late${i}`, { n: "late" }); } });
    const { records } = await completeCopy(r.platform, VAULT, "Thing", { pageLimit: 2 });
    expect(records).toHaveLength(15);
    expect(r.urls.filter((u) => kind(u) === "since").length).toBeGreaterThan(1);
  });
});

describe("completeCopy: filter", () => {
  const odd = () => many(120).map((x) => ({ ...x, facts: { n: x.facts.n, kind: (x.facts.n as number) % 2 ? "odd" : "even" } }));

  it("the walk carries filter= and after; head and the since pass carry none; the result holds only matching rows", async () => {
    const r = rig(odd());
    const { records } = await completeCopy(r.platform, VAULT, "Thing", { filter: { attribute: "a:kind", value: "odd" } });
    expect(records).toHaveLength(60);
    for (const u of r.urls) {
      if (kind(u) === "head" || kind(u) === "since") expect(u.searchParams.has("filter")).toBe(false);
      if (kind(u) === "first" || kind(u) === "after") expect(u.searchParams.get("filter")).toBe("a:kind=odd");
    }
  });

  it("a row changed during the walk to no longer match leaves the copy", async () => {
    const r = rig(odd(), { onList: (_u, n) => { if (n === 2) { r.store.get("t1")!.facts = { n: 1, kind: "even" }; r.store.get("t1")!.at = r.tick(); } } });
    const { records } = await completeCopy(r.platform, VAULT, "Thing", { filter: { attribute: "a:kind", value: "odd" } });
    expect(ids(records)).not.toContain("t1");
    expect(records).toHaveLength(59);
  });

  it("a string value the platform reads as JSON is refused before anything is sent", async () => {
    const r = rig(odd());
    await expect(completeCopy(r.platform, VAULT, "Thing", { filter: { attribute: "a:kind", value: "[1]" } })).rejects.toBeInstanceOf(PlatformError);
    expect(r.urls).toHaveLength(0);
  });
});

describe("completeCopy: caps and partial copies", () => {
  it("maxPages: the walk stops at that many pages and says truncated; the since pass still runs", async () => {
    const r = rig(many(1000));
    const got = await completeCopy(r.platform, VAULT, "Thing", { maxPages: 4 });
    expect(got.truncated).toBe(true);
    expect(got.records).toHaveLength(400);
    expect(r.urls.filter((u) => kind(u) === "first" || kind(u) === "after")).toHaveLength(2);
    expect(kind(r.urls[r.urls.length - 1]!)).toBe("since");
  });

  it("maxPages is also a bound in rows (maxPages x 100), as Social has it: maxPages 2 stops after one page of 200", async () => {
    const r = rig(many(1000));
    const got = await completeCopy(r.platform, VAULT, "Thing", { maxPages: 2 });
    expect(got.truncated).toBe(true);
    expect(got.records).toHaveLength(200);
  });

  it("a copy within maxPages is not truncated", async () => {
    const got = await completeCopy(rig(many(150)).platform, VAULT, "Thing", { maxPages: 2 });
    expect(got.truncated).toBeUndefined();
    expect(got.records).toHaveLength(150);
  });

  it("pageLimit is sent as limit= and clamped to 1..200", async () => {
    const r = rig(many(30));
    await completeCopy(r.platform, VAULT, "Thing", { pageLimit: 500 });
    expect(r.urls.find((u) => kind(u) === "first")!.searchParams.get("limit")).toBe("200");
    const r2 = rig(many(30));
    const got = await completeCopy(r2.platform, VAULT, "Thing", { pageLimit: 10 });
    expect(r2.urls.find((u) => kind(u) === "first")!.searchParams.get("limit")).toBe("10");
    expect(got.records).toHaveLength(30);
  });

  const failSince = (f: typeof fetch) => (async (i: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(i));
    if (u.searchParams.has("since") && u.searchParams.get("since") !== "head") return new Response("{}", { status: 503 });
    return f(i, init);
  }) as typeof fetch;

  it("partialOk: when the since pass fails the copy comes back truncated with the reason; without partialOk it throws", async () => {
    const a = rig(many(50), {}, failSince);
    const got = await completeCopy(a.platform, VAULT, "Thing", { partialOk: true });
    expect(got.truncated).toBe(true);
    expect(got.reason).toBeTruthy();
    expect(got.records).toHaveLength(50);
    const b = rig(many(50), {}, failSince);
    await expect(completeCopy(b.platform, VAULT, "Thing")).rejects.toBeInstanceOf(RecordListError);
  });

  it("partialOk: a walk page that fails after some rows keeps those rows, truncated; with nothing read it still throws", async () => {
    const failSecond = (f: typeof fetch) => (async (i: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(i)).searchParams.has("after")) return new Response("{}", { status: 503 });
      return f(i, init);
    }) as typeof fetch;
    const a = rig(many(450), {}, failSecond);
    // an `after` that fails with 5xx is not "refused" (only 400 is): the walk throws, and partialOk keeps the first page
    const got = await completeCopy(a.platform, VAULT, "Thing", { partialOk: true });
    expect(got.truncated).toBe(true);
    expect(got.records.length).toBeGreaterThanOrEqual(200);
    const none = rig(many(450), {}, (f) => (async (i: RequestInfo | URL, init?: RequestInit) => (String(i).includes("include=body") ? new Response("{}", { status: 503 }) : f(i, init))) as typeof fetch);
    await expect(completeCopy(none.platform, VAULT, "Thing", { partialOk: true })).rejects.toBeInstanceOf(RecordListError);
  });
});

describe("completeCopy: what the platform refuses", () => {
  it("400 since_cursor_invalid on the kept head: the pass restarts from start, replaces the walk, no duplicates", async () => {
    const r = rig(many(450), { invalidCursorOnce: true });
    const { records, cursor } = await completeCopy(r.platform, VAULT, "Thing");
    const sinces = r.urls.filter((u) => kind(u) === "since").map((u) => u.searchParams.get("since"));
    expect(sinces[0]).toMatch(/^s\d+$/);
    expect(sinces).toContain("start");
    expect(records).toHaveLength(450);
    expect(new Set(ids(records)).size).toBe(450);
    expect(cursor).toMatch(/^s\d+$/);
  });

  it("a second refusal after the restart is an error (RecordListError with code since_cursor_invalid)", async () => {
    const always = (f: typeof fetch) => (async (i: RequestInfo | URL, init?: RequestInit) => {
      const s = new URL(String(i)).searchParams.get("since");
      return s !== null && s !== "head" ? json(400, { error: "since_cursor_invalid" }) : f(i, init);
    }) as typeof fetch;
    const r = rig(many(5), {}, always);
    const err = await completeCopy(r.platform, VAULT, "Thing").catch((e) => e);
    expect(err).toBeInstanceOf(RecordListError);
    expect((err as RecordListError).code).toBe("since_cursor_invalid");
  });

  it("a platform that refuses after= (400): the walk goes on by offset, still complete, with head and since around it", async () => {
    const r = rig(many(450), { refuseAfter: true });
    const { records } = await completeCopy(r.platform, VAULT, "Thing");
    expect(records).toHaveLength(450);
    expect(new Set(ids(records)).size).toBe(450);
    const k = r.urls.map(kind);
    expect(k[0]).toBe("head");
    expect(k[k.length - 1]).toBe("since");
    expect(r.urls.filter((u) => kind(u) === "after")).toHaveLength(1); // one try
    expect(r.urls.filter((u) => u.searchParams.has("offset")).map((u) => u.searchParams.get("offset"))).toEqual(["200", "400"]);
  });

  it("an after= cursor refused mid-walk (400 after_cursor_invalid): the copy is read again by offset, complete, no duplicates", async () => {
    let afters = 0;
    const refuseOnce = (f: typeof fetch) => (async (i: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(i)).searchParams.has("after") && ++afters === 2) return json(400, { error: "after_cursor_invalid" });
      return f(i, init);
    }) as typeof fetch;
    const r = rig(many(850), {}, refuseOnce);
    const { records } = await completeCopy(r.platform, VAULT, "Thing");
    expect(records).toHaveLength(850);
    expect(new Set(ids(records)).size).toBe(850);
  });

  it("a platform that ignores after= and serves the first page again is walked by offset", async () => {
    const ignoreAfter = (f: typeof fetch) => (async (i: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(i));
      if (u.searchParams.has("after")) { u.searchParams.delete("after"); return f(u.toString(), init); }
      return f(i, init);
    }) as typeof fetch;
    const r = rig(many(450), {}, ignoreAfter);
    const { records } = await completeCopy(r.platform, VAULT, "Thing");
    expect(records).toHaveLength(450);
    expect(new Set(ids(records)).size).toBe(450);
  });

  it("a platform that ignores since= (head names no position) is PlatformLacks, not a copy with no catch-up position", async () => {
    const ignore = (f: typeof fetch) => (async (i: RequestInfo | URL, init?: RequestInit) => {
      const res = await f(i, init);
      if (new URL(String(i)).searchParams.get("since") !== "head") return res;
      const j = (await res.json()) as Record<string, unknown>;
      delete j.nextCursor;
      return json(200, j);
    }) as typeof fetch;
    const r = rig(many(10), {}, ignore);
    const err = await completeCopy(r.platform, VAULT, "Thing").catch((e) => e);
    expect(err).toBeInstanceOf(PlatformLacks);
    expect(err).toBeInstanceOf(PlatformError);
    expect((err as PlatformLacks).name).toBe("PlatformLacks");
    expect(r.urls).toHaveLength(1);
  });

  it("a platform that answers since=head 400 is PlatformLacks; one that answers include=body 400 'include' is PlatformLacks", async () => {
    const noSince = (f: typeof fetch) => (async (i: RequestInfo | URL, init?: RequestInit) => (new URL(String(i)).searchParams.get("since") === "head" ? json(400, { error: "unknown_parameter: since" }) : f(i, init))) as typeof fetch;
    await expect(completeCopy(rig(many(3), {}, noSince).platform, VAULT, "Thing")).rejects.toBeInstanceOf(PlatformLacks);
    const noInclude = (f: typeof fetch) => (async (i: RequestInfo | URL, init?: RequestInit) => (new URL(String(i)).searchParams.has("include") ? json(400, { error: "bad include" }) : f(i, init))) as typeof fetch;
    await expect(completeCopy(rig(many(3), {}, noInclude).platform, VAULT, "Thing")).rejects.toBeInstanceOf(PlatformLacks);
  });

  it("any other non-200 on the head is a RecordListError with its status", async () => {
    const down = (f: typeof fetch) => (async () => json(503, { error: "down" })) as unknown as typeof fetch;
    const err = await completeCopy(rig(many(3), {}, down).platform, VAULT, "Thing").catch((e) => e);
    expect(err).toBeInstanceOf(RecordListError);
    expect((err as RecordListError).status).toBe(503);
  });
});
