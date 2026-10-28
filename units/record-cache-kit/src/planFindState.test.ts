import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAN_FIND_CAP,
  PLAN_FIND_PAGE,
  applyPinsAndDrops,
  dropPlanFind,
  invalidatePlanFind,
  loadPlanFind,
  pageAttributeIds,
  patchPlanFindRows,
  planFindKey,
  planFindRows,
  planRecordKey,
  prependPlanFind,
  readCached,
  type PlanFind,
} from "./planFind";
import { planReadLimit } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { QueryObserver } from "@tanstack/react-query";
import { setUp, tearDown } from "../test/support";
import { baseRow, entityUri, HOST, VAULT } from "../test/rows";

const PARENT = entityUri("parent");
const ATTR = "a:partOf";

let members: string[];
let texts: Map<string, string>;
let reads: string[];
let finds: URL[];
const fetchMock = vi.fn();

function serve(ids: string[]) {
  members = [...ids];
  texts = new Map(ids.map((id) => [id, `text ${id}`]));
  reads = [];
  finds = [];
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/base/find-by-attribute")) {
      const u = new URL(url);
      finds.push(u);
      const limit = Number(u.searchParams.get("limit") ?? "100");
      const offset = Number(u.searchParams.get("offset") ?? "0");
      return Response.json({ count: members.length, ids: members.slice(offset, offset + limit).map((id) => entityUri(id)) });
    }
    const m = /\/lws\/r\/([^?#]+)/.exec(url);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      reads.push(id);
      return new Response(JSON.stringify({ "@id": entityUri(id), "@type": "t:SpecificationElement", "a:body": texts.get(id) ?? "", "a:partOf": { "@id": PARENT } }), {
        status: 200,
        headers: { "content-type": "application/json", etag: `"v-${texts.get(id)}"` },
      });
    }
    return new Response("unexpected", { status: 500 });
  });
}

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const load = (qc: QueryClient, cap?: number) => loadPlanFind(qc, VAULT, ATTR, "parent", PARENT, cap);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setUp();
});
afterEach(() => {
  tearDown();
  vi.unstubAllGlobals();
});

describe("the keys", () => {
  it("planFindKey is one entry per vault, attribute and record", () => {
    expect(planFindKey("v", "a:partOf", "r")).toEqual(["plan-find", "v", "a:partOf", "r"]);
  });
  it("planRecordKey is the record by id under the door the address names", () => {
    expect(planRecordKey("r", entityUri("r"))).toEqual(["base", "record", "r", HOST]);
    expect(planRecordKey("r", null)).toEqual(["base", "record", "r", "https://platform.example.test"]);
  });
  it("the find is 100 to a page and one find shows 300", () => {
    expect(PLAN_FIND_PAGE).toBe(100);
    expect(PLAN_FIND_CAP).toBe(300);
  });
  it("planFindRows is the rows, or none", () => {
    expect(planFindRows(undefined)).toEqual([]);
    const rows = [baseRow("a")];
    expect(planFindRows({ rows, total: 1, capped: false, unread: 0 })).toBe(rows);
  });
});

