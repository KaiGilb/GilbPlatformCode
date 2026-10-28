import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_FIND_CAP, loadPlanFind, pageAttributeIds, planFindKey } from "./planFind";
import { setUp, tearDown } from "../test/support";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const ORIGIN = "https://plan.platform.example.test";
const VAULT = `${ORIGIN}/vault`;
const PARENT = `${ORIGIN}/base/e/parent`;

function ent(id: string): string {
  return `${ORIGIN}/base/e/${id}`;
}

let bodies: Map<string, string>;
let failIds: Set<string>;
let inFlight: number;
let peak: number;
let recordReads: number;

function install(ids: string[], delayMs = 0) {
  bodies = new Map(ids.map((id) => [id, `text ${id}`]));
  failIds = new Set();
  inFlight = 0;
  peak = 0;
  recordReads = 0;
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/base/find-by-attribute")) {
      const u = new URL(url);
      const limit = Number(u.searchParams.get("limit") ?? "100");
      const offset = Number(u.searchParams.get("offset") ?? "0");
      const slice = ids.slice(offset, offset + limit).map(ent);
      return Response.json({ count: ids.length, ids: slice });
    }
    if (url.includes("/lws/r/")) {
      const id = decodeURIComponent(url.split("/lws/r/")[1]?.split(/[?#]/)[0] ?? "");
      recordReads += 1;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      inFlight -= 1;
      if (failIds.has(id)) return new Response("no", { status: 500 });
      return Response.json({
        "@id": ent(id),
        "@type": "t:SpecificationElement",
        "a:unitTag": `Walk.${id}`,
        "a:body": bodies.get(id) ?? "",
        "a:partOf": { "@id": PARENT },
      });
    }
    return new Response("unexpected", { status: 500 });
  });
}

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("loadPlanFind", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setUp();
  });
  afterEach(() => tearDown());

  it("reads 40 parts with at most 6 in flight, and faster than one-by-one", async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `p${i}`);
    install(ids, 50);
    const started = Date.now();
    const found = await loadPlanFind(client(), VAULT, "a:partOf", "parent", PARENT);
    const elapsed = Date.now() - started;
    expect(found.rows.map((r) => r.id)).toEqual(ids);
    expect(found.unread).toBe(0);
    expect(found.capped).toBe(false);
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThan(1);
    expect(elapsed).toBeLessThan((40 * 50) / 3);
  });

  it("caps a find at 300 and keeps the real total", async () => {
    const ids = Array.from({ length: 305 }, (_, i) => `p${i}`);
    install(ids);
    const found = await loadPlanFind(client(), VAULT, "a:partOf", "parent", PARENT);
    expect(found.capped).toBe(true);
    expect(found.total).toBe(305);
    expect(found.rows).toHaveLength(PLAN_FIND_CAP);
    expect(recordReads).toBe(PLAN_FIND_CAP);
    const findCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/base/find-by-attribute"));
    // Three full pages, then one probe (limit 1) because 300 < count 305. The probe id is not read.
    expect(findCalls).toHaveLength(4);
    expect(new URL(String(findCalls[3]![0])).searchParams.get("limit")).toBe("1");
  });

  it("V30: a Value's children find (cap 2000) pages to 2000, and says so when more exist", async () => {
    const ids = Array.from({ length: 2005 }, (_, i) => `p${i}`);
    install(ids);
    const found = await loadPlanFind(client(), VAULT, "a:partOf", "parent", PARENT, 2000);
    expect(found.capped).toBe(true);
    expect(found.cap).toBe(2000);
    expect(found.total).toBe(2005);
    expect(found.rows).toHaveLength(2000);
  });

  it("skips a record that fails to read and counts it", async () => {
    install(["a", "b", "c"]);
    failIds.add("b");
    const found = await loadPlanFind(client(), VAULT, "a:partOf", "parent", PARENT);
    expect(found.unread).toBe(1);
    expect(found.rows.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("a re-read after the find is invalidated shows the text stored now", async () => {
    install(["feet"]);
    const qc = client();
    const first = await loadPlanFind(qc, VAULT, "a:partOf", "parent", PARENT);
    expect(first.rows[0]?.facts.body).toBe("text feet");
    qc.setQueryData(planFindKey(VAULT, "a:partOf", "parent"), first);
    bodies.set("feet", "Changed by another writer.");
    const stale = await loadPlanFind(qc, VAULT, "a:partOf", "parent", PARENT);
    expect(stale.rows[0]?.facts.body).toBe("text feet");
    await qc.invalidateQueries({ queryKey: planFindKey(VAULT, "a:partOf", "parent"), refetchType: "none" });
    const fresh = await loadPlanFind(qc, VAULT, "a:partOf", "parent", PARENT);
    expect(fresh.rows[0]?.facts.body).toBe("Changed by another writer.");
  });

  it("pageAttributeIds does not stop at the find cap", async () => {
    const ids = Array.from({ length: 350 }, (_, i) => `p${i}`);
    install(ids);
    const found = await pageAttributeIds("a:partOf", PARENT, ORIGIN);
    expect(found.ids).toHaveLength(350);
  });
});

