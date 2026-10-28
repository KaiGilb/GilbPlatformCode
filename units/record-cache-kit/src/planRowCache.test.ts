import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPatch, ensureEtag, ensureEtagUnchanged, liveRow, reconcileAfterConflict, storePlanRow } from "./planRowCache";
import { planRecordKey } from "./planFind";
import { recordsKey, type RecordsPage } from "./recordCaches";
import { setUp, tearDown } from "../test/support";
import { baseRow, entityUri, fakeDoor, gridRow, VAULT } from "../test/rows";

beforeEach(() => {
  setUp();
});
afterEach(() => {
  tearDown();
  vi.unstubAllGlobals();
});

function seedList(qc: QueryClient, rows: ReturnType<typeof gridRow>[]) {
  qc.setQueryData<InfiniteData<RecordsPage>>(recordsKey(VAULT), {
    pages: [{ records: rows, total: rows.length, complete: true, pageSize: 20, offset: 0 }],
    pageParams: [0],
  });
}
function listRows(qc: QueryClient) {
  return qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(VAULT))?.pages.flatMap((p) => p.records) ?? [];
}

describe("applyPatch", () => {
  it("writes the edited text of each slug, the served value, and the ETag it is given, on the row and on served", () => {
    const next = applyPatch(gridRow("a", { body: "old", keep: "k" }), { body: "new" }, '"e2"');
    expect(next.facts).toEqual({ body: "new", keep: "k" });
    expect(next.served?.facts.body).toBe("new");
    expect(next.etag).toBe('"e2"');
    expect(next.served?.etag).toBe('"e2"');
    expect(next.servedKeys).toEqual(["body", "keep"]);
    expect(applyPatch(gridRow("a", { body: "old" }), { extra: "x" }, null).servedKeys).toEqual(["body", "extra"]);
  });
  it("a null removes the fact, the served value and its servedKeys entry, and an opaque mark unless keepOpaque", () => {
    const row = { ...gridRow("a", { body: "old", x: "1" }), opaqueFacts: ["x"], servedKeys: ["body", "x"] };
    const gone = applyPatch(row, { x: null }, '"e2"');
    expect(gone.facts).toEqual({ body: "old" });
    expect(gone.servedKeys).toEqual(["body"]);
    expect(gone.served?.facts).not.toHaveProperty("x");
    expect(gone.opaqueFacts).toEqual([]);
    expect(gone.served?.facts).toEqual({ body: "old" });
    const kept = applyPatch(row, { x: null }, '"e2"', { keepOpaque: true });
    expect(kept.opaqueFacts).toEqual(["x"]);
  });
  it("a value that cannot be edited as text marks the slug opaque; a plain string clears the mark", () => {
    const row = gridRow("a", { body: "old" });
    const opaque = applyPatch(row, { rich: { nested: 1 } as never }, null);
    expect(opaque.opaqueFacts).toContain("rich");
    const cleared = applyPatch({ ...opaque, opaqueFacts: ["rich"] }, { rich: "plain" }, null);
    expect(cleared.opaqueFacts).not.toContain("rich");
    const sameKeep = applyPatch(row, { rich: { nested: 1 } as never }, null, { keepOpaque: true });
    expect(sameKeep.opaqueFacts).toEqual([]);
  });
  it("shows an @id value as its address, a list as its parts joined, and a number or boolean as text", () => {
    const next = applyPatch(gridRow("a"), { link: { "@id": "https://x.example.test/e/1" } as never, many: ["a", "b"] as never, n: 3 as never, t: true as never }, null);
    expect(next.facts).toMatchObject({ link: "https://x.example.test/e/1", many: "a, b", n: "3", t: "true" });
  });
  it("keeps the served prefixedKeys when it had them", () => {
    const row = { ...gridRow("a"), served: { facts: {}, context: undefined, etag: '"e1"', prefixedKeys: ["body"] } };
    expect(applyPatch(row, {}, null).served?.prefixedKeys).toEqual(["body"]);
    expect(applyPatch(gridRow("a"), {}, null).served).not.toHaveProperty("prefixedKeys");
  });
});