describe("pageAttributeIds", () => {
  it("with a client, takes its slots from that client's read limit (blocked while the limiter is full)", async () => {
    serve(["a"]);
    const qc = client();
    const release: Array<() => void> = [];
    const holders = Array.from({ length: 6 }, () => planReadLimit(qc).run(() => new Promise<void>((r) => release.push(r))));
    const pending = pageAttributeIds("a:partOf", PARENT, HOST, { qc });
    await new Promise((r) => setTimeout(r, 30));
    expect(finds).toHaveLength(0);
    release.forEach((r) => r());
    await Promise.all(holders);
    expect((await pending).ids).toHaveLength(1);
    await pageAttributeIds("a:partOf", PARENT, HOST);
    expect(finds).toHaveLength(2);
  });
  it("asks a:partOf by {@id} and a:unitTag by the plain address, at the origin it is given", async () => {
    serve(["a"]);
    await pageAttributeIds("a:partOf", PARENT, HOST);
    await pageAttributeIds("a:unitTag", PARENT, HOST);
    expect(JSON.parse(finds[0]!.searchParams.get("value")!)).toEqual({ "@id": PARENT });
    expect(finds[1]!.searchParams.get("value")).toBe(PARENT);
    expect(finds[0]!.origin).toBe(HOST);
  });
  it("stops at opts.cap and says so, and with a client takes its slots from that client's read limit", async () => {
    serve(Array.from({ length: 250 }, (_, i) => `p${i}`));
    const found = await pageAttributeIds("a:partOf", PARENT, HOST, { cap: 100, qc: client() });
    expect(found.ids).toHaveLength(100);
    expect(found.capped).toBe(true);
    expect(found.count).toBe(250);
  });
  it("opts.until stops the walk at the first id it accepts", async () => {
    serve(Array.from({ length: 250 }, (_, i) => `p${i}`));
    const found = await pageAttributeIds("a:partOf", PARENT, HOST, { until: (id) => id.endsWith("/p5") });
    expect(found.ids.length).toBeLessThan(250);
    expect(found.ids).toContain(entityUri("p5"));
  });
});

describe("readCached", () => {
  it("not fresh: the cached row whatever its age, and a read only when there is none", async () => {
    serve(["a"]);
    const qc = client();
    qc.setQueryData(planRecordKey("a", entityUri("a")), baseRow("a", { body: "cached" }));
    expect((await readCached(qc, entityUri("a"), false))?.facts.body).toBe("cached");
    expect(reads).toEqual([]);
    expect((await readCached(client(), entityUri("a"), false))?.facts.body).toBe("text a");
    expect(reads).toEqual(["a"]);
  });
  it("fresh: a row read less than 15 s ago is kept, and an invalidated one is read again", async () => {
    serve(["a"]);
    const qc = client();
    await readCached(qc, entityUri("a"), true);
    await readCached(qc, entityUri("a"), true);
    expect(reads).toEqual(["a"]);
    texts.set("a", "changed");
    await qc.invalidateQueries({ queryKey: planRecordKey("a", entityUri("a")), refetchType: "none" });
    expect((await readCached(qc, entityUri("a"), true))?.facts.body).toBe("changed");
    expect(reads).toEqual(["a", "a"]);
  });
  it("a read that fails is null, not a throw", async () => {
    fetchMock.mockResolvedValue(new Response("no", { status: 500 }));
    expect(await readCached(client(), entityUri("a"), true)).toBeNull();
    expect(await readCached(client(), entityUri("a"), false)).toBeNull();
  });
});

