// Overtaken draws with every request counted and stamped with the draw that was newest when it was sent.
import { describe, expect, it } from "vitest";
import { sleep, now } from "../test/clock";
import {
  createStakeholderListReader,
  type StakeholderList,
  type StakeholderListDeps,
} from "./index";
import {
  type LinkReading,
} from "@kaigilb/gilbplatformcode-online-card-link";
import {
  type ResolveOutcome,
} from "@kaigilb/gilbplatformcode-person-connections";

const H = "https://holder.example.test/vault";
const P = (i: number) => `https://p${i}.example.test/vault`;
const R = (i: number) => `${H}/e/r${i}`;
type Log = { kind: string; at: number; id?: string };
function world(n: number, ms = { conn: 1, page: 3, link: 4, resolve: 4 }, over: Partial<StakeholderListDeps> = {}) {
  const log: Log[] = [];
  let t0 = now();
  const d: StakeholderListDeps = {
    holder: H, holderVault: H, vaults: [H], ownCardIds: [],
    async connections() { log.push({ kind: "conn", at: now() - t0 }); await sleep(ms.conn); return { holder: H, vaultId: H, sets: [], people: Array.from({ length: n }, (_, i) => ({ principal: P(i), placements: [{ context: "personal", depth: "first-degree" }] })) } as never; },
    async listRecords(_v, offset) { log.push({ kind: `page@${offset}`, at: now() - t0 }); await sleep(ms.page); return { records: Array.from({ length: n }, (_, i) => ({ recordId: R(i), title: `R${i}`, updatedAt: 1 })), next: null }; },
    async readLink(id): Promise<LinkReading> { log.push({ kind: "link", at: now() - t0, id }); await sleep(ms.link); return { state: "linked", target: P(Number(id.split("/r").pop())) }; },
    async resolve(id): Promise<ResolveOutcome> { log.push({ kind: "resolve", at: now() - t0, id }); await sleep(ms.resolve); const p = P(Number(id.split("/r").pop())); return { kind: "person", principal: p, entity: p }; },
    async readName() { return { kind: "none" as const }; },
    ...over,
  };
  return { d, log, reset: () => { log.length = 0; t0 = now(); } };
}
function complete(l: StakeholderList, n: number) {
  expect(l.settling).toBe(false);
  expect(l.partial).toBe(false);
  expect(l.links.linking).toEqual([]);
  expect(l.connections.state).toBe("read");
  expect(l.rows.filter((r) => r.kind === "both")).toHaveLength(n);
  expect(l.rows.filter((r) => r.kind !== "self")).toHaveLength(n);
  expect(new Set(l.rows.map((r) => r.key)).size).toBe(l.rows.length);
}
const count = (log: Log[], k: string) => log.filter((x) => x.kind === k).length;

describe("every order resolves complete", () => {
  for (const gap of [0, 2, 6, 12, 25]) {
    it(`read, refresh ${gap} ms later`, async () => {
      const w = world(10); const r = createStakeholderListReader(w.d);
      const a = r.read(); await sleep(gap); const b = r.refresh();
      const [x, y] = await Promise.all([a, b]); complete(x, 10); complete(y, 10); expect(x).toEqual(y);
    });
    it(`refresh, read ${gap} ms later`, async () => {
      const w = world(10); const r = createStakeholderListReader(w.d);
      const a = r.refresh(); await sleep(gap); const b = r.read();
      const [x, y] = await Promise.all([a, b]); complete(x, 10); complete(y, 10);
    });
    it(`read, more ${gap} ms later`, async () => {
      const w = world(10); const r = createStakeholderListReader(w.d);
      const a = r.read(); await sleep(gap); const b = r.more();
      const [x, y] = await Promise.all([a, b]); complete(x, 10); complete(y, 10);
    });
  }
  it("three refreshes at once and a read after: all complete, all equal", async () => {
    const w = world(10); const r = createStakeholderListReader(w.d);
    const ls = await Promise.all([r.refresh(), r.refresh(), r.refresh(), (async () => { await sleep(3); return r.read(); })()]);
    for (const l of ls) complete(l, 10);
  });
});

