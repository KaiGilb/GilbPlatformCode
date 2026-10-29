// The page size of each vault for one reach, shared over the vaults still open, and the requests one screen costs.
import { describe, expect, it } from "vitest";
import {
  STAKEHOLDER_LIST_REACH_CAP,
  createStakeholderListReader,
  pageLimitOfVault,
  reachShares,
  type ListedRecord,
  type RecordsPage,
  type StakeholderList,
  type StakeholderListDeps,
} from "./index";
import {
  type ConnectionsReading,
  type ResolveOutcome,
} from "@kaigilb/gilbplatformcode-person-connections";

const OWN = "https://bb.example.test/vault";
const B = "https://bb-work.example.test/vault";
const C = "https://bb-club.example.test/vault";
const VAULTS = [OWN, B, C];
const SIZES = new Map([
  [OWN, 120],
  [B, 60],
  [C, 20],
]);

interface Counts {
  listRecords: number;
  linkedRecordIds: number;
  readLink: number;
  resolve: number;
  connections: number;
}
const total = (c: Counts) => c.listRecords + c.linkedRecordIds + c.readLink + c.resolve + c.connections;

/**
 * A door over 3 uneven vaults. EVERY record is linked (the worst case for requests: one resolve each).
 * `honour`: the door pages by the reader's limit (the new contract); else by the old static split (`pageLimitOfVault`), as the
 * apps' doors at ceffa69 do.
 */
function door(honour: boolean, fail: { vault: string; times: number } | null = null) {
  const counts: Counts = { listRecords: 0, linkedRecordIds: 0, readLink: 0, resolve: 0, connections: 0 };
  const asked: { vault: string; offset: number; limit: number | undefined }[] = [];
  const staticLimit = pageLimitOfVault(VAULTS);
  let failsLeft = fail?.times ?? 0;
  const deps: StakeholderListDeps = {
    holder: OWN,
    vaults: VAULTS,
    ownCardIds: [`${OWN}/e/vsc-bb`],
    async connections(): Promise<ConnectionsReading> {
      counts.connections++;
      return { holder: OWN, vaultId: OWN, sets: [], people: [] };
    },
    async listRecords(vaultId: string, offset: number, limit?: number): Promise<RecordsPage> {
      counts.listRecords++;
      asked.push({ vault: vaultId, offset, limit });
      if (fail && vaultId === fail.vault && failsLeft > 0) {
        failsLeft--;
        throw new Error("503");
      }
      const size = SIZES.get(vaultId)!;
      const n = honour ? limit! : staticLimit(vaultId);
      const end = Math.min(size, offset + n);
      const records: ListedRecord[] = [];
      for (let i = offset; i < end; i++)
        records.push({ recordId: `${vaultId}/e/r${i}`, title: `r${i}`, link: { state: "linked", target: `https://p${i}.example.test/vault/e/card` } });
      return { records, next: end < size ? end : null };
    },
    async linkedRecordIds() {
      counts.linkedRecordIds++;
      return [];
    },
    async readLink() {
      counts.readLink++;
      return { state: "none" };
    },
    async resolve(): Promise<ResolveOutcome> {
      counts.resolve++;
      return { kind: "none" };
    },
    async readName() {
      return { kind: "none" };
    },
  };
  return { deps, counts, asked };
}

const recordCount = (l: StakeholderList) => l.rows.filter((r) => r.recordId !== null && r.kind !== "self").length;

/** Reads, then reaches until complete. One entry per reach: pages asked, records it brought, requests it cost. */
async function walk(deps: StakeholderListDeps, counts: Counts, asked: { vault: string; limit: number | undefined }[]) {
  const reader = createStakeholderListReader(deps);
  const reaches: { pages: string[]; limits: (number | undefined)[]; brought: number; requests: number }[] = [];
  let list: StakeholderList | null = null;
  for (let i = 0; i < 100 && !list?.complete; i++) {
    const before = { asked: asked.length, requests: total(counts), records: list ? recordCount(list) : 0 };
    list = await (i === 0 ? reader.read() : reader.more());
    const mine = asked.slice(before.asked);
    reaches.push({
      pages: mine.map((a) => a.vault),
      limits: mine.map((a) => a.limit),
      brought: recordCount(list) - before.records,
      requests: total(counts) - before.requests,
    });
  }
  return { reaches, list: list! };
}

