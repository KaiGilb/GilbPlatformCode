// The stakeholder list reader with fake doors.
import { describe, expect, it } from "vitest";
import { sleep } from "../test/clock";
import {
  createStakeholderListReader,
  readStakeholderList,
  LINK_READ_CONCURRENCY,
  NAME_READ_CONCURRENCY,
  type ListedRecord,
  type NameAnswer,
  type RecordsPage,
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
const RP: AtomicPlacement = { context: "professional", depth: "first-degree" };
const CORA = "https://holder.example.test/vault";
const V1 = "https://holder.example.test/vault";
const V2 = "https://holder-work.example.test/vault";
const OWN = `${V1}/e/vsc-cora`;
const who = (n: string | number): string => `https://p${n}.example.test/vault`;
const PAGE = 20;

interface World {
  people: { principal: string; placements: AtomicPlacement[] }[];
  /** vault -> its records, in the door's order. */
  records: Map<string, { id: string; title: string; target: string | null; updatedAt?: number }[]>;
  /** record id -> the principal its link resolves to (absent: the resolver answers none). */
  resolves: Map<string, string>;
  names: Map<string, string>;
}

const rec = (vault: string, id: string, title: string, target: string | null = null) => ({ id: `${vault}/e/${id}`, title, target });

/** Counting fakes for every injected door, with a log of what was asked and the most in flight at once. */
function harness(world: World, over: Partial<StakeholderListDeps> = {}) {
  const calls = { connections: 0, listRecords: 0, linkedRecordIds: 0, readLink: 0, resolve: 0, canonical: 0, readName: 0 };
  const log: string[] = [];
  const inFlight = { readLink: 0, readLinkMax: 0, readName: 0, readNameMax: 0, resolve: 0, resolveMax: 0 };
  const tick = () => sleep(1);
  const byId = new Map<string, { id: string; title: string; target: string | null; updatedAt?: number }>();
  for (const list of world.records.values()) for (const r of list) byId.set(r.id, r);
  const deps: StakeholderListDeps = {
    holder: CORA,
    vaults: [...world.records.keys()],
    ownCardIds: [OWN],
    async connections(): Promise<ConnectionsReading> {
      calls.connections++;
      log.push("connections");
      return { holder: CORA, vaultId: V1, sets: [], people: world.people.map((p) => ({ principal: p.principal, placements: [...p.placements] })) };
    },
    async listRecords(vaultId: string, offset: number): Promise<RecordsPage> {
      calls.listRecords++;
      log.push(`listRecords ${vaultId} ${offset}`);
      const all = world.records.get(vaultId) ?? [];
      const page = all.slice(offset, offset + PAGE);
      const records: ListedRecord[] = page.map((r) => ({ recordId: r.id, title: r.title, updatedAt: r.updatedAt ?? 1 }));
      return { records, next: offset + PAGE < all.length ? offset + PAGE : null };
    },
    async linkedRecordIds(vaultId: string): Promise<string[]> {
      calls.linkedRecordIds++;
      log.push(`linkedRecordIds ${vaultId}`);
      return (world.records.get(vaultId) ?? []).filter((r) => r.target).map((r) => r.id);
    },
    async readLink(recordId: string): Promise<LinkReading> {
      calls.readLink++;
      inFlight.readLink++;
      inFlight.readLinkMax = Math.max(inFlight.readLinkMax, inFlight.readLink);
      await tick();
      inFlight.readLink--;
      log.push(`readLink ${recordId}`);
      const r = byId.get(recordId);
      return r?.target ? { state: "linked", target: r.target } : { state: "none" };
    },
    async resolve(recordId: string): Promise<ResolveOutcome> {
      calls.resolve++;
      inFlight.resolve++;
      inFlight.resolveMax = Math.max(inFlight.resolveMax, inFlight.resolve);
      await tick();
      inFlight.resolve--;
      log.push(`resolve ${recordId}`);
      const p = world.resolves.get(recordId);
      return p ? { kind: "person", principal: p, entity: `${p}/e/card` } : { kind: "none" };
    },
    async canonical(member: string): Promise<string | null> {
      calls.canonical++;
      return member;
    },
    async readName(principal: string): Promise<NameAnswer> {
      calls.readName++;
      inFlight.readName++;
      inFlight.readNameMax = Math.max(inFlight.readNameMax, inFlight.readName);
      await tick();
      inFlight.readName--;
      log.push(`readName ${principal}`);
      const n = world.names.get(principal);
      return n === undefined ? { kind: "none" } : { kind: "name", name: n };
    },
    ...over,
  };
  return { deps, calls, log, inFlight };
}

/** Cora today: 5 placed, records in two vaults, one linked (Dan), the own card. */
function coraToday(): World {
  const dan = who("dan");
  return {
    people: [
      { principal: who("walt"), placements: [PP] },
      { principal: who("eli"), placements: [RP] },
      { principal: who("finn"), placements: [RP] },
      { principal: who("gus"), placements: [PP, RP] },
      { principal: dan, placements: [RP] },
    ],
    records: new Map([
      [V1, [rec(V1, "vsc-cora", "Cora Hale"), rec(V1, "dan", "Dan", dan)]],
      [V2, [rec(V2, "acme", "Acme contact")]],
    ]),
    resolves: new Map([[`${V1}/e/dan`, dan]]),
    names: new Map([
      [who("walt"), "Walt Hale"],
      [who("eli"), "Eli"],
      [who("finn"), "Finn"],
      [who("gus"), "Gus"],
    ]),
  };
}

/** A big holder: `placed` people, `records` records in V1, every 10th record linked to a placed person. */
function big(placed: number, records: number): World {
  const people = Array.from({ length: placed }, (_, i) => ({ principal: who(i), placements: [PP] }));
  const list = Array.from({ length: records }, (_, i) =>
    rec(V1, `r${String(i).padStart(4, "0")}`, `Record ${i}`, i % 10 === 0 && placed ? who((i / 10) % placed) : null),
  );
  const resolves = new Map(list.filter((r) => r.target).map((r) => [r.id, r.target!] as [string, string]));
  return { people, records: new Map([[V1, list]]), resolves, names: new Map(people.map((p, i) => [p.principal, `Person ${i}`])) };
}

describe("readStakeholderList", () => {
  describe("gathering: one list from the four inputs", () => {
    // Cora sees Cora Hale (Me) first, Dan once, then the placed people.
    it("Cora today: self first, Dan once as 'both', the other record, then the four placed-only people", async () => {
      const { deps } = harness(coraToday());
      const list = await readStakeholderList(deps);
      expect(list.rows.map((r) => [r.kind, r.key])).toEqual([
        ["self", CORA],
        ["both", who("dan")],
        ["record", `${V2}/e/acme`],
        ["placed", who("eli")],
        ["placed", who("finn")],
        ["placed", who("gus")],
        ["placed", who("walt")],
      ]);
      expect(list.rows[0]).toMatchObject({ recordId: OWN, title: "Cora Hale", vaultId: V1 });
      expect(list.partial).toBe(false);
      expect(list.connections).toEqual({ state: "read" });
      expect(list.vaults.map((v) => [v.vaultId, v.state, v.complete])).toEqual([
        [V1, "read", true],
        [V2, "read", true],
      ]);
      expect(list.links.unchecked).toEqual([]);
    });

    // connections 1, records 1 per vault, find 1 per vault, linked records whole 1 each,
    // resolver 1 per linked record, names 0 until a window asks.
    it("Cora today: the first draw costs the plan's budget, and no name is read before a window asks", async () => {
      const { deps, calls } = harness(coraToday());
      await readStakeholderList(deps);
      expect(calls).toEqual({ connections: 1, listRecords: 2, linkedRecordIds: 2, readLink: 1, resolve: 1, canonical: 0, readName: 0 });
    });

    it("the reader never reads a record's link when the find says it carries none", async () => {
      const { deps, log } = harness(coraToday());
      await readStakeholderList(deps);
      expect(log.filter((l) => l.startsWith("readLink"))).toEqual([`readLink ${V1}/e/dan`]);
    });

    it("a link the records door already carries costs no find and no record read", async () => {
      const w = coraToday();
      const { deps, calls } = harness(w, {
        async listRecords(vaultId: string): Promise<RecordsPage> {
          calls.listRecords++;
          const records: ListedRecord[] = (w.records.get(vaultId) ?? []).map((r) => ({
            recordId: r.id,
            title: r.title,
            link: r.target ? { state: "linked", target: r.target } : { state: "none" },
          }));
          return { records, next: null };
        },
      });
      const list = await readStakeholderList(deps);
      expect(list.rows.find((r) => r.key === who("dan"))?.kind).toBe("both");
      expect(calls.linkedRecordIds).toBe(0);
      expect(calls.readLink).toBe(0);
      expect(calls.resolve).toBe(1);
    });

    it("without a find door, each record on the PAGE is read for its link (at most one page), 6 at a time", async () => {
      const { deps, calls, inFlight } = harness(big(5, 200), { linkedRecordIds: undefined });
      const list = await readStakeholderList(deps);
      expect(calls.readLink).toBe(PAGE);
      expect(inFlight.readLinkMax).toBeLessThanOrEqual(LINK_READ_CONCURRENCY);
      expect(LINK_READ_CONCURRENCY).toBe(3);
      expect(list.rows.filter((r) => r.kind === "both").length).toBe(2);
    });

    // Spec: List.NeverByName — a record titled like a placed person, with no link, is its own row.
    it("never by name: a record titled 'Walt Hale' with no link does not join placed Walt", async () => {
      const w = coraToday();
      w.records.get(V2)!.push(rec(V2, "waltrec", "Walt Hale"));
      const { deps } = harness(w);
      const list = await readStakeholderList(deps);
      expect(list.rows.find((r) => r.key === who("walt"))?.kind).toBe("placed");
      expect(list.rows.find((r) => r.key === `${V2}/e/waltrec`)?.kind).toBe("record");
    });

    it("a resolver answer that is not a person (organization, none) leaves the record a record row, and is kept", async () => {
      const w = coraToday();
      w.records.get(V2)!.push(rec(V2, "org", "Acme", "https://acme.example.test/vault"));
      const { deps, calls } = harness(w, {
        async resolve(recordId: string): Promise<ResolveOutcome> {
          calls.resolve++;
          return recordId.endsWith("/org") ? { kind: "organization", vaultId: "https://acme.example.test/vault", entity: "x" } : { kind: "person", principal: who("dan"), entity: "y" };
        },
      });
      const reader = createStakeholderListReader(deps);
      const list = await reader.read();
      expect(list.rows.find((r) => r.key === `${V2}/e/org`)?.kind).toBe("record");
      expect(list.links.unchecked).toEqual([]);
      const before = calls.resolve;
      await reader.refresh();
      expect(calls.resolve).toBe(before);
    });

    it("a placed member under a legacy spelling joins its linked record through the canonicaliser, asked only when needed", async () => {
      const legacy = "https://walt.example.test/i";
      const w = coraToday();
      w.people = w.people.map((p) => (p.principal === who("walt") ? { ...p, principal: legacy } : p));
      w.records.get(V2)!.push(rec(V2, "waltrec", "Walt", who("walt")));
      w.resolves.set(`${V2}/e/waltrec`, who("walt"));
      const { deps, calls } = harness(w, {
        async canonical(m: string) {
          calls.canonical++;
          return m === legacy ? who("walt") : m;
        },
      });
      const list = await readStakeholderList(deps);
      expect(list.rows.find((r) => r.key === who("walt"))).toMatchObject({ kind: "both", placements: [PP], recordId: `${V2}/e/waltrec` });
      expect(calls.canonical).toBeGreaterThan(0);

      // With every link matching a member exactly, nothing is canonicalised.
      const plain = harness(coraToday());
      await readStakeholderList(plain.deps);
      expect(plain.calls.canonical).toBe(0);
    });

    it("the own card given in its `/lws/r/` form is still the self row, never a contact", async () => {
      const { deps } = harness(coraToday(), { ownCardIds: ["https://holder.example.test/lws/r/vsc-cora"] });
      const list = await readStakeholderList(deps);
      expect(list.rows[0]).toMatchObject({ kind: "self", recordId: OWN, title: "Cora Hale" });
      expect(list.rows.filter((r) => r.recordId === OWN)).toHaveLength(1);
    });
  });

  describe("paging", () => {
    it("the first draw reads ONE page per vault; more() reads the next page only of the vaults that have one", async () => {
      const w = big(5, 45);
      w.records.set(V2, [rec(V2, "only", "Only one")]);
      const { deps, calls, log } = harness(w);
      const reader = createStakeholderListReader(deps);
      const first = await reader.read();
      expect(calls.listRecords).toBe(2);
      expect(first.complete).toBe(false);
      expect(first.vaults.map((v) => v.complete)).toEqual([false, true]);
      const recordRows = (l: typeof first) => l.rows.filter((r) => r.recordId && r.kind !== "self").length + l.rows.reduce((n, r) => n + (r.kind === "self" ? 0 : r.alsoRecords), 0);
      expect(recordRows(first)).toBe(PAGE + 1);

      log.length = 0;
      const second = await reader.more();
      expect(log.filter((l) => l.startsWith("listRecords"))).toEqual([`listRecords ${V1} 20`]);
      expect(recordRows(second)).toBe(2 * PAGE + 1);
      const third = await reader.more();
      expect(third.complete).toBe(true);
      expect(recordRows(third)).toBe(45 + 1);
      const callsAtEnd = calls.listRecords;
      await reader.more();
      expect(calls.listRecords).toBe(callsAtEnd);
    });

    it("the find door is asked once per vault, not once per page", async () => {
      const { deps, calls } = harness(big(5, 60));
      const reader = createStakeholderListReader(deps);
      await reader.read();
      await reader.more();
      await reader.more();
      expect(calls.linkedRecordIds).toBe(1);
    });

    // Spec: List.RequestsPerScreen — no per-row card read for the whole list.
    it("300 placed and 200 records: the first draw reads no name and at most one page of links", async () => {
      const { deps, calls } = harness(big(300, 200));
      const list = await readStakeholderList(deps);
      expect(list.rows.filter((r) => r.kind === "placed").length + list.rows.filter((r) => r.kind === "both").length).toBe(300);
      expect(calls.readName).toBe(0);
      expect(calls.readLink).toBeLessThanOrEqual(PAGE);
      expect(calls.resolve).toBeLessThanOrEqual(PAGE);
      expect(calls.connections + calls.listRecords + calls.linkedRecordIds + calls.readLink + calls.resolve).toBeLessThanOrEqual(40);
    });
  });

  describe("names: only for rows in the visible window", () => {
    it("reads names only for placed-only rows among the keys asked, 3 at a time", async () => {
      const { deps, calls, inFlight } = harness(big(300, 20));
      const reader = createStakeholderListReader(deps);
      const list = await reader.read();
      const window = list.rows.slice(0, 30).map((r) => r.key);
      const placedInWindow = list.rows.slice(0, 30).filter((r) => r.kind === "placed").length;
      const names = await reader.names(window);
      expect(calls.readName).toBe(placedInWindow);
      expect(inFlight.readNameMax).toBeLessThanOrEqual(NAME_READ_CONCURRENCY);
      expect(NAME_READ_CONCURRENCY).toBe(3);
      const firstPlaced = list.rows.find((r) => r.kind === "placed")!;
      expect(names.get(firstPlaced.key)).toEqual({ state: "name", name: expect.stringMatching(/^Person /) });
      // A record row and the self row are never name-read: they show their record's title.
      expect(names.has(list.rows[0]!.key)).toBe(false);
    });

    it("an answered name is kept: asking the same window again sends nothing", async () => {
      const { deps, calls } = harness(coraToday());
      const reader = createStakeholderListReader(deps);
      const list = await reader.read();
      const keys = list.rows.map((r) => r.key);
      await reader.names(keys);
      const after = calls.readName;
      expect(after).toBe(4);
      const again = await reader.names(keys);
      expect(calls.readName).toBe(after);
      expect(again.get(who("walt"))).toEqual({ state: "name", name: "Walt Hale" });
    });

    it("the same name asked twice at once is read once", async () => {
      const { deps, calls } = harness(coraToday());
      const reader = createStakeholderListReader(deps);
      await reader.read();
      await Promise.all([reader.names([who("walt")]), reader.names([who("walt")])]);
      expect(calls.readName).toBe(1);
    });

    it("'none' (a group, no card) is an answer and is kept; a failure is 'unavailable' and is asked again", async () => {
      const w = coraToday();
      let fail = true;
      const { deps, calls } = harness(w, {
        async readName(principal: string): Promise<NameAnswer> {
          calls.readName++;
          if (principal === who("finn")) return { kind: "none" };
          if (principal === who("eli") && fail) throw new Error("503");
          if (principal === who("gus") && fail) return { kind: "unavailable" };
          return { kind: "name", name: w.names.get(principal) ?? null };
        },
      });
      const reader = createStakeholderListReader(deps);
      await reader.read();
      const keys = [who("finn"), who("eli"), who("gus")];
      const one = await reader.names(keys);
      expect(one.get(who("finn"))).toEqual({ state: "none" });
      expect(one.get(who("eli"))).toEqual({ state: "unavailable" });
      expect(one.get(who("gus"))).toEqual({ state: "unavailable" });
      fail = false;
      const before = calls.readName;
      const two = await reader.names(keys);
      expect(calls.readName - before).toBe(2);
      expect(two.get(who("eli"))).toEqual({ state: "name", name: "Eli" });
    });

    it("a key that is not a row of the list is not read", async () => {
      const { deps, calls } = harness(coraToday());
      const reader = createStakeholderListReader(deps);
      await reader.read();
      await reader.names(["https://stranger.example.test/vault"]);
      expect(calls.readName).toBe(0);
    });
  });

  describe("caching: a refresh costs only the reads that can change", () => {
    // a re-render costs records 1 per vault + find 1 per vault; the resolver and the link
    // reads come from the session cache; the connections come from the app's session read.
    it("refresh: connections asked again (the app's cache answers), records and find once per vault, no link read, no resolver", async () => {
      const { deps, calls } = harness(coraToday());
      const reader = createStakeholderListReader(deps);
      await reader.read();
      const before = { ...calls };
      const list = await reader.refresh();
      expect({
        connections: calls.connections - before.connections,
        listRecords: calls.listRecords - before.listRecords,
        linkedRecordIds: calls.linkedRecordIds - before.linkedRecordIds,
        readLink: calls.readLink - before.readLink,
        resolve: calls.resolve - before.resolve,
      }).toEqual({ connections: 1, listRecords: 2, linkedRecordIds: 2, readLink: 0, resolve: 0 });
      expect(list.rows.find((r) => r.key === who("dan"))?.kind).toBe("both");
    });

    it("a record the door says changed (new updatedAt) has its link read again", async () => {
      const w = coraToday();
      const { deps, calls } = harness(w);
      const reader = createStakeholderListReader(deps);
      await reader.read();
      const jr = w.records.get(V1)!.find((r) => r.id.endsWith("/dan"))!;
      jr.updatedAt = 2;
      const before = calls.readLink;
      await reader.refresh();
      expect(calls.readLink - before).toBe(1);
    });

    it("a link changed to another person resolves again (cached by record AND target)", async () => {
      const w = coraToday();
      const { deps, calls } = harness(w);
      const reader = createStakeholderListReader(deps);
      await reader.read();
      const jr = w.records.get(V1)!.find((r) => r.id.endsWith("/dan"))!;
      jr.target = who("walt");
      jr.updatedAt = 3;
      w.resolves.set(jr.id, who("walt"));
      const before = calls.resolve;
      const list = await reader.refresh();
      expect(calls.resolve - before).toBe(1);
      expect(list.rows.find((r) => r.key === who("walt"))?.kind).toBe("both");
      expect(list.rows.find((r) => r.key === who("dan"))?.kind).toBe("placed");
    });

    it("refresh starts the paging again from the first page", async () => {
      const { deps, log } = harness(big(5, 60));
      const reader = createStakeholderListReader(deps);
      await reader.read();
      await reader.more();
      log.length = 0;
      const list = await reader.refresh();
      expect(log.filter((l) => l.startsWith("listRecords"))).toEqual([`listRecords ${V1} 0`]);
      expect(list.complete).toBe(false);
    });
  });

  describe("failure of each input: a partial list with a clear state, never empty-looking silence", () => {
    it("connections fail -> the records are still listed, the self row is first, and the list says the circles could not be read", async () => {
      const { deps } = harness(coraToday(), {
        async connections(): Promise<ConnectionsReading> {
          throw new Error("401 not signed in");
        },
      });
      const list = await readStakeholderList(deps);
      expect(list.connections).toEqual({ state: "failed", reason: expect.stringContaining("401") });
      expect(list.partial).toBe(true);
      expect(list.rows[0]).toMatchObject({ kind: "self", key: CORA, recordId: OWN });
      expect(list.rows.map((r) => r.kind)).toEqual(["self", "record", "record"]);
      // Dan's record is still there, keyed to its resolved link (not placed: the circles were not read).
      expect(list.rows.find((r) => r.key === who("dan"))?.recordId).toBe(`${V1}/e/dan`);
    });

    it("connections answered for another vault -> read as failed ('wrong vault'), records still listed", async () => {
      const { deps } = harness(coraToday(), {
        async connections(): Promise<ConnectionsReading> {
          return { holder: CORA, vaultId: "https://elsewhere.example.test/vault", sets: [], people: [] };
        },
      });
      const list = await readStakeholderList({ ...deps, holderVault: V1 });
      expect(list.connections).toEqual({ state: "failed", reason: expect.stringContaining("another vault") });
      expect(list.rows.length).toBe(3);
    });

    it("one vault's records fail -> the other vault and the placed people are listed; that vault says failed", async () => {
      const w = coraToday();
      const h = harness(w);
      const inner = h.deps.listRecords;
      const deps: StakeholderListDeps = {
        ...h.deps,
        async listRecords(vaultId: string, offset: number) {
          if (vaultId === V2) throw new Error("503 vault unreachable");
          return inner(vaultId, offset);
        },
      };
      const list = await readStakeholderList(deps);
      expect(list.partial).toBe(true);
      expect(list.vaults).toEqual([
        { vaultId: V1, state: "read", complete: true },
        { vaultId: V2, state: "failed", complete: false, reason: expect.stringContaining("503") },
      ]);
      expect(list.rows.map((r) => r.key)).toContain(who("walt"));
      expect(list.rows.map((r) => r.key)).not.toContain(`${V2}/e/acme`);
      expect(list.complete).toBe(false);
    });

    it("a failed vault is asked again by more() from where it stopped", async () => {
      let fail = true;
      const h = harness(coraToday());
      const inner = h.deps.listRecords;
      const reader = createStakeholderListReader({
        ...h.deps,
        async listRecords(vaultId: string, offset: number) {
          if (vaultId === V2 && fail) throw new Error("503");
          return inner(vaultId, offset);
        },
      });
      await reader.read();
      fail = false;
      const list = await reader.more();
      expect(list.vaults[1]).toEqual({ vaultId: V2, state: "read", complete: true });
      expect(list.rows.map((r) => r.key)).toContain(`${V2}/e/acme`);
      expect(list.partial).toBe(false);
    });

    it("the find fails -> the links on the page are read one by one instead; the list is the same", async () => {
      const { deps, calls } = harness(coraToday(), {
        async linkedRecordIds(): Promise<string[]> {
          throw new Error("find-by-attribute failed: 500");
        },
      });
      const list = await readStakeholderList(deps);
      expect(list.rows.find((r) => r.key === who("dan"))?.kind).toBe("both");
      expect(calls.readLink).toBe(3);
      expect(list.partial).toBe(false);
    });

    it("a record read fails -> that record stays a record row, its id is in links.unchecked, and the next refresh asks again", async () => {
      let fail = true;
      const h = harness(coraToday());
      const inner = h.deps.readLink;
      const reader = createStakeholderListReader({
        ...h.deps,
        async readLink(id: string) {
          if (fail) throw new Error("503");
          return inner(id);
        },
      });
      const list = await reader.read();
      expect(list.links.unchecked).toEqual([`${V1}/e/dan`]);
      expect(list.partial).toBe(true);
      expect(list.rows.find((r) => r.recordId === `${V1}/e/dan`)?.kind).toBe("record");
      expect(list.rows.find((r) => r.key === who("dan"))?.kind).toBe("placed");
      fail = false;
      const again = await reader.refresh();
      expect(again.links.unchecked).toEqual([]);
      expect(again.rows.find((r) => r.key === who("dan"))?.kind).toBe("both");
    });

    for (const [label, outcome] of [
      ["unavailable", { kind: "unavailable", status: 503 }],
      ["busy", { kind: "busy", retryAfterMs: 1000 }],
      ["unauthenticated", { kind: "unauthenticated" }],
      ["a throw", null],
    ] as const) {
      it(`the resolver answers ${label} -> the record stays a record row, flagged unchecked, and is asked again on refresh`, async () => {
        let fail = true;
        const h = harness(coraToday());
        const inner = h.deps.resolve;
        const reader = createStakeholderListReader({
          ...h.deps,
          async resolve(id: string): Promise<ResolveOutcome> {
            h.calls.resolve++;
            if (fail) {
              if (outcome === null) throw new Error("boom");
              return outcome as ResolveOutcome;
            }
            return inner(id);
          },
          // A 429 is waited out (retry-after) before it is flagged; the clock is injected so the test does not sleep.
        }, { wait: async () => undefined });
        const list = await reader.read();
        expect(list.links.unchecked).toEqual([`${V1}/e/dan`]);
        expect(list.rows.find((r) => r.recordId === `${V1}/e/dan`)?.kind).toBe("record");
        fail = false;
        const again = await reader.refresh();
        expect(again.rows.find((r) => r.key === who("dan"))?.kind).toBe("both");
      });
    }

    it("the canonicaliser fails (rejects) -> the members are compared by their own strings; the list is drawn", async () => {
      const legacy = "https://walt.example.test/i";
      const w = coraToday();
      w.people = w.people.map((p) => (p.principal === who("walt") ? { ...p, principal: legacy } : p));
      w.records.get(V2)!.push(rec(V2, "waltrec", "Walt", who("walt")));
      w.resolves.set(`${V2}/e/waltrec`, who("walt"));
      const { deps } = harness(w, {
        async canonical(): Promise<string | null> {
          throw new Error("resolve-person 503");
        },
      });
      const list = await readStakeholderList(deps);
      expect(list.rows.find((r) => r.key === legacy)?.kind).toBe("placed");
      expect(list.rows.find((r) => r.key === who("walt"))?.kind).toBe("record");
      expect(list.rows.length).toBe(8);
    });

    // a person placed under an old spelling who is not joined makes `partial` true, and the flag
    // names the reason. The two rows may stay, never silently.
    const legacyCase = () => {
      const legacy = "https://walt.example.test/i";
      const w = coraToday();
      w.people = w.people.map((p) => (p.principal === who("walt") ? { ...p, principal: legacy } : p));
      w.records.get(V2)!.push(rec(V2, "waltrec", "Walt", who("walt")));
      w.resolves.set(`${V2}/e/waltrec`, who("walt"));
      return { legacy, w };
    };

    it("the canonicaliser could not ask (null, not an answer) -> spellings are flagged unresolved", async () => {
      const { w } = legacyCase();
      const canonical = Object.assign(async () => null, { answered: () => false });
      const { deps } = harness(w, { canonical });
      const list = await readStakeholderList(deps);
      expect(list.spellings).toEqual({ state: "unresolved", reason: expect.stringContaining("spellings unresolved") });
      expect(list.partial).toBe(true);
    });

    it("no canonicaliser door while a link names nobody placed -> spellings unresolved, partial", async () => {
      const { w } = legacyCase();
      const { deps } = harness(w, { canonical: undefined });
      const list = await readStakeholderList(deps);
      expect(list.spellings.state).toBe("unresolved");
      expect(list.partial).toBe(true);
    });

    it("every member answered (null = names no person) -> spellings resolved, not partial", async () => {
      const { w } = legacyCase();
      const canonical = Object.assign(async () => null, { answered: () => true });
      const { deps } = harness(w, { canonical });
      const list = await readStakeholderList(deps);
      expect(list.spellings).toEqual({ state: "resolved" });
      expect(list.partial).toBe(false);
    });

    it("no link needs a spelling check -> spellings 'not-needed', and nothing is asked", async () => {
      const { deps, calls } = harness(coraToday());
      const list = await readStakeholderList(deps);
      expect(list.spellings).toEqual({ state: "not-needed" });
      expect(calls.canonical).toBe(0);
    });

    it("a failed spelling check is asked again on refresh and clears the flag when it answers", async () => {
      const { w, legacy } = legacyCase();
      let fail = true;
      const { deps } = harness(w, {
        async canonical(m: string) {
          if (fail) throw new Error("resolve-person 503");
          return m === legacy ? who("walt") : m;
        },
      });
      const reader = createStakeholderListReader(deps);
      expect((await reader.read()).spellings.state).toBe("unresolved");
      fail = false;
      const again = await reader.refresh();
      expect(again.spellings).toEqual({ state: "resolved" });
      expect(again.rows.find((r) => r.key === who("walt"))?.kind).toBe("both");
      expect(again.partial).toBe(false);
    });

    it("everything fails -> the self row alone, and every input says it failed (never a silent empty list)", async () => {
      const { deps } = harness(coraToday(), {
        async connections(): Promise<ConnectionsReading> {
          throw new Error("down");
        },
        async listRecords(): Promise<RecordsPage> {
          throw new Error("down");
        },
      });
      const list = await readStakeholderList(deps);
      expect(list.rows.map((r) => r.kind)).toEqual(["self"]);
      expect(list.partial).toBe(true);
      expect(list.connections.state).toBe("failed");
      expect(list.vaults.every((v) => v.state === "failed")).toBe(true);
    });
  });
});
