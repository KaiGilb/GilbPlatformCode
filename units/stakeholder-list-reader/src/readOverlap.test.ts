// A draw overtaken by a newer draw writes nothing into shared state; more() before the first page waits for it.
import { describe, expect, it } from "vitest";
import { sleep } from "../test/clock";
import {
  createStakeholderListReader,
  type StakeholderList,
  type StakeholderListDeps,
} from "./index";
import {
  type AtomicPlacement,
  type ResolveOutcome,
} from "@kaigilb/gilbplatformcode-person-connections";
import {
  type LinkReading,
} from "@kaigilb/gilbplatformcode-online-card-link";

const PP: AtomicPlacement = { context: "personal", depth: "first-degree" };
const H = "https://holder.example.test/vault";
const who = (i: number) => `https://p${i}.example.test/vault`;
const rec = (i: number) => `${H}/e/r${i}`;

/** `n` records, each linked to placed person i; every read waits `ms` so draws overlap. */
function deps(n: number, ms = { page: 2, link: 3, resolve: 3 }, over: Partial<StakeholderListDeps> = {}) {
  const calls = { pages: 0, resolve: 0 };
  const d: StakeholderListDeps = {
    holder: H,
    vaults: [H],
    ownCardIds: [],
    async connections() {
      return { holder: H, sets: [], people: Array.from({ length: n }, (_, i) => ({ principal: who(i), placements: [PP] })) };
    },
    async listRecords() {
      calls.pages++;
      await sleep(ms.page);
      return { records: Array.from({ length: n }, (_, i) => ({ recordId: rec(i), title: `R${i}`, updatedAt: 1 })), next: null };
    },
    async readLink(id: string): Promise<LinkReading> {
      await sleep(ms.link);
      return { state: "linked", target: who(Number(id.split("/r").pop())) };
    },
    async resolve(id: string): Promise<ResolveOutcome> {
      calls.resolve++;
      await sleep(ms.resolve);
      const p = who(Number(id.split("/r").pop()));
      return { kind: "person", principal: p, entity: `${p}/e/c` };
    },
    async readName() {
      return { kind: "none" };
    },
    ...over,
  };
  return { d, calls };
}

/** Complete and joined: every record joined to its person, nothing linking, nothing missing, settled. */
function complete(l: StakeholderList, n: number) {
  expect(l.settling).toBe(false);
  expect(l.links.linking).toEqual([]);
  expect(l.rows.filter((r) => r.kind === "both")).toHaveLength(n);
  expect(l.rows.filter((r) => r.kind !== "self")).toHaveLength(n);
  expect(new Set(l.rows.map((r) => r.key)).size).toBe(l.rows.length);
}

