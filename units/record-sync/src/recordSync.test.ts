// New tests: the exports of recordPages.ts, pinned over a fake platform.
import { describe, expect, it } from "vitest";
import { PlatformError, type PlatformClient } from "./platform";
import { RECORD_PAGE_LIMIT, RecordListError, headRecordState, syncRecordChanges, type RecordSyncState } from "./recordPages";

const ORIGIN = "https://holder.platform.example.test";
const VAULT = `${ORIGIN}/vault`;
type Reply = { status?: number; body?: unknown; text?: string };
function platformOf(reply: (u: URL) => Reply) {
  const seen: URL[] = [];
  const platform: PlatformClient = {
    origin: ORIGIN,
    fetch: async (url) => {
      const u = new URL(url);
      seen.push(u);
      const r = reply(u);
      return new Response(r.text ?? JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
    },
  };
  return { platform, seen };
}
async function thrown<T = RecordListError>(p: Promise<unknown>): Promise<T> {
  try {
    await p;
  } catch (e) {
    return e as T;
  }
  throw new Error("did not throw");
}
const STATE: RecordSyncState = { live: "L1", ended: "E1" };

describe("RECORD_PAGE_LIMIT", () => {
  it("is 100, the most rows one full-row page carries", () => {
    expect(RECORD_PAGE_LIMIT).toBe(100);
  });
});

describe("the request a feed read sends", () => {
  it("the live list asks for since, include=body and the limit; the ended list for since and lifecycle=ended; every type once", async () => {
    const p = platformOf(() => ({ body: { records: [], complete: true, nextCursor: "N" } }));
    await syncRecordChanges(p.platform, VAULT, ["Person", "Org"], STATE);
    const [live, ended] = p.seen;
    expect(live!.origin + live!.pathname).toBe(`${ORIGIN}/lws/vault/${encodeURIComponent(VAULT)}/records`);
    expect(live!.searchParams.getAll("type")).toEqual(["Person", "Org"]);
    expect(live!.searchParams.get("since")).toBe("L1");
    expect(live!.searchParams.get("include")).toBe("body");
    expect(live!.searchParams.get("limit")).toBe("100");
    expect(live!.searchParams.has("lifecycle")).toBe(false);
    expect(ended!.searchParams.get("since")).toBe("E1");
    expect(ended!.searchParams.get("lifecycle")).toBe("ended");
    expect(ended!.searchParams.has("include")).toBe(false);
    expect(ended!.searchParams.has("limit")).toBe(false);
  });
  it("headRecordState asks the live and the ended list for since=head, in one round", async () => {
    const p = platformOf(() => ({ body: { records: [], complete: true, nextCursor: "H" } }));
    expect(await headRecordState(p.platform, VAULT, ["Person"])).toEqual({ live: "H", ended: "H" });
    expect(p.seen.map((u) => `${u.searchParams.get("since")}/${u.searchParams.get("lifecycle") ?? "-"}`).sort()).toEqual(["head/-", "head/ended"]);
  });
});

describe("the rows a feed read brings", () => {
  const cursorOf = (u: URL) => (u.searchParams.get("lifecycle") === "ended" ? "E2" : "L2");
  it("keeps entity, type, label, time, body, etag and the whole row; a row with no entity or @id is dropped", async () => {
    const rows = [
      { entity: "https://h.example.test/base/e/a", typeUri: "t:Person", label: "Ann", updatedAt: "2026-01-01T00:00:00Z", body: { n: 1 }, etag: '"1"', extra: 7 },
      { "@id": "https://h.example.test/base/e/b", label: "  ", body: [1], etag: 5 },
      { typeUri: "t:Person" },
      null,
      "x",
      ["y"],
    ];
    const p = platformOf((u) => (u.searchParams.get("lifecycle") === "ended" ? { body: { records: [], complete: true, nextCursor: "E2" } } : { body: { records: rows, complete: true, nextCursor: cursorOf(u) } }));
    const out = (await syncRecordChanges(p.platform, VAULT, ["Person"], STATE))!;
    expect(out.rows).toEqual([
      { entity: "https://h.example.test/base/e/a", typeUri: "t:Person", label: "Ann", updatedAt: "2026-01-01T00:00:00Z", body: { n: 1 }, etag: '"1"', row: rows[0] },
      { entity: "https://h.example.test/base/e/b", typeUri: null, label: null, updatedAt: null, row: rows[1] },
    ]);
  });
  it("kind is changes; ended names the addresses of the records ended; state holds both new cursors; pages counts requests", async () => {
    const p = platformOf((u) =>
      u.searchParams.get("lifecycle") === "ended"
        ? { body: { records: [{ entity: "gone1" }, { entity: "gone2" }], complete: true, nextCursor: "E2" } }
        : { body: { records: [{ entity: "kept" }], complete: true, nextCursor: "L2" } },
    );
    const out = (await syncRecordChanges(p.platform, VAULT, ["Person"], STATE))!;
    expect(out.kind).toBe("changes");
    expect(out.ended).toEqual(["gone1", "gone2"]);
    expect(out.state).toEqual({ live: "L2", ended: "E2" });
    expect(out.complete).toBe(true);
    expect(out.pages).toBe(2);
  });
  it("walks on while a list says it is not complete, at the cursor the last page named, and says not complete at the page cap", async () => {
    let n = 0;
    const p = platformOf((u) => {
      if (u.searchParams.get("lifecycle") === "ended") return { body: { records: [], complete: true, nextCursor: "E2" } };
      n++;
      return { body: { records: [{ entity: `r${n}` }], complete: false, nextCursor: `L${n + 1}` } };
    });
    const out = (await syncRecordChanges(p.platform, VAULT, ["Person"], STATE, { maxPages: 3 }))!;
    expect(out.rows.map((r) => r.entity)).toEqual(["r1", "r2", "r3"]);
    expect(p.seen.filter((u) => !u.searchParams.has("lifecycle")).map((u) => u.searchParams.get("since"))).toEqual(["L1", "L2", "L3"]);
    expect(out.complete).toBe(false);
    expect(out.state!.live).toBe("L4");
  });
  it("the default page cap is 10 requests a list", async () => {
    const p = platformOf((u) => (u.searchParams.get("lifecycle") === "ended" ? { body: { records: [], complete: true, nextCursor: "E2" } } : { body: { records: [], complete: false, nextCursor: "L9" } }));
    const out = (await syncRecordChanges(p.platform, VAULT, ["Person"], STATE))!;
    expect(p.seen.filter((u) => !u.searchParams.has("lifecycle"))).toHaveLength(10);
    expect(out.complete).toBe(false);
  });
});

describe("a platform without the feed, an invalid cursor, and refusals", () => {
  it("no nextCursor on the live list: null, so the caller reads its list again; the ended list is not asked", async () => {
    const p = platformOf(() => ({ body: { records: [], complete: true } }));
    expect(await syncRecordChanges(p.platform, VAULT, ["Person"], STATE)).toBeNull();
    expect(p.seen).toHaveLength(1);
  });
  it("no nextCursor on the ended list: null", async () => {
    const p = platformOf((u) => (u.searchParams.get("lifecycle") === "ended" ? { body: { records: [], complete: true } } : { body: { records: [], complete: true, nextCursor: "L2" } }));
    expect(await syncRecordChanges(p.platform, VAULT, ["Person"], STATE)).toBeNull();
  });
  it("an empty nextCursor is no cursor", async () => {
    const p = platformOf(() => ({ body: { records: [], complete: true, nextCursor: "" } }));
    expect(await headRecordState(p.platform, VAULT, ["Person"])).toBeNull();
  });
  it("400 since_cursor_invalid is null for syncRecordChanges: start again; any other answer is a RecordListError with the platform's error name", async () => {
    const bad = platformOf(() => ({ status: 400, body: { error: "since_cursor_invalid", message: "m" } }));
    expect(await syncRecordChanges(bad.platform, VAULT, ["Person"], STATE)).toBeNull();
    const other400 = platformOf(() => ({ status: 400, body: { error: "type_token_unresolved" } }));
    const e = await thrown(syncRecordChanges(other400.platform, VAULT, ["Person"], STATE));
    expect(e).toBeInstanceOf(RecordListError);
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.name).toBe("PlatformError");
    expect(e.status).toBe(400);
    expect(e.code).toBe("type_token_unresolved");
    expect(e.message).toMatch(/^GET .* answered 400 \(type_token_unresolved\)$/);
    const other = platformOf(() => ({ status: 403, body: { error: "Forbidden" } }));
    await expect(syncRecordChanges(other.platform, VAULT, ["Person"], STATE)).rejects.toMatchObject({ status: 403, code: "Forbidden" });
  });
  it("an answer that is not JSON has no code; the message says only the status", async () => {
    const p = platformOf(() => ({ status: 502, text: "bad gateway" }));
    const e = await thrown(headRecordState(p.platform, VAULT, ["Person"]));
    expect(e.code).toBeNull();
    expect(e.body).toBe("bad gateway");
    expect(e.message).toMatch(/answered 502$/);
  });
  it("a 200 with no record list is a PlatformError, not a RecordListError", async () => {
    const p = platformOf(() => ({ body: { nope: 1 } }));
    const e = await thrown<Error>(headRecordState(p.platform, VAULT, ["Person"]));
    expect(e).toBeInstanceOf(PlatformError);
    expect(e).not.toBeInstanceOf(RecordListError);
    expect(e.message).toMatch(/served no record list$/);
  });
  it("an empty type list is refused before anything is sent (it would read the whole vault)", async () => {
    const p = platformOf(() => ({ body: {} }));
    await expect(headRecordState(p.platform, VAULT, [])).rejects.toThrow("a typed list needs at least one type");
    await expect(syncRecordChanges(p.platform, VAULT, [], STATE)).rejects.toThrow("a typed list needs at least one type");
    expect(p.seen).toHaveLength(0);
  });
  it("a platform that cannot be reached is a PlatformError with status 0", async () => {
    const platform: PlatformClient = { origin: ORIGIN, fetch: async () => { throw new TypeError("offline"); } };
    await expect(headRecordState(platform, VAULT, ["Person"])).rejects.toMatchObject({ name: "PlatformError", status: 0 });
  });
});