describe("liveRow", () => {
  it("is read when it is called, so a change made between two calls is seen by the second (never a snapshot)", () => {
    const qc = new QueryClient();
    const fallback = gridRow("a", { n: "fallback" }, '"e1"', 1);
    expect(liveRow(qc, VAULT, "a", fallback).facts.n).toBe("fallback");
    seedList(qc, [gridRow("a", { n: "listed" }, '"e1"', 9)]);
    expect(liveRow(qc, VAULT, "a", fallback).facts.n).toBe("listed");
    qc.setQueryData(planRecordKey("a", entityUri("a")), baseRow("a", { n: "re-read" }, '"e2"'));
    expect(liveRow(qc, VAULT, "a", fallback).facts.n).toBe("re-read");
  });
  it("a record read whose ETag differs from the list's is the re-read the list has not stored: it wins whatever the stamps say", () => {
    const qc = new QueryClient();
    seedList(qc, [gridRow("a", { n: "listed" }, '"e1"', 99)]);
    qc.setQueryData(planRecordKey("a", entityUri("a")), gridRow("a", { n: "re-read" }, '"e2"', 1));
    expect(liveRow(qc, VAULT, "a", gridRow("a", { n: "fallback" }, '"e0"', 50)).facts.n).toBe("re-read");
  });
  it("when the list row is older than the winner it catches the list up (it writes the cache)", () => {
    const qc = new QueryClient();
    seedList(qc, [gridRow("a", { n: "old" }, '"e1"', 5)]);
    const out = liveRow(qc, VAULT, "a", gridRow("a", { n: "saved" }, null, 10));
    expect(out.facts.n).toBe("saved");
    expect(listRows(qc)[0]!.facts.n).toBe("saved");
    expect(listRows(qc)[0]!.etag).toBeNull();
  });
  it("when the list row is the winner nothing is written", () => {
    const qc = new QueryClient();
    const listed = gridRow("a", { n: "listed" }, '"e1"', 10);
    seedList(qc, [listed]);
    const before = qc.getQueryData(recordsKey(VAULT));
    liveRow(qc, VAULT, "a", gridRow("a", { n: "fallback" }, '"e1"', 5));
    expect(qc.getQueryData(recordsKey(VAULT))).toBe(before);
  });
  it("on equal stamps a row with an ETag beats one without", () => {
    const qc = new QueryClient();
    seedList(qc, [gridRow("a", { n: "listed" }, '"e1"', 5)]);
    expect(liveRow(qc, VAULT, "a", gridRow("a", { n: "fallback" }, null, 5)).facts.n).toBe("listed");
  });
  it("on equal stamps the fallback with an ETag beats a list row without one, and the list is caught up", () => {
    const qc = new QueryClient();
    seedList(qc, [gridRow("a", { n: "listed" }, null, 5)]);
    const out = liveRow(qc, VAULT, "a", gridRow("a", { n: "fallback" }, '"e1"', 5));
    expect(out.facts.n).toBe("fallback");
    expect(listRows(qc)[0]!.facts.n).toBe("fallback");
  });
  it("finds a record read stored under another door when the direct key has none", () => {
    const qc = new QueryClient();
    qc.setQueryData(["base", "record", "a", "https://elsewhere.platform.example.test"], gridRow("a", { n: "other door" }, '"e5"', 20));
    expect(liveRow(qc, VAULT, "a", gridRow("a", { n: "fallback" }, '"e0"', 1)).facts.n).toBe("other door");
  });
  it("stamps a fallback that has no updatedAt as just read", () => {
    const qc = new QueryClient();
    const out = liveRow(qc, VAULT, "a", baseRow("a", { n: "x" }));
    expect(typeof out.updatedAt).toBe("number");
  });
});

describe("storePlanRow", () => {
  it("is a save by default and a create with insert", () => {
    const qc = new QueryClient();
    storePlanRow(qc, VAULT, baseRow("a"));
    expect(listRows(qc)).toEqual([]);
    storePlanRow(qc, VAULT, baseRow("a"), { insert: true });
    expect(listRows(qc).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("ensureEtag and reconcileAfterConflict", () => {
  it("a row with an ETag is returned as it is, with no read", async () => {
    const door = fakeDoor({});
    vi.stubGlobal("fetch", door.fetchMock);
    const row = gridRow("a");
    expect(await ensureEtag(new QueryClient(), VAULT, row)).toBe(row);
    expect(door.reads).toEqual([]);
  });
  it("a row without one is read; the read goes to the list that holds the row and to the record read", async () => {
    const door = fakeDoor({ a: { body: { "a:body": "stored" }, etag: '"e7"' } });
    vi.stubGlobal("fetch", door.fetchMock);
    const qc = new QueryClient();
    seedList(qc, [gridRow("a", { body: "stale" }, null, 1)]);
    const out = await ensureEtag(qc, VAULT, gridRow("a", { body: "stale" }, null, 1));
    expect(out?.etag).toBe('"e7"');
    expect(listRows(qc)[0]!.etag).toBe('"e7"');
    expect((qc.getQueryData(planRecordKey("a", entityUri("a"))) as { etag: string }).etag).toBe('"e7"');
  });
  it("a read that fails, or has no ETag, is null", async () => {
    vi.stubGlobal("fetch", fakeDoor({ a: { body: {} } }, new Set(["b"])).fetchMock);
    expect(await ensureEtag(new QueryClient(), VAULT, gridRow("a", {}, null))).toBeNull();
    expect(await ensureEtag(new QueryClient(), VAULT, gridRow("b", {}, null))).toBeNull();
  });
  it("a row with no address is not put under a record key", async () => {
    vi.stubGlobal("fetch", fakeDoor({ a: { body: {}, etag: '"e1"' } }).fetchMock);
    const qc = new QueryClient();
    const row = { ...gridRow("a", {}, null), entityUri: undefined };
    const out = await ensureEtag(qc, VAULT, row);
    expect(out?.etag).toBe('"e1"');
  });
  it("reconcileAfterConflict reads the record, stores it in the list and the record read, and returns it", async () => {
    vi.stubGlobal("fetch", fakeDoor({ a: { body: { "a:body": "theirs" }, etag: '"e8"' } }).fetchMock);
    const qc = new QueryClient();
    seedList(qc, [gridRow("a", { body: "mine" })]);
    const fresh = await reconcileAfterConflict(qc, VAULT, { id: "a", entityUri: entityUri("a") });
    expect(fresh?.facts.body).toBe("theirs");
    expect(listRows(qc)[0]!.facts.body).toBe("theirs");
    expect((qc.getQueryData(planRecordKey("a", entityUri("a"))) as { etag: string }).etag).toBe('"e8"');
  });
  it("reconcileAfterConflict on a record that is gone is null", async () => {
    vi.stubGlobal("fetch", fakeDoor({}).fetchMock);
    expect(await reconcileAfterConflict(new QueryClient(), VAULT, { id: "a" })).toBeNull();
  });
  it("ensureEtagUnchanged hands back the row unread when it has an ETag", async () => {
    const row = gridRow("a");
    expect(await ensureEtagUnchanged(new QueryClient(), VAULT, row, () => false)).toEqual({ row });
  });
});