describe("overlapping draws resolve with the newest complete list", () => {
  it("read, then refresh while the read joins links: both resolve with the refresh's complete list", async () => {
    const { d } = deps(8);
    const r = createStakeholderListReader(d);
    const p1 = r.read();
    await sleep(5);
    const p2 = r.refresh();
    const [a, b] = await Promise.all([p1, p2]);
    complete(a, 8);
    complete(b, 8);
    expect(a).toEqual(b);
  });

  it("read, then refresh whose page is slower than the read's links: the read still never resolves with records missing", async () => {
    let pages = 0;
    const base = deps(8);
    const r = createStakeholderListReader({
      ...base.d,
      async listRecords(v, o) {
        if (++pages > 1) await sleep(40);
        return base.d.listRecords(v, o);
      },
    });
    const p1 = r.read();
    await sleep(5);
    const p2 = r.refresh();
    const a = await p1;
    complete(a, 8);
    expect(a).toEqual(await p2);
  });

  it("refresh, then read while the refresh joins links: both complete", async () => {
    const { d } = deps(6);
    const r = createStakeholderListReader(d);
    await r.read();
    const p1 = r.refresh();
    await sleep(1);
    const p2 = r.read();
    const [a, b] = await Promise.all([p1, p2]);
    complete(a, 6);
    complete(b, 6);
  });

  it("two refreshes at once, and three draws in a row: every one resolves complete", async () => {
    const { d } = deps(6);
    const r = createStakeholderListReader(d);
    const all = await Promise.all([r.read(), r.refresh(), r.refresh()]);
    for (const l of all) complete(l, 6);
    const again = await Promise.all([r.refresh(), r.refresh()]);
    for (const l of again) complete(l, 6);
  });

  it("read, then more() while the read joins links: both complete, no duplicate rows", async () => {
    const { d } = deps(6);
    const r = createStakeholderListReader(d);
    const p1 = r.read();
    await sleep(4);
    const [a, b] = await Promise.all([p1, r.more()]);
    complete(a, 6);
    complete(b, 6);
  });

  it("an overtaken draw stops asking: the refresh does the joining, and the subscriber never gets a list from the older draw after a newer one", async () => {
    const { d, calls } = deps(10, { page: 2, link: 3, resolve: 10 });
    const seen: { settling: boolean; linking: number }[] = [];
    const r = createStakeholderListReader(d, { onRows: (l) => seen.push({ settling: l.settling, linking: l.links.linking.length }) });
    const p1 = r.read();
    await sleep(6);
    const p2 = r.refresh();
    await Promise.all([p1, p2]);
    // 10 records: one resolve each in the draw that finishes; the overtaken draw stopped after the resolves it had already sent.
    expect(calls.resolve).toBeLessThanOrEqual(10 + 3);
    expect(seen.at(-1)).toEqual({ settling: false, linking: 0 });
    expect(seen.filter((s) => !s.settling)).toHaveLength(1);
  });

  it("an overtaken draw's late failures do not leak into the newer list", async () => {
    // The read's resolves hold every resolve slot, then answer 503 AFTER the refresh has listed its page and queued its own
    // resolves (which then succeed). Mutant guarded: the overtaken draw writing its failures into the newer draw.
    let releaseOld!: () => void;
    const oldGate = new Promise<void>((r) => (releaseOld = r));
    let phase: "old" | "new" = "old";
    const base = deps(4);
    const r = createStakeholderListReader({
      ...base.d,
      async resolve(id: string): Promise<ResolveOutcome> {
        if (phase === "old") {
          await oldGate;
          return { kind: "unavailable", status: 503 };
        }
        return base.d.resolve(id);
      },
    });
    const p1 = r.read();
    await sleep(10); // the read's resolves are out and held
    phase = "new";
    const p2 = r.refresh();
    await sleep(8); // the refresh has its page and waits for a resolve slot
    releaseOld(); // the read's 503s land now
    const [a, b] = await Promise.all([p1, p2]);
    expect(b.links.unchecked).toEqual([]);
    expect(b.partial).toBe(false);
    complete(b, 4);
    expect(a).toEqual(b);
  });
});

describe("an overtaken draw writes nothing shared, and more() waits for the first page", () => {
  // an overtaken draw writes NOTHING into shared state, whatever its timing.
  it("the overtaken read's connections answer LATE with older people: the newer draw's people stay, also after more()", async () => {
    let call = 0;
    const base = deps(4);
    const r = createStakeholderListReader({
      ...base.d,
      async connections() {
        const mine = ++call;
        if (mine === 1) {
          await sleep(40);
          return { holder: H, sets: [], people: [] }; // the older answer: nobody placed
        }
        return base.d.connections();
      },
    });
    const p1 = r.read();
    await sleep(1);
    const [a, b] = await Promise.all([p1, r.refresh()]);
    complete(a, 4);
    complete(b, 4);
    await sleep(60); // the overtaken read's answer has landed
    const c = await r.more();
    expect(c.connections).toEqual({ state: "read" });
    expect(c.rows.filter((x) => x.kind === "both")).toHaveLength(4);
  });

  it("the overtaken read's records page fails LATE: the newer draw's vault stays 'read' and its records stay listed", async () => {
    let call = 0;
    const base = deps(4);
    const r = createStakeholderListReader({
      ...base.d,
      async listRecords(v, o) {
        if (++call === 1) {
          await sleep(40);
          throw new Error("records 500");
        }
        return base.d.listRecords(v, o);
      },
    });
    const p1 = r.read();
    await sleep(1);
    const [a, b] = await Promise.all([p1, r.refresh()]);
    complete(b, 4);
    expect(a).toEqual(b);
    await sleep(60);
    const c = await r.more();
    expect(c.vaults).toEqual([{ vaultId: H, state: "read", complete: true }]);
    expect(c.partial).toBe(false);
    complete(c, 4);
  });

  // more() before the first page has arrived waits for it; page 0 is never read twice.
  it("more() called before the first page is in: page 0 is read once, and both calls resolve complete", async () => {
    const { d, calls } = deps(5, { page: 10, link: 1, resolve: 1 });
    const r = createStakeholderListReader(d);
    const p1 = r.read();
    const p2 = r.more();
    const [a, b] = await Promise.all([p1, p2]);
    expect(calls.pages).toBe(1);
    complete(a, 5);
    complete(b, 5);
  });
});
