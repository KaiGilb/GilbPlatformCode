// The up-front linked read is given only the requests the first screen has left, and is not asked when nothing can be off the page.
import { describe, expect, it } from "vitest";
import { sleep } from "../test/clock";
import {
  createStakeholderListReader,
  FIRST_SCREEN_REQUESTS,
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
const WALT = who("walt");
const ELI = who("eli");

interface Rec {
  id: string;
  title: string;
  /** The link target as the record stores it. */
  target: string | null;
  /** The person the resolver names for that target (defaults to the target). */
  person?: string;
}

/** `records` records in V1 (recent first, Dan's the oldest unless `linkedOnPage`), one in V2; pages of 10. */
function world(opts: { records?: number; linkedOnPage?: boolean; danTarget?: string } = {}) {
  const v1: Rec[] = [];
  const n = opts.records ?? 24;
  for (let i = 0; i < n; i++) v1.push({ id: `${V1}/e/r${i}`, title: `Record ${i}`, target: null });
  const danRec: Rec = { id: `${V1}/e/dan`, title: "Dan Rao", target: opts.danTarget ?? DAN, person: DAN };
  if (opts.linkedOnPage) v1.unshift(danRec);
  else v1.push(danRec);
  return {
    people: [DAN, WALT, ELI],
    records: new Map<string, Rec[]>([
      [V1, v1],
      [V2, [{ id: `${V2}/e/beta`, title: "Beta Tools AS", target: null }]],
    ]),
  };
}
type World = ReturnType<typeof world>;

function harness(w: World, over: Partial<StakeholderListDeps> = {}) {
  const calls = { listRecords: 0, linkedRecordsOf: 0, resolve: 0, readName: 0 };
  const asked: { members: string[]; budget: number | undefined; resolvesBefore: number }[] = [];
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
      const page = all.slice(offset, offset + 10);
      void limit;
      return { records: page.map(listed), next: offset + 10 < all.length ? offset + 10 : null };
    },
    async readLink() {
      return { state: "none" };
    },
    async resolve(recordId: string) {
      calls.resolve++;
      const r = byId.get(recordId);
      return r?.target ? { kind: "person", principal: r.person ?? r.target, entity: `${r.target}/e/card` } : { kind: "none" };
    },
    async readName() {
      calls.readName++;
      return { kind: "name", name: null };
    },
    async linkedRecordsOf(members: readonly string[], budget?: number) {
      calls.linkedRecordsOf++;
      asked.push({ members: [...members], budget, resolvesBefore: calls.resolve });
      const out: { vaultId: string; record: ListedRecord }[] = [];
      for (const [vaultId, list] of w.records)
        for (const r of list) if (r.person && members.includes(r.person)) out.push({ vaultId, record: listed(r) });
      return out;
    },
    ...over,
  };
  return { deps, calls, asked };
}

const rowOf = (l: StakeholderList, principal: string) => l.rows.filter((r) => r.principal === principal);

describe("no up-front read when nothing can be off the page", () => {
  it("every held vault's first page is its last: the door is not asked (0 finds), and the list is the same", async () => {
    const w = world({ records: 3 });
    const { deps, calls } = harness(w);
    const l = await createStakeholderListReader(deps).read();
    expect(calls.linkedRecordsOf).toBe(0);
    expect(l.complete).toBe(true);
    expect(rowOf(l, DAN).map((r) => r.kind)).toEqual(["both"]);
  });

  it("control: one held vault has a next page, so the door is asked once", async () => {
    const w = world();
    const { deps, calls } = harness(w);
    await createStakeholderListReader(deps).read();
    expect(calls.linkedRecordsOf).toBe(1);
  });

  it("a person joined on the loaded pages through a link spelled otherwise (the resolver names them) is not asked for", async () => {
    const w = world({ linkedOnPage: true, danTarget: `${DAN}/e/card-of-dan` });
    const { deps, asked } = harness(w);
    const l = await createStakeholderListReader(deps).read();
    expect(rowOf(l, DAN).map((r) => r.kind)).toEqual(["both"]);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.members).toEqual([WALT, ELI]);
  });

  it("every placed person is joined on the loaded pages: the door is not asked", async () => {
    const w = world({ linkedOnPage: true });
    w.people.splice(1);
    const { deps, calls } = harness(w);
    await createStakeholderListReader(deps).read();
    expect(calls.linkedRecordsOf).toBe(0);
  });
});

