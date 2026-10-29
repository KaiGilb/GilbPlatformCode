// The reader's limits: link reads, resolves and name reads at once, the polite 429 wait, and the requests of a draw.
import { describe, expect, it } from "vitest";
import { sleep } from "../test/clock";
import {
  BUSY_DEFAULT_WAIT_MS,
  BUSY_RETRIES,
  LINK_READ_CONCURRENCY,
  RESOLVE_CONCURRENCY,
  createStakeholderListReader,
  type RecordsPage,
  type StakeholderList,
  type StakeholderListDeps,
} from "./index";
import {
  type AtomicPlacement,
  type ConnectionsReading,
  type ResolveOutcome,
} from "@kaigilb/gilbplatformcode-person-connections";
import {
  type LinkReading,
} from "@kaigilb/gilbplatformcode-online-card-link";

const PP: AtomicPlacement = { context: "personal", depth: "first-degree" };
const H = "https://holder.example.test/vault";
const V = (n: number) => (n === 0 ? H : `https://g${n}.example.test/vault`);
const who = (n: string | number) => `https://p${n}.example.test/vault`;
const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);
const tick = () => sleep(1);

/** vault -> records; each linked record's target resolves to the same principal. */
type Rec = { id: string; title: string; target: string | null };
function world(vaults: number, perVault: number, linkedPerVault: number, placed: string[]) {
  const records = new Map<string, Rec[]>();
  for (let v = 0; v < vaults; v++)
    records.set(
      V(v),
      Array.from({ length: perVault }, (_, i) => ({
        id: `${V(v)}/e/r${v}-${String(i).padStart(3, "0")}`,
        title: `R ${v}.${i}`,
        target: i < linkedPerVault ? who(`v${v}i${i}`) : null,
      })),
    );
  return { records, placed };
}

function deps(w: ReturnType<typeof world>, over: Partial<StakeholderListDeps> = {}) {
  const byId = new Map<string, Rec>();
  for (const l of w.records.values()) for (const r of l) byId.set(r.id, r);
  const live = { readLink: 0, readLinkMax: 0, resolve: 0, resolveMax: 0 };
  const calls = { resolve: 0, readLink: 0 };
  const d: StakeholderListDeps = {
    holder: H,
    vaults: [...w.records.keys()],
    ownCardIds: [],
    async connections(): Promise<ConnectionsReading> {
      return { holder: H, sets: [], people: w.placed.map((p) => ({ principal: p, placements: [PP] })) };
    },
    async listRecords(vaultId: string, offset: number): Promise<RecordsPage> {
      const all = w.records.get(vaultId) ?? [];
      return { records: all.slice(offset, offset + 20).map((r) => ({ recordId: r.id, title: r.title, updatedAt: 1 })), next: offset + 20 < all.length ? offset + 20 : null };
    },
    async readLink(id: string): Promise<LinkReading> {
      calls.readLink++;
      live.readLink++;
      live.readLinkMax = Math.max(live.readLinkMax, live.readLink);
      await tick();
      live.readLink--;
      const t = byId.get(id)?.target;
      return t ? { state: "linked", target: t } : { state: "none" };
    },
    async resolve(id: string): Promise<ResolveOutcome> {
      calls.resolve++;
      live.resolve++;
      live.resolveMax = Math.max(live.resolveMax, live.resolve);
      await tick();
      live.resolve--;
      const t = byId.get(id)?.target;
      return t ? { kind: "person", principal: t, entity: `${t}/e/card` } : { kind: "none" };
    },
    async readName() {
      return { kind: "none" };
    },
    ...over,
  };
  return { d, live, calls };
}

