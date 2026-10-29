// The up-front linked read: a record linked to a placed person joins from the first draw, whatever page it is on.
import { describe, expect, it } from "vitest";
import { sleep } from "../test/clock";
import {
  createStakeholderListReader,
  LINKED_LOOKUP_CAP,
  type ListedRecord,
  type RecordsPage,
  type StakeholderList,
  type StakeholderListDeps,
} from "./index";
import {
  type AtomicPlacement,
  type ConnectionsReading,
} from "@kaigilb/gilbplatformcode-person-connections";

const PP: AtomicPlacement = { context: "personal", depth: "first-degree" };
const CORA = "https://holder.example.test/vault";
const V1 = "https://holder.example.test/vault";
const V2 = "https://acme.example.test/vault";
const OWN = `${V1}/e/vsc-cora`;
const who = (n: string | number): string => `https://p${n}.example.test/vault`;
const DAN = who("dan");

interface Rec {
  id: string;
  title: string;
  target: string | null;
}

/**
 * Cora: 3 placed people (Dan, Walt, Eli). His vault has 25 records, recent first; Dan's record (linked to Dan) is the
 * OLDEST, so it is on the last page. The pages are of 10, as with 2 held vaults.
 */
function world(opts: { linkedOnPage?: boolean } = {}) {
  const v1: Rec[] = [];
  for (let i = 0; i < 24; i++) v1.push({ id: `${V1}/e/r${i}`, title: `Record ${i}`, target: null });
  const danRec: Rec = { id: `${V1}/e/dan`, title: "Dan Rao", target: DAN };
  if (opts.linkedOnPage) v1.unshift(danRec);
  else v1.push(danRec);
  const v2: Rec[] = [{ id: `${V2}/e/beta`, title: "Beta Tools AS", target: null }];
  return {
    people: [DAN, who("walt"), who("eli")],
    records: new Map<string, Rec[]>([
      [V1, v1],
      [V2, v2],
    ]),
  };
}

type World = ReturnType<typeof world>;

function harness(w: World, over: Partial<StakeholderListDeps> = {}, opts: { withDoor?: boolean } = { withDoor: true }) {
  const calls = { listRecords: 0, linkedRecordsOf: 0, readLink: 0, resolve: 0 };
  const asked: string[][] = [];
  const byId = new Map<string, Rec>();
  for (const list of w.records.values()) for (const r of list) byId.set(r.id, r);
  const listed = (r: Rec): ListedRecord => ({
    recordId: r.id,
    title: r.title,
    type: "https://ontology.example.test/base/t/Person",
    link: r.target ? { state: "linked", target: r.target } : { state: "none" },
    updatedAt: 1,
  });
  const deps: StakeholderListDeps = {
    holder: CORA,
    vaults: [V1, V2],
    holderVault: V1,
    ownCardIds: [OWN],
    async connections(): Promise<ConnectionsReading> {
      return { holder: CORA, vaultId: V1, sets: [], people: w.people.map((principal) => ({ principal, placements: [PP] })) };
    },
    async listRecords(vaultId: string, offset: number, limit = 10): Promise<RecordsPage> {
      calls.listRecords++;
      const all = w.records.get(vaultId) ?? [];
      const page = all.slice(offset, offset + limit);
      return { records: page.map(listed), next: offset + limit < all.length ? offset + limit : null };
    },
    async readLink() {
      calls.readLink++;
      return { state: "none" };
    },
    async resolve(recordId: string) {
      calls.resolve++;
      const r = byId.get(recordId);
      return r?.target ? { kind: "person", principal: r.target, entity: `${r.target}/e/card` } : { kind: "none" };
    },
    async readName() {
      return { kind: "name", name: null };
    },
    ...(opts.withDoor
      ? {
          async linkedRecordsOf(members: readonly string[]) {
            calls.linkedRecordsOf++;
            asked.push([...members]);
            const out: { vaultId: string; record: ListedRecord }[] = [];
            for (const [vaultId, list] of w.records)
              for (const r of list) if (r.target && members.includes(r.target)) out.push({ vaultId, record: listed(r) });
            return out;
          },
        }
      : {}),
    ...over,
  };
  return { deps, calls, asked };
}