describe("pins and drops", () => {
  it("a prepended row shows first at once, and a find that does not return it keeps it", async () => {
    serve(["a", "b"]);
    const qc = client();
    const pinned = baseRow("n", { body: "new line" });
    prependPlanFind(qc, VAULT, ATTR, "parent", pinned, { refresh: false });
    expect(qc.getQueryData<PlanFind>(planFindKey(VAULT, ATTR, "parent"))!.rows.map((r) => r.id)).toEqual(["n"]);
    const found = await load(qc);
    expect(found.rows.map((r) => r.id)).toEqual(["n", "a", "b"]);
    expect(found.total).toBe(2);
  });
  it("a pin the server returns is shown once, in the server's place, and its seeded record read is not read again", async () => {
    serve(["a", "n"]);
    const qc = client();
    prependPlanFind(qc, VAULT, ATTR, "parent", baseRow("n", { body: "pinned copy" }), { refresh: false });
    const found = await load(qc);
    expect(found.rows.map((r) => r.id)).toEqual(["a", "n"]);
    expect(found.rows.find((r) => r.id === "n")!.facts.body).toBe("pinned copy");
    expect(reads).toEqual(["a"]);
  });
  it("a pin belongs to its client: another client's find does not show it", async () => {
    serve(["a"]);
    const one = client();
    const two = client();
    prependPlanFind(one, VAULT, ATTR, "parent", baseRow("n"), { refresh: false });
    expect((await load(two)).rows.map((r) => r.id)).toEqual(["a"]);
    expect((await load(one)).rows.map((r) => r.id)).toEqual(["n", "a"]);
  });
  it("a pin belongs to its vault, attribute and parent", async () => {
    serve(["a"]);
    const qc = client();
    prependPlanFind(qc, VAULT, ATTR, "other-parent", baseRow("n"), { refresh: false });
    prependPlanFind(qc, VAULT, "a:unitTag", "parent", baseRow("m"), { refresh: false });
    prependPlanFind(qc, "https://x.platform.example.test/vault", ATTR, "parent", baseRow("k"), { refresh: false });
    expect((await load(qc)).rows.map((r) => r.id)).toEqual(["a"]);
  });
  it("prepending the same id twice keeps one pin, the latest, first", async () => {
    serve([]);
    const qc = client();
    prependPlanFind(qc, VAULT, ATTR, "parent", baseRow("n", { body: "one" }), { refresh: false });
    prependPlanFind(qc, VAULT, ATTR, "parent", baseRow("m"), { refresh: false });
    prependPlanFind(qc, VAULT, ATTR, "parent", baseRow("n", { body: "two" }), { refresh: false });
    const found = await load(qc);
    expect(found.rows.map((r) => [r.id, r.facts.body])).toEqual([["n", "two"], ["m", undefined]]);
  });
  it("refresh: false seeds the record read of the row; the default re-reads the find and seeds it after the stale mark", async () => {
    serve(["a"]);
    const qc = client();
    const row = baseRow("n", { body: "seeded" });
    prependPlanFind(qc, VAULT, ATTR, "parent", row, { refresh: false });
    expect(qc.getQueryData(planRecordKey("n", entityUri("n")))).toBe(row);
    expect(qc.getQueryState(planFindKey(VAULT, ATTR, "parent"))?.isInvalidated).toBe(false);
    const qc2 = client();
    prependPlanFind(qc2, VAULT, ATTR, "parent", row);
    await vi.waitFor(() => expect(qc2.getQueryState(planFindKey(VAULT, ATTR, "parent"))?.isInvalidated).toBe(true));
    await vi.waitFor(() => expect(qc2.getQueryData(planRecordKey("n", entityUri("n")))).toBe(row));
  });
  it("refresh: false leaves the find un-invalidated; a drop with the default marks it", async () => {
    serve(["a"]);
    const qc = client();
    const key = planFindKey(VAULT, ATTR, "parent");
    qc.setQueryData<PlanFind>(key, { rows: [baseRow("a")], total: 1, capped: false, unread: 0 });
    dropPlanFind(qc, VAULT, ATTR, "parent", "a", { refresh: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
    dropPlanFind(qc, VAULT, ATTR, "parent", "a");
    await vi.waitFor(() => expect(qc.getQueryState(key)?.isInvalidated).toBe(true));
  });
  it("a row without an address is shown but not seeded as a record read", () => {
    const qc = client();
    prependPlanFind(qc, VAULT, ATTR, "parent", { ...baseRow("n"), entityUri: undefined }, { refresh: false });
    expect(qc.getQueryCache().findAll({ queryKey: ["base", "record"] })).toHaveLength(0);
  });
  it("a dropped row leaves the line at once, and a later find that the server still returns it in leaves it out", async () => {
    serve(["a", "b"]);
    const qc = client();
    qc.setQueryData<PlanFind>(planFindKey(VAULT, ATTR, "parent"), { rows: [baseRow("a"), baseRow("b")], total: 2, capped: false, unread: 0 });
    dropPlanFind(qc, VAULT, ATTR, "parent", "a", { refresh: false });
    expect(qc.getQueryData<PlanFind>(planFindKey(VAULT, ATTR, "parent"))!.rows.map((r) => r.id)).toEqual(["b"]);
    expect((await load(qc)).rows.map((r) => r.id)).toEqual(["b"]);
  });
  it("a drop the server no longer returns is forgotten, so the same id can come back", async () => {
    serve(["a", "b"]);
    const qc = client();
    dropPlanFind(qc, VAULT, ATTR, "parent", "a", { refresh: false });
    members = ["b"];
    expect((await load(qc)).rows.map((r) => r.id)).toEqual(["b"]);
    members = ["a", "b"];
    expect((await load(qc)).rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("dropping a row takes away its pin; prepending it again takes away its drop", async () => {
    serve(["a"]);
    const qc = client();
    prependPlanFind(qc, VAULT, ATTR, "parent", baseRow("n"), { refresh: false });
    dropPlanFind(qc, VAULT, ATTR, "parent", "n", { refresh: false });
    expect((await load(qc)).rows.map((r) => r.id)).toEqual(["a"]);
    dropPlanFind(qc, VAULT, ATTR, "parent", "a", { refresh: false });
    prependPlanFind(qc, VAULT, ATTR, "parent", baseRow("a", { body: "back" }), { refresh: false });
    expect((await load(qc)).rows.map((r) => r.id)).toEqual(["a"]);
  });
  it("dropping from a find that has no cache entry makes none", () => {
    const qc = client();
    dropPlanFind(qc, VAULT, ATTR, "parent", "a", { refresh: false });
    expect(qc.getQueryData(planFindKey(VAULT, ATTR, "parent"))).toBeUndefined();
  });
  it("applyPinsAndDrops puts pins first, not twice, and subtracts only the drops the server still returns", () => {
    const qc = client();
    prependPlanFind(qc, VAULT, ATTR, "parent", baseRow("p1"), { refresh: false });
    prependPlanFind(qc, VAULT, ATTR, "parent", baseRow("p2"), { refresh: false });
    dropPlanFind(qc, VAULT, ATTR, "parent", "gone", { refresh: false });
    dropPlanFind(qc, VAULT, ATTR, "parent", "x", { refresh: false });
    const merged = applyPinsAndDrops(qc, VAULT, ATTR, "parent", [baseRow("p2"), baseRow("x"), baseRow("y")], new Set(["x", "y", "p2"]));
    expect(merged.map((r) => r.id)).toEqual(["p1", "p2", "y"]);
  });
});

describe("invalidatePlanFind and the member scope", () => {
  it("marks the named members stale, calls afterStale before it marks the find, and marks the find", async () => {
    serve(["a", "b"]);
    const qc = client();
    await readCached(qc, entityUri("a"), false);
    await readCached(qc, entityUri("b"), false);
    qc.setQueryData(planFindKey(VAULT, ATTR, "parent"), await load(qc));
    const order: string[] = [];
    await invalidatePlanFind(qc, VAULT, ATTR, "parent", {
      members: [entityUri("a")],
      afterStale: () => {
        order.push(`a:${qc.getQueryState(planRecordKey("a", entityUri("a")))?.isInvalidated}`);
        order.push(`b:${qc.getQueryState(planRecordKey("b", entityUri("b")))?.isInvalidated}`);
        order.push(`find:${qc.getQueryState(planFindKey(VAULT, ATTR, "parent"))?.isInvalidated}`);
      },
    });
    expect(order).toEqual(["a:true", "b:false", "find:false"]);
    expect(qc.getQueryState(planFindKey(VAULT, ATTR, "parent"))?.isInvalidated).toBe(true);
  });
  it("marking a member stale does not read it again while a screen is watching it", async () => {
    serve(["a"]);
    const qc = client();
    await readCached(qc, entityUri("a"), false);
    qc.setQueryData(planFindKey(VAULT, ATTR, "parent"), await load(qc));
    const observer = new QueryObserver(qc, { queryKey: planRecordKey("a", entityUri("a")), queryFn: async () => {
        watched += 1;
        return baseRow("a");
      },
      staleTime: Infinity,
    });
    let watched = 0;
    const off = observer.subscribe(() => {});
    reads.length = 0;
    const calls = fetchMock.mock.calls.length;
    await invalidatePlanFind(qc, VAULT, ATTR, "parent", { members: [entityUri("a")] });
    await new Promise((r) => setTimeout(r, 20));
    expect(reads).toEqual([]);
    expect(watched).toBe(0);
    expect(fetchMock.mock.calls.length).toBe(calls);
    off();
  });
  it("with no members named, every member the find shows is marked stale; [] marks none", async () => {
    serve(["a", "b"]);
    const qc = client();
    qc.setQueryData(planFindKey(VAULT, ATTR, "parent"), await load(qc));
    await invalidatePlanFind(qc, VAULT, ATTR, "parent", { members: [] });
    expect(qc.getQueryState(planRecordKey("a", entityUri("a")))?.isInvalidated).toBe(false);
    await invalidatePlanFind(qc, VAULT, ATTR, "parent");
    expect(qc.getQueryState(planRecordKey("a", entityUri("a")))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(planRecordKey("b", entityUri("b")))?.isInvalidated).toBe(true);
  });
  it("the next re-read of the find reads fresh only the members named, and keeps the rest on their cached rows", async () => {
    serve(["a", "b"]);
    const qc = client();
    qc.setQueryData(planFindKey(VAULT, ATTR, "parent"), await load(qc));
    reads.length = 0;
    texts.set("a", "A changed");
    texts.set("b", "B changed");
    await invalidatePlanFind(qc, VAULT, ATTR, "parent", { members: [entityUri("a")] });
    const found = await load(qc);
    expect(reads).toEqual(["a"]);
    expect(found.rows.map((r) => r.facts.body)).toEqual(["A changed", "text b"]);
  });
  it("a re-read of a find that was not named by invalidatePlanFind marks every member of the fresh page", async () => {
    serve(["a", "b"]);
    const qc = client();
    qc.setQueryData(planFindKey(VAULT, ATTR, "parent"), await load(qc));
    reads.length = 0;
    texts.set("a", "A changed");
    texts.set("b", "B changed");
    await qc.invalidateQueries({ queryKey: planFindKey(VAULT, ATTR, "parent"), refetchType: "none" });
    const found = await load(qc);
    expect(found.rows.map((r) => r.facts.body)).toEqual(["A changed", "B changed"]);
    expect(reads.sort()).toEqual(["a", "b"]);
  });
  it("the narrowed scope is used once: the next re-read after it reads every member", async () => {
    serve(["a", "b"]);
    const qc = client();
    qc.setQueryData(planFindKey(VAULT, ATTR, "parent"), await load(qc));
    await invalidatePlanFind(qc, VAULT, ATTR, "parent", { members: [entityUri("a")] });
    await load(qc);
    reads.length = 0;
    await qc.invalidateQueries({ queryKey: planFindKey(VAULT, ATTR, "parent"), refetchType: "none" });
    await load(qc);
    expect(reads.sort()).toEqual(["a", "b"]);
  });
  it("the scope belongs to its client", async () => {
    serve(["a", "b"]);
    const one = client();
    const two = client();
    for (const qc of [one, two]) qc.setQueryData(planFindKey(VAULT, ATTR, "parent"), await load(qc));
    await invalidatePlanFind(one, VAULT, ATTR, "parent", { members: [entityUri("a")] });
    await two.invalidateQueries({ queryKey: planFindKey(VAULT, ATTR, "parent"), refetchType: "none" });
    reads.length = 0;
    await load(two);
    expect(reads.sort()).toEqual(["a", "b"]);
  });
});

describe("patchPlanFindRows", () => {
  it("shows a patched record on every line of the vault that holds it, in the pins, and in its record reads", async () => {
    serve(["a"]);
    const qc = client();
    const keyA = planFindKey(VAULT, ATTR, "p1");
    const keyB = planFindKey(VAULT, ATTR, "p2");
    const keyOther = planFindKey("https://x.platform.example.test/vault", ATTR, "p1");
    for (const k of [keyA, keyB, keyOther]) qc.setQueryData<PlanFind>(k, { rows: [baseRow("a", { body: "old" }), baseRow("z", { body: "z" })], total: 2, capped: false, unread: 0 });
    qc.setQueryData(planRecordKey("a", entityUri("a")), baseRow("a", { body: "old" }));
    prependPlanFind(qc, VAULT, ATTR, "p1", baseRow("a", { body: "old" }), { refresh: false });
    patchPlanFindRows(qc, VAULT, "a", (row) => ({ ...row, facts: { ...row.facts, body: "new" } }));
    expect(qc.getQueryData<PlanFind>(keyA)!.rows.map((r) => r.facts.body)).toEqual(["new", "z"]);
    expect(qc.getQueryData<PlanFind>(keyB)!.rows.map((r) => r.facts.body)).toEqual(["new", "z"]);
    expect(qc.getQueryData<PlanFind>(keyOther)!.rows.map((r) => r.facts.body)).toEqual(["old", "z"]);
    expect((qc.getQueryData(planRecordKey("a", entityUri("a"))) as { facts: { body: string } }).facts.body).toBe("new");
    serve([]);
    const found = await loadPlanFind(qc, VAULT, ATTR, "p1", PARENT);
    expect(found.rows.find((r) => r.id === "a")!.facts.body).toBe("new");
  });
  it("leaves a line that does not hold the record as it was (the same object), and an empty record read empty", () => {
    const qc = client();
    const data: PlanFind = { rows: [baseRow("z")], total: 1, capped: false, unread: 0 };
    qc.setQueryData(planFindKey(VAULT, ATTR, "p1"), data);
    qc.setQueryData(["base", "record", "a", HOST], null);
    patchPlanFindRows(qc, VAULT, "a", (row) => ({ ...row, facts: { body: "x" } }));
    expect(qc.getQueryData(planFindKey(VAULT, ATTR, "p1"))).toBe(data);
    expect(qc.getQueryData(["base", "record", "a", HOST])).toBeNull();
  });
  it("does not touch a pin of another vault whose key starts with this vault's text but not its separator", async () => {
    const qc = client();
    prependPlanFind(qc, `${VAULT}x`, ATTR, "p1", baseRow("a", { body: "old" }), { refresh: false });
    patchPlanFindRows(qc, VAULT, "a", (row) => ({ ...row, facts: { body: "new" } }));
    expect(qc.getQueryData<PlanFind>(planFindKey(`${VAULT}x`, ATTR, "p1"))!.rows[0]!.facts.body).toBe("old");
    serve([]);
    expect((await loadPlanFind(qc, `${VAULT}x`, ATTR, "p1", PARENT)).rows[0]!.facts.body).toBe("old");
  });
});

describe("loadPlanFind", () => {
  it("on a short page the total is how many ids came back, not the count the server named", async () => {
    serve(["a", "b"]);
    fetchMock.mockImplementationOnce(async () => Response.json({ count: 999, ids: [entityUri("a"), entityUri("b")] }));
    const found = await load(client());
    expect({ total: found.total, capped: found.capped, cap: found.cap }).toEqual({ total: 2, capped: false, cap: PLAN_FIND_CAP });
  });
  it("shows one row for an id met twice, and counts a record that did not read as unread", async () => {
    serve(["a", "b", "c"]);
    fetchMock.mockImplementationOnce(async () => Response.json({ count: 4, ids: [entityUri("a"), entityUri("a"), entityUri("b"), entityUri("c")] }));
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => (String(input).includes("/lws/r/b") ? new Response("no", { status: 500 }) : base(input)));
    fetchMock.mockImplementationOnce(async () => Response.json({ count: 4, ids: [entityUri("a"), entityUri("a"), entityUri("b"), entityUri("c")] }));
    const found = await load(client());
    expect(found.rows.map((r) => r.id)).toEqual(["a", "c"]);
    expect(found.unread).toBe(1);
  });
  it("shows one row when two addresses read the same record id", async () => {
    serve(["a"]);
    const other = "https://other.platform.example.test";
    fetchMock.mockImplementationOnce(async () => Response.json({ count: 2, ids: [entityUri("a"), entityUri("a", other)] }));
    const base = fetchMock.getMockImplementation()!;
    void base;
    const found = await load(client());
    expect(found.rows.map((r) => r.id)).toEqual(["a"]);
    expect(found.unread).toBe(0);
  });
  it("a cap given to the call is the cap the answer reports", async () => {
    serve(Array.from({ length: 250 }, (_, i) => `p${i}`));
    const found = await load(client(), 100);
    expect({ rows: found.rows.length, capped: found.capped, total: found.total, cap: found.cap }).toEqual({ rows: 100, capped: true, total: 250, cap: 100 });
  });
});