describe("the budget: the up-front read gets only the requests the first screen has left", () => {
  it("is asked AFTER the page's own links are resolved, and the joined rows are out before it answers", async () => {
    const w = world({ linkedOnPage: true });
    w.people.push(who("ned"));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const seen: StakeholderList[] = [];
    const h = harness(w);
    const inner = h.deps.linkedRecordsOf!;
    h.deps.linkedRecordsOf = async (m, b) => {
      const out = await inner(m, b);
      await gate;
      return out;
    };
    const done = createStakeholderListReader(h.deps, { onRows: (l) => seen.push(l) }).read();
    for (let i = 0; i < 50 && h.asked.length === 0; i++) await sleep(1);
    expect(h.asked).toHaveLength(1);
    // Dan's record on the page was resolved before the door was asked …
    expect(h.asked[0]!.resolvesBefore).toBe(1);
    // … and a list with him joined was drawn while the door was still out.
    expect(seen.some((l) => rowOf(l, DAN)[0]?.kind === "both")).toBe(true);
    release();
    await done;
  });

  it("passes FIRST_SCREEN_REQUESTS minus what the screen has sent (requestsSoFar)", async () => {
    expect(FIRST_SCREEN_REQUESTS).toBe(40);
    const w = world();
    const { deps, asked } = harness(w, { requestsSoFar: () => 31 });
    await createStakeholderListReader(deps).read();
    expect(asked[0]!.budget).toBe(9);
  });

  it("never a negative budget: a screen already over 40 gives 0 (the door may still answer from what it kept)", async () => {
    const w = world();
    const { deps, asked } = harness(w, { requestsSoFar: () => 44 });
    await createStakeholderListReader(deps).read();
    expect(asked[0]!.budget).toBe(0);
  });

  it("a refresh counts from its own start, not from the screen's first draw", async () => {
    const w = world();
    let sent = 30;
    const h = harness(w, { requestsSoFar: () => sent });
    const reader = createStakeholderListReader(h.deps);
    await reader.read();
    sent = 120; // the create, the dialog, the card …
    const inner = h.deps.linkedRecordsOf!;
    h.deps.linkedRecordsOf = async (m, b) => inner(m, b);
    const listRecords = h.deps.listRecords.bind(h.deps);
    h.deps.listRecords = async (v, o, lim) => {
      sent++;
      return listRecords(v, o, lim);
    };
    await reader.refresh();
    expect(h.asked[1]!.budget).toBe(FIRST_SCREEN_REQUESTS - 2);
  });

  it("the name reads still waiting for a slot count as spent", async () => {
    const w = world();
    for (let i = 0; i < 6; i++) w.people.push(who(`n${i}`));
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    let reader!: ReturnType<typeof createStakeholderListReader>;
    let namesAsked = false;
    const h = harness(w, {
      requestsSoFar: () => 0,
      async readName() {
        await gate;
        return { kind: "name", name: null };
      },
    });
    reader = createStakeholderListReader(h.deps, {
      onRows: (l) => {
        if (namesAsked) return;
        namesAsked = true;
        // The list asks the window's names as soon as rows are drawn: 6 placed-only rows, 3 at a time.
        void reader.names(l.rows.filter((r) => r.kind === "placed" && r.principal?.includes("/pn")).map((r) => r.key));
      },
    });
    await reader.read();
    // 3 are in flight (the app's count sees them when they are sent), 3 wait for a slot and are counted by the reader.
    expect(h.asked[0]!.budget).toBe(FIRST_SCREEN_REQUESTS - 3);
    open();
  });

  it("without requestsSoFar the door gets no budget (it is bounded by LINKED_LOOKUP_CAP only)", async () => {
    const w = world();
    const { deps, asked } = harness(w);
    await createStakeholderListReader(deps).read();
    expect(asked[0]!.budget).toBeUndefined();
  });
});