describe("stray requests after being overtaken", () => {
  it("counts: a read overtaken while joining sends no link or resolve after the refresh starts beyond the ones already in its slots", async () => {
    const w = world(12, { conn: 1, page: 2, link: 6, resolve: 6 });
    const r = createStakeholderListReader(w.d);
    const a = r.read(); await sleep(5);
    const cut = w.log.length;
    const b = r.refresh();
    await Promise.all([a, b]);
    // Alone: one draw costs 12 link reads + 12 resolves. Overlapped: the total must not reach two full draws.
    const links = count(w.log, "link"), resolves = count(w.log, "resolve");
    // The read's own in-flight sends at the cut are at most 3 + 3 (the limiters); the refresh's caches answer the rest.
    expect(links).toBeLessThanOrEqual(12 + 3);
    expect(resolves).toBeLessThanOrEqual(12 + 3);
    expect(w.log.slice(cut).filter((x) => x.kind.startsWith("page")).length).toBe(1);
  });
  it("read then more() before the first page is in: page 0 is not read twice", async () => {
    const w = world(5, { conn: 1, page: 10, link: 1, resolve: 1 });
    const r = createStakeholderListReader(w.d);
    const a = r.read(); await sleep(2); const b = r.more();
    const [x, y] = await Promise.all([a, b]);
    complete(x, 5); complete(y, 5);
    expect(count(w.log, "page@0")).toBe(1);
  });
});

describe("late failures after being overtaken", () => {
  it("the overtaken read's connections fail LATE (after the refresh read them fine): the newest list and the next more() keep the people", async () => {
    let call = 0;
    const w = world(6);
    const inner = w.d.connections;
    const r = createStakeholderListReader({ ...w.d, async connections() { call++; if (call === 1) { await sleep(40); throw new Error("AudienceRungMembership 500"); } return inner(); } });
    const a = r.read(); await sleep(1); const b = r.refresh();
    const y = await b; complete(y, 6);
    const x = await a; complete(x, 6);
    await sleep(50);
    const m = await r.more();
    expect(m.connections.state).toBe("read");
    expect(m.rows.filter((q) => q.kind === "both")).toHaveLength(6);
  });
  it("the overtaken read's link reads fail late: nothing in the newest list is unchecked", async () => {
    let fail = true;
    const w = world(8, { conn: 1, page: 1, link: 15, resolve: 1 });
    const inner = w.d.readLink;
    const r = createStakeholderListReader({ ...w.d, async readLink(id) { const f = fail; const v = await inner(id); if (f) throw new Error("record 500"); return v; } });
    const a = r.read(); await sleep(4); fail = false; const b = r.refresh();
    const [x, y] = await Promise.all([a, b]);
    complete(y, 8); expect(x).toEqual(y);
  });
});

describe("subscriber when overtaken", () => {
  for (const gap of [0, 3, 8, 15]) {
    it(`no list from an older draw after a newer one (refresh ${gap} ms after read); the last emission is complete`, async () => {
      const w = world(10);
      const em: { gen: number; l: StakeholderList }[] = [];
      let gen = 1;
      const r = createStakeholderListReader(w.d, { onRows: (l) => em.push({ gen, l }) });
      const a = r.read(); await sleep(gap); gen = 2; const b = r.refresh();
      await Promise.all([a, b]);
      // Once any list was emitted after the refresh began, every later emission must be the refresh's own (not settled-older).
      const last = em.at(-1)!.l;
      complete(last, 10);
      const idxFirstNew = em.findIndex((e) => e.gen === 2);
      expect(idxFirstNew).toBeGreaterThanOrEqual(0);
      // After the refresh starts, a settled list may appear only as the very last emission.
      expect(em.slice(idxFirstNew, -1).every((e) => e.l.settling)).toBe(true);
    });
  }
});
