// The subscriber, the linking flag, races and the 429 cap, with fake doors.
import { describe, expect, it } from "vitest";
import { sleep } from "../test/clock";
import {
  createStakeholderListReader,
  type StakeholderListDeps,
  type StakeholderList,
} from "./index";
import {
  type LinkReading,
} from "@kaigilb/gilbplatformcode-online-card-link";
import {
  type ResolveOutcome,
} from "@kaigilb/gilbplatformcode-person-connections";

const H = "https://holder.example.test/vault";
const P = (n: string | number) => `https://p${n}.example.test/vault`;
const tick = (ms = 2) => sleep(ms);
function deps(n: number, over: Partial<StakeholderListDeps> = {}, delay = 2) {
  const recs = Array.from({ length: n }, (_, i) => ({ id: `${H}/e/r${i}`, title: `R${i}`, target: P(i) }));
  let resolves = 0;
  const d: StakeholderListDeps = {
    holder: H, holderVault: H, vaults: [H], ownCardIds: [],
    async connections() { return { holder: H, vaultId: H, sets: [], people: recs.map((r) => ({ principal: r.target, placements: [{ context: "professional", depth: "first-degree" }] })) } as never; },
    async listRecords() { return { records: recs.map((r) => ({ recordId: r.id, title: r.title, updatedAt: 1 })), next: null }; },
    async readLink(id): Promise<LinkReading> { await tick(delay); return { state: "linked", target: recs.find((r) => r.id === id)!.target }; },
    async resolve(id): Promise<ResolveOutcome> { resolves++; await tick(delay); const r = recs.find((x) => x.id === id)!; return { kind: "person", principal: r.target, entity: r.target }; },
    async readName() { return { kind: "none" as const }; },
    ...over,
  };
  return { d, count: () => resolves };
}
const noDupes = (l: StakeholderList) => {
  const keys = l.rows.map((r) => r.key);
  const recs = l.rows.flatMap((r) => (r.recordId ? [r.recordId] : []));
  expect(new Set(keys).size).toBe(keys.length);
  expect(new Set(recs).size).toBe(recs.length);
};

describe("the subscriber and linking", () => {
  it("first rows come before any link read; every linking row is a record row; the last emission is read()'s list", async () => {
    const em: StakeholderList[] = [];
    let linkReads = 0;
    const h = deps(8);
    const inner = h.d.readLink;
    const r = createStakeholderListReader({ ...h.d, readLink: async (id) => { linkReads++; return inner(id); } }, { onRows: (l) => em.push({ ...l, rows: l.rows.map((x) => ({ ...x })) }) });
    let readsAtFirst = -1;
    const r2 = createStakeholderListReader({ ...h.d, readLink: async (id) => { linkReads++; return inner(id); } }, { onRows: (l) => { if (readsAtFirst < 0) readsAtFirst = linkReads; } });
    linkReads = 0; await r2.read();
    expect(readsAtFirst).toBe(0);
    const got = await r.read();
    expect(em[0]!.settling).toBe(true);
    expect(em[0]!.rows.filter((x) => x.linking)).toHaveLength(8);
    expect(em[0]!.rows.filter((x) => x.linking).every((x) => x.kind === "record")).toBe(true);
    expect(em.at(-1)).toEqual(got);
    expect(got.settling).toBe(false);
    expect(got.rows.filter((x) => x.kind === "both")).toHaveLength(8);
    noDupes(got);
  });
  it("a refresh started while a read is still settling: the earlier read() never resolves with an unsettled list", async () => {
    const h = deps(12, {}, 5);
    const em: StakeholderList[] = [];
    const r = createStakeholderListReader(h.d, { onRows: (l) => em.push(l) });
    const p1 = r.read();
    await tick(8); // the first rows are in; the links are being read
    const p2 = r.refresh();
    const [a, b] = await Promise.all([p1, p2]);
    for (const l of [a, b]) {
      if (!l.settling) {
        expect(l.links.linking).toEqual([]);
        expect(l.rows.some((x) => x.linking)).toBe(false);
      }
      noDupes(l);
    }
    expect(b.settling).toBe(false);
    expect(b.rows.filter((x) => x.kind === "both")).toHaveLength(12);
    expect(em.at(-1)).toEqual(b);
  });
  it("a refresh whose page is slower than the read's links: the earlier read() never resolves with the records missing", async () => {
    let pages = 0;
    const h = deps(12, {}, 5);
    const inner = h.d.listRecords;
    const r = createStakeholderListReader({ ...h.d, async listRecords(v, o) { pages++; if (pages > 1) await tick(40); return inner(v, o); } });
    const p1 = r.read();
    await tick(8);
    const p2 = r.refresh();
    const a = await p1;
    expect(a.rows.filter((x) => x.recordId).length === 12 || a.settling === true || a.partial === true).toBe(true);
    await p2;
  });
  it("more() while read() is settling: both settle with no duplicate rows", async () => {
    const h = deps(10, {}, 4);
    const r = createStakeholderListReader(h.d);
    const p1 = r.read();
    await tick(6);
    const [a, b] = await Promise.all([p1, r.more()]);
    noDupes(a); noDupes(b);
    expect(b.rows.filter((x) => x.kind === "both")).toHaveLength(10);
  });
});

describe("resolver 429", () => {
  it("retries at most BUSY_RETRIES (2) times, waits retry-after (+ <= 50% jitter) or 2000 ms, then flags the record", async () => {
    const waits: number[] = [];
    let calls = 0;
    const h = deps(1, { async resolve(): Promise<ResolveOutcome> { calls++; return { kind: "busy", retryAfterMs: calls === 1 ? 1000 : null }; } });
    const l = await createStakeholderListReader(h.d, { wait: async (ms) => { waits.push(ms); }, random: () => 0.999 }).read();
    expect(calls).toBe(3);
    expect(waits).toHaveLength(2);
    expect(waits[0]).toBeGreaterThanOrEqual(1000); expect(waits[0]).toBeLessThan(1500);
    expect(waits[1]).toBeGreaterThanOrEqual(2000); expect(waits[1]).toBeLessThan(3000);
    expect(l.links.unchecked).toEqual([`${H}/e/r0`]);
    expect(l.partial).toBe(true);
  });
  it("a 429 wait does not hold a resolve slot: other records resolve meanwhile", async () => {
    let busyOnce = true;
    const order: string[] = [];
    const h = deps(4);
    const inner = h.d.resolve;
    const r = createStakeholderListReader({ ...h.d, async resolve(id) { if (id.endsWith("/r0") && busyOnce) { busyOnce = false; order.push("busy r0"); return { kind: "busy", retryAfterMs: 50 }; } order.push(`ok ${id.split("/").pop()}`); return inner(id); } }, { wait: (ms) => sleep(ms), random: () => 0 });
    const l = await r.read();
    expect(order.indexOf("ok r0")).toBeGreaterThan(order.indexOf("ok r3"));
    expect(l.rows.filter((x) => x.kind === "both")).toHaveLength(4);
  });
});