const rowOf = (l: StakeholderList, principal: string) => l.rows.filter((r) => r.principal === principal);

describe("a linked record joins its person from the first draw, whatever page it is on", () => {
  it("the linked record on the LAST page is one row with its person in the first settled draw", async () => {
    const w = world();
    const { deps, calls } = harness(w);
    const l = await createStakeholderListReader(deps).read();
    const dan = rowOf(l, DAN);
    expect(dan).toHaveLength(1);
    expect(dan[0]!.kind).toBe("both");
    expect(dan[0]!.recordId).toBe(`${V1}/e/dan`);
    // The first reach is still one page per vault (10 + 1 records): the linked record came from the door, not from more pages.
    expect(calls.listRecords).toBe(2);
    expect(calls.linkedRecordsOf).toBe(1);
    expect(l.complete).toBe(false);
  });

  it("control: without the door, the same world shows Dan as a placed row until his record's page comes", async () => {
    const w = world();
    const { deps } = harness(w, {}, { withDoor: false });
    const l = await createStakeholderListReader(deps).read();
    expect(rowOf(l, DAN).map((r) => r.kind)).toEqual(["placed"]);
  });

  it("asks once per draw, only for placed people no loaded record already links to, at most LINKED_LOOKUP_CAP of them", async () => {
    const many = world();
    for (let i = 0; i < LINKED_LOOKUP_CAP + 5; i++) many.people.push(who(`extra${i}`));
    const { deps, asked } = harness(many);
    await createStakeholderListReader(deps).read();
    expect(asked).toHaveLength(1);
    expect(asked[0]!.length).toBe(LINKED_LOOKUP_CAP);
    expect(asked[0]![0]).toBe(DAN);

    const onPage = world({ linkedOnPage: true });
    const h2 = harness(onPage);
    const l2 = await createStakeholderListReader(h2.deps).read();
    // Dan's record is on the first page and carries his link: he is not asked for.
    expect(h2.asked[0] ?? []).not.toContain(DAN);
    expect(rowOf(l2, DAN).map((r) => r.kind)).toEqual(["both"]);
  });

  it("more() does not ask again; the record's own page later gives no second row; refresh() asks again", async () => {
    const w = world();
    const { deps, calls } = harness(w);
    const reader = createStakeholderListReader(deps);
    await reader.read();
    let l = await reader.more();
    l = await reader.more();
    expect(l.complete).toBe(true);
    expect(calls.linkedRecordsOf).toBe(1);
    expect(rowOf(l, DAN)).toHaveLength(1);
    expect(l.rows.filter((r) => r.recordId === `${V1}/e/dan`)).toHaveLength(1);
    await reader.refresh();
    expect(calls.linkedRecordsOf).toBe(2);
  });

  it("a failed door changes nothing: the list is the one without it, not partial", async () => {
    const w = world();
    const { deps } = harness(w, {
      async linkedRecordsOf() {
        throw new Error("find-by-attribute failed: 503");
      },
    });
    const l = await createStakeholderListReader(deps).read();
    expect(rowOf(l, DAN).map((r) => r.kind)).toEqual(["placed"]);
    expect(l.partial).toBe(false);
  });

  it("a record the door names in a vault that is not held is not listed", async () => {
    const w = world();
    const { deps } = harness(w, {
      async linkedRecordsOf() {
        return [{ vaultId: "https://stranger.example.test/vault", record: { recordId: "https://stranger.example.test/vault/e/x", title: "X", link: { state: "linked", target: DAN } } }];
      },
    });
    const l = await createStakeholderListReader(deps).read();
    expect(l.rows.some((r) => r.recordId === "https://stranger.example.test/vault/e/x")).toBe(false);
  });

  it("the first rows do not wait for the door", async () => {
    const w = world();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const seen: StakeholderList[] = [];
    const { deps } = harness(w, {
      async linkedRecordsOf() {
        await gate;
        return [];
      },
    });
    const done = createStakeholderListReader(deps, { onRows: (l) => seen.push(l) }).read();
    for (let i = 0; i < 20 && seen.length === 0; i++) await sleep(1);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]!.settling).toBe(true);
    release();
    await done;
  });
});