describe("reachShares: the reach cap split over the vaults still open", () => {
  it("3 open: 7, 7, 6 (the holder's own first takes the remainder)", () => {
    expect([...reachShares(VAULTS, VAULTS).entries()]).toEqual([
      [OWN, 7],
      [B, 7],
      [C, 6],
    ]);
  });

  it("a finished vault gets nothing and its share goes to the others: C done -> 10, 10; only the own open -> 20", () => {
    expect([...reachShares(VAULTS, [OWN, B]).entries()]).toEqual([
      [OWN, 10],
      [B, 10],
    ]);
    expect([...reachShares(VAULTS, [OWN]).entries()]).toEqual([[OWN, 20]]);
    // Order is the held order, whatever order `open` is given in.
    expect([...reachShares(VAULTS, [C, B]).entries()]).toEqual([
      [B, 10],
      [C, 10],
    ]);
  });

  it("nothing open: no page; a vault not held is not read", () => {
    expect(reachShares(VAULTS, []).size).toBe(0);
    expect([...reachShares(VAULTS, ["https://elsewhere.example.test/vault", B]).entries()]).toEqual([[B, 20]]);
  });

  it("the shares of 1..20 open vaults add up to exactly 20; the known edge above 20 gives 1 each, never 0", () => {
    for (let n = 1; n <= 20; n++) {
      const vs = Array.from({ length: n }, (_, i) => `v${i}`);
      expect([...reachShares(vs, vs).values()].reduce((a, b) => a + b, 0)).toBe(STAKEHOLDER_LIST_REACH_CAP);
    }
    const many = Array.from({ length: 25 }, (_, i) => `v${i}`);
    expect(new Set(reachShares(many, many).values())).toEqual(new Set([1]));
  });
});

describe("the reader shares one reach's 20 records across the held vaults", () => {
  // Spec: the reach cap and List.RequestsPerScreen. 120/60/20, worked by hand:
  //   reaches 1-3: 7/7/6 (C: 6, 12, 18), reach 4: 7/7/6 (C brings its last 2, done)
  //   reaches 5-7: 10/10 (B: 38, 48, 58), reach 8: 10/10 (B brings its last 2, done)
  //   reaches 9-11: 20 (own has read 4 x 7 + 4 x 10 = 68: then 88, 108, and its last 12) -> 11 reaches.
  it("200 records over 3 uneven vaults (120/60/20) take 11 reaches, not 18; every record once", async () => {
    const { deps, counts, asked } = door(true);
    const { reaches, list } = await walk(deps, counts, asked);
    expect(reaches.length).toBe(11);
    expect(recordCount(list)).toBe(200);
    expect(reaches.map((r) => r.limits)).toEqual([
      [7, 7, 6],
      [7, 7, 6],
      [7, 7, 6],
      [7, 7, 6],
      [10, 10],
      [10, 10],
      [10, 10],
      [10, 10],
      [20],
      [20],
      [20],
    ]);
    expect(reaches.map((r) => r.brought)).toEqual([20, 20, 20, 16, 20, 20, 20, 12, 20, 20, 12]);
  });

  it("each reach: one page per open vault, at most 20 records, and at most 40 requests with every record linked", async () => {
    const { deps, counts, asked } = door(true);
    const { reaches } = await walk(deps, counts, asked);
    for (const r of reaches) {
      expect(new Set(r.pages).size).toBe(r.pages.length);
      expect(r.limits.reduce((a, b) => a! + b!, 0)).toBe(20);
      expect(r.brought).toBeLessThanOrEqual(20);
      expect(r.requests).toBeLessThanOrEqual(40);
    }
    // Measured, not bounded: the first reach is 1 connections + 3 pages + 20 resolves; a reach after it, pages + resolves.
    expect(reaches.map((r) => r.requests)).toEqual([24, 23, 23, 19, 22, 22, 22, 14, 21, 21, 13]);
    expect(total(counts)).toBe(224);
  });

  it("before (a door that keeps the old static split): the same 200 records take 18 reaches", async () => {
    // The baseline the fix is measured against: own 120 / 7 a page = 18 pages, one per reach.
    const { deps, counts, asked } = door(false);
    const { reaches, list } = await walk(deps, counts, asked);
    expect(reaches.length).toBe(18);
    expect(recordCount(list)).toBe(200);
  });

  it("a failed vault is still open: it keeps its share, is asked again from where it stopped, and the others are not starved", async () => {
    const { deps, asked } = door(true, { vault: B, times: 1 });
    const reader = createStakeholderListReader(deps);
    const first = await reader.read();
    expect(first.vaults.find((v) => v.vaultId === B)?.state).toBe("failed");
    const n = asked.length;
    await reader.more();
    expect(asked.slice(n)).toEqual([
      { vault: OWN, offset: 7, limit: 7 },
      { vault: B, offset: 0, limit: 7 },
      { vault: C, offset: 6, limit: 6 },
    ]);
  });

  it("refresh starts again from the first pages with every vault open: 7, 7, 6", async () => {
    const { deps, counts, asked } = door(true);
    const reader = createStakeholderListReader(deps);
    await reader.read();
    for (let i = 0; i < 4; i++) await reader.more(); // reaches 2-5: C is done after reach 4, so reach 5 reads 2 pages
    const n = asked.length;
    await reader.refresh();
    expect(asked.slice(n).map((a) => [a.offset, a.limit])).toEqual([
      [0, 7],
      [0, 7],
      [0, 6],
    ]);
    expect(counts.listRecords).toBe(3 * 4 + 2 + 3);
  });

  it("a complete list asks nothing more", async () => {
    const { deps, asked } = door(true);
    const reader = createStakeholderListReader(deps);
    let l = await reader.read();
    while (!l.complete) l = await reader.more();
    const n = asked.length;
    await reader.more();
    expect(asked.length).toBe(n);
  });
});
