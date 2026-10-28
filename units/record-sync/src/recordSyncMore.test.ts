// New tests: what the ported blocks left unpinned in recordPages.ts and platform.ts (found by mutation checks).
import { describe, expect, it, vi } from "vitest";
import { request, type PlatformClient } from "./platform";
import { headRecordState, syncRecordChanges } from "./recordPages";

const ORIGIN = "https://holder.platform.example.test";
const VAULT = `${ORIGIN}/vault`;
function platformOf(reply: (u: URL) => unknown) {
  const seen: URL[] = [];
  const platform: PlatformClient = { origin: ORIGIN, fetch: async (url) => (seen.push(new URL(url)), Response.json(reply(new URL(url)))) };
  return { platform, seen };
}
const isEnded = (u: URL) => u.searchParams.get("lifecycle") === "ended";

describe("a feed read walks on until the platform says complete", () => {
  it("a page with no complete flag is not the end: the read goes on to the next cursor, up to the cap", async () => {
    let n = 0;
    const p = platformOf((u) => (isEnded(u) ? { records: [], complete: true, nextCursor: "E2" } : { records: [{ entity: `r${++n}` }], nextCursor: `L${n + 1}` }));
    const out = (await syncRecordChanges(p.platform, VAULT, ["Person"], { live: "L1", ended: "E1" }, { maxPages: 3 }))!;
    expect(out.rows.map((r) => r.entity)).toEqual(["r1", "r2", "r3"]);
    expect(out.complete).toBe(false);
  });
  it("complete needs both lists: a live list read to its end and an ended list that is not is not complete", async () => {
    const p = platformOf((u) => (isEnded(u) ? { records: [], complete: false, nextCursor: "E2" } : { records: [], complete: true, nextCursor: "L2" }));
    const out = (await syncRecordChanges(p.platform, VAULT, ["Person"], { live: "L1", ended: "E1" }, { maxPages: 2 }))!;
    expect(out.complete).toBe(false);
    const q = platformOf((u) => (isEnded(u) ? { records: [], complete: true, nextCursor: "E2" } : { records: [], complete: false, nextCursor: "L2" }));
    expect((await syncRecordChanges(q.platform, VAULT, ["Person"], { live: "L1", ended: "E1" }, { maxPages: 2 }))!.complete).toBe(false);
  });
});

describe("headRecordState needs both positions", () => {
  it("a feed on the live list alone, or on the ended list alone, is no state", async () => {
    const liveOnly = platformOf((u) => (isEnded(u) ? { records: [], complete: true } : { records: [], complete: true, nextCursor: "H" }));
    expect(await headRecordState(liveOnly.platform, VAULT, ["Person"])).toBeNull();
    const endedOnly = platformOf((u) => (isEnded(u) ? { records: [], complete: true, nextCursor: "H" } : { records: [], complete: true }));
    expect(await headRecordState(endedOnly.platform, VAULT, ["Person"])).toBeNull();
  });
});

describe("request with a bound leaves nothing behind", () => {
  it("the timer of a bound is cleared when the answer comes first", async () => {
    vi.useFakeTimers();
    try {
      const platform: PlatformClient = { origin: ORIGIN, fetch: async () => Response.json({ ok: true }) };
      const a = await request(platform, "GET", `${ORIGIN}/x`, undefined, undefined, undefined, { timeoutMs: 60_000 });
      expect(a.status).toBe(200);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