describe("the first rows do not wait for links, resolves or spelling checks", () => {
  // Criterion "first rows do not wait for names or links".
  it("with a resolver, a link read and a canonicaliser that never answer, onRows still gets every record and placed row", async () => {
    const w = world(2, 5, 2, [who("v0i0"), who("x")]);
    const { d } = deps(w, { resolve: never, readLink: never, canonical: never, linkedRecordIds: never });
    const lists: StakeholderList[] = [];
    void createStakeholderListReader(d, { onRows: (l) => lists.push(l) }).read();
    await tick();
    await tick();
    expect(lists).toHaveLength(1);
    const first = lists[0]!;
    expect(first.settling).toBe(true);
    // self + 10 records (unjoined) + 2 placed: nothing is missing while links are pending.
    expect(first.rows.filter((r) => r.kind === "record")).toHaveLength(10);
    expect(first.rows.filter((r) => r.kind === "placed").map((r) => r.key)).toEqual([who("v0i0"), who("x")]);
    // Every record whose link is not known yet is marked `linking`; the list says which.
    expect(first.rows.filter((r) => r.kind === "record").every((r) => r.linking)).toBe(true);
    expect(first.links.linking).toHaveLength(10);
    expect(first.partial).toBe(false);
  });

  it("when the joins arrive, the subscriber gets an updated list where a person and their record are ONE row", async () => {
    const w = world(1, 4, 1, [who("v0i0")]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const base = deps(w);
    const { d } = deps(w, {
      async resolve(id: string) {
        await gate;
        return base.d.resolve(id);
      },
    });
    const lists: StakeholderList[] = [];
    const done = createStakeholderListReader(d, { onRows: (l) => lists.push(l) }).read();
    await tick();
    await tick();
    expect(lists[0]!.rows.find((r) => r.key === who("v0i0"))?.kind).toBe("placed");
    expect(lists[0]!.rows.find((r) => r.recordId?.endsWith("r0-000"))).toMatchObject({ kind: "record", linking: true });
    release();
    const settled = await done;
    const last = lists[lists.length - 1]!;
    expect(last).toEqual(settled);
    expect(last.settling).toBe(false);
    expect(last.links.linking).toEqual([]);
    expect(last.rows.filter((r) => r.key === who("v0i0") || r.recordId?.endsWith("r0-000"))).toEqual([
      expect.objectContaining({ key: who("v0i0"), kind: "both", linking: false }),
    ]);
  });

  it("the first rows come before the spelling check: a canonicaliser that never answers holds back only the last update", async () => {
    // r0-000 links someone not placed, so the spelling check runs; it never answers.
    const w = world(1, 3, 1, [who("legacy")]);
    const { d } = deps(w, { canonical: never });
    const lists: StakeholderList[] = [];
    void createStakeholderListReader(d, { onRows: (l) => lists.push(l) }).read();
    for (let i = 0; i < 10; i++) await tick();
    expect(lists.length).toBeGreaterThanOrEqual(2);
    const joined = lists[lists.length - 1]!;
    expect(joined.links.linking).toEqual([]);
    expect(joined.rows.find((r) => r.key === who("v0i0"))?.kind).toBe("record");
    expect(joined.spellings).toEqual({ state: "checking" });
    expect(joined.settling).toBe(true);
  });

  it("refresh: links and resolves already known are joined in the FIRST rows (no linking)", async () => {
    const w = world(1, 4, 1, [who("v0i0")]);
    const { d } = deps(w);
    const lists: StakeholderList[] = [];
    const reader = createStakeholderListReader(d, { onRows: (l) => lists.push(l) });
    await reader.read();
    lists.length = 0;
    await reader.refresh();
    expect(lists[0]!.rows.find((r) => r.key === who("v0i0"))).toMatchObject({ kind: "both", linking: false });
    expect(lists[0]!.links.linking).toEqual([]);
  });

  it("more(): the next page's rows reach the subscriber before their links are read", async () => {
    const w = world(1, 30, 30, []);
    let hold = false;
    const base = deps(w);
    const { d } = deps(w, {
      readLink: (id: string) => (hold ? never<LinkReading>() : base.d.readLink(id)),
    });
    const lists: StakeholderList[] = [];
    const reader = createStakeholderListReader(d, { onRows: (l) => lists.push(l) });
    await reader.read();
    hold = true;
    lists.length = 0;
    void reader.more();
    await tick();
    await tick();
    expect(lists[0]!.rows.filter((r) => r.recordId && r.kind !== "self").length + lists[0]!.rows.reduce((n, r) => n + r.alsoRecords, 0)).toBe(30);
    expect(lists[0]!.links.linking).toHaveLength(10);
  });

  it("read() still resolves with the settled list, the same as the subscriber's last list", async () => {
    const w = world(2, 5, 2, [who("v0i0"), who("v1i1")]);
    const { d } = deps(w);
    const lists: StakeholderList[] = [];
    const settled = await createStakeholderListReader(d, { onRows: (l) => lists.push(l) }).read();
    expect(settled.settling).toBe(false);
    expect(lists[lists.length - 1]).toEqual(settled);
    expect(settled.rows.filter((r) => r.kind === "both")).toHaveLength(2);
  });
});

describe("within the platform's per-person limit, and polite on a 429", () => {
  it("at most 3 link reads and 3 resolves at once IN TOTAL, across 3 held vaults with 20 linked records each", async () => {
    expect(LINK_READ_CONCURRENCY).toBe(3);
    expect(RESOLVE_CONCURRENCY).toBe(3);
    const w = world(3, 20, 20, []);
    const { d, live, calls } = deps(w);
    const list = await createStakeholderListReader(d).read();
    expect(calls.readLink).toBe(60);
    expect(calls.resolve).toBe(60);
    expect(live.readLinkMax).toBeLessThanOrEqual(3);
    expect(live.resolveMax).toBeLessThanOrEqual(3);
    expect(list.partial).toBe(false);
  });

  it("a 429 is retried after the server's retry-after with jitter (never sooner, never a tight loop), then joins", async () => {
    const w = world(1, 2, 1, [who("v0i0")]);
    const base = deps(w);
    let busy = 2;
    const waits: number[] = [];
    const { d, calls } = deps(w, {
      async resolve(id: string): Promise<ResolveOutcome> {
        calls.resolve++;
        if (busy-- > 0) return { kind: "busy", retryAfterMs: 1500 };
        return base.d.resolve(id);
      },
    });
    const list = await createStakeholderListReader(d, { wait: async (ms) => void waits.push(ms), random: () => 0.5 }).read();
    expect(calls.resolve).toBe(3);
    expect(waits).toHaveLength(2);
    for (const ms of waits) {
      expect(ms).toBeGreaterThanOrEqual(1500);
      expect(ms).toBeLessThanOrEqual(1500 * 1.5);
    }
    expect(list.rows.find((r) => r.key === who("v0i0"))?.kind).toBe("both");
    expect(list.partial).toBe(false);
  });

  it(`a 429 with no retry-after waits ${2000} ms (+ jitter); after ${2} retries the record is flagged and the list is partial`, async () => {
    expect(BUSY_RETRIES).toBe(2);
    expect(BUSY_DEFAULT_WAIT_MS).toBe(2000);
    const w = world(1, 2, 1, [who("v0i0")]);
    const waits: number[] = [];
    const { d, calls } = deps(w, {
      async resolve(): Promise<ResolveOutcome> {
        calls.resolve++;
        return { kind: "busy", retryAfterMs: null };
      },
    });
    const list = await createStakeholderListReader(d, { wait: async (ms) => void waits.push(ms), random: () => 0 }).read();
    expect(calls.resolve).toBe(3);
    expect(waits).toEqual([2000, 2000]);
    expect(list.links.unchecked).toEqual([`${H}/e/r0-000`]);
    expect(list.partial).toBe(true);
  });

  it("jitter spreads the waits: different random draws give different waits, all at or above the server's time", async () => {
    const w = world(1, 2, 1, []);
    const seen: number[] = [];
    let r = 0;
    const { d } = deps(w, { resolve: async () => ({ kind: "busy", retryAfterMs: 1000 }) });
    await createStakeholderListReader(d, { wait: async (ms) => void seen.push(ms), random: () => (r++ % 2 ? 0.9 : 0.1) }).read();
    expect(new Set(seen).size).toBe(2);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(1000);
  });

  it("a record waiting out a 429 does not hold a resolve slot: the other records keep resolving", async () => {
    const w = world(1, 6, 6, []);
    const base = deps(w);
    let releaseWait!: () => void;
    const waiting = new Promise<void>((r) => (releaseWait = r));
    const resolved: string[] = [];
    const { d } = deps(w, {
      async resolve(id: string): Promise<ResolveOutcome> {
        if (id.endsWith("r0-000") && !resolved.includes("first-busy")) {
          resolved.push("first-busy");
          return { kind: "busy", retryAfterMs: 1000 };
        }
        resolved.push(id);
        return base.d.resolve(id);
      },
    });
    const done = createStakeholderListReader(d, { wait: () => waiting }).read();
    for (let i = 0; i < 20; i++) await tick();
    expect(resolved.filter((x) => x !== "first-busy")).toHaveLength(5);
    releaseWait();
    const list = await done;
    expect(list.links.unchecked).toEqual([]);
  });
});
