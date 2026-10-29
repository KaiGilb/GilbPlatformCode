// With the option `linkedNames`, the name of a linked row is read as a placed row's is.
import { describe, expect, it } from "vitest";
import { sleep } from "../test/clock";
import {
  NAME_READ_CONCURRENCY,
  createStakeholderListReader,
  type NameAnswer,
  type RecordsPage,
  type StakeholderListDeps,
} from "./index";
import {
  type AtomicPlacement,
  type ConnectionsReading,
} from "@kaigilb/gilbplatformcode-person-connections";

const PP: AtomicPlacement = { context: "personal", depth: "first-degree" };
const CORA = "https://holder.example.test/vault";
const who = (n: string | number): string => `https://p${n}.example.test/vault`;

/** `linked` placed people who each also have a linked record (both rows), `placed` placed-only people, one unlinked record. */
function world(linked: number, placed: number, over: Partial<StakeholderListDeps> = {}) {
  const calls = { connections: 0, listRecords: 0, linkedRecordIds: 0, readLink: 0, resolve: 0, readName: 0 };
  const inFlight = { now: 0, max: 0 };
  const read: string[] = [];
  const people = [...Array.from({ length: linked }, (_, i) => who(`l${i}`)), ...Array.from({ length: placed }, (_, i) => who(i))];
  const records = [
    { recordId: `${CORA}/e/vsc-cora`, title: "Cora Hale", link: { state: "none" as const } },
    ...Array.from({ length: linked }, (_, i) => ({ recordId: `${CORA}/e/l${i}`, title: `Linked ${i}`, link: { state: "linked" as const, target: who(`l${i}`) } })),
    { recordId: `${CORA}/e/acme`, title: "Acme", link: { state: "none" as const } },
  ];
  const deps: StakeholderListDeps = {
    holder: CORA,
    vaults: [CORA],
    ownCardIds: [`${CORA}/e/vsc-cora`],
    async connections(): Promise<ConnectionsReading> {
      calls.connections++;
      return { holder: CORA, vaultId: CORA, sets: [], people: people.map((principal) => ({ principal, placements: [PP] })) };
    },
    async listRecords(): Promise<RecordsPage> {
      calls.listRecords++;
      return { records, next: null };
    },
    async readLink() {
      calls.readLink++;
      return { state: "none" };
    },
    async resolve(id: string) {
      calls.resolve++;
      const r = records.find((x) => x.recordId === id);
      return r?.link.state === "linked" ? { kind: "person" as const, principal: r.link.target, entity: id } : { kind: "none" as const };
    },
    async readName(principal: string): Promise<NameAnswer> {
      calls.readName++;
      read.push(principal);
      inFlight.now++;
      inFlight.max = Math.max(inFlight.max, inFlight.now);
      await sleep(1);
      inFlight.now--;
      return { kind: "name", name: `Name of ${principal}`, photoUrl: `/photo?p=${principal}`, caption: "Hale AS" };
    },
    ...over,
  };
  const total = () => Object.values(calls).reduce((a, b) => a + b, 0);
  return { deps, calls, inFlight, read, total };
}

describe("createStakeholderListReader", () => {
  describe("names: linked rows and the self row", () => {
    it("reads the name answer of a linked (both) row in the window, with its photo and caption; a record and the self row without selfName are not read", async () => {
      const { deps, read } = world(2, 2);
      const reader = createStakeholderListReader(deps, { linkedNames: true });
      const list = await reader.read();
      const both = list.rows.filter((r) => r.kind === "both");
      expect(both.map((r) => r.principal)).toEqual([who("l0"), who("l1")]);
      const rec = list.rows.find((r) => r.kind === "record")!;
      const out = await reader.names([list.rows[0]!.key, rec.key, ...both.map((r) => r.key)]);
      expect(read.sort()).toEqual([who("l0"), who("l1")]);
      expect(out.get(both[0]!.key)).toStrictEqual({ state: "name", name: `Name of ${who("l0")}`, photoUrl: `/photo?p=${who("l0")}`, caption: "Hale AS" });
      expect(out.has(rec.key)).toBe(false);
      expect(out.has(list.rows[0]!.key)).toBe(false);
    });

    it("the window is the bound: at most one read per placed or linked row in the keys, 3 in flight, never a row outside the keys", async () => {
      const { deps, calls, inFlight, read } = world(40, 40);
      const reader = createStakeholderListReader(deps, { linkedNames: true });
      const list = await reader.read();
      const window = list.rows.slice(0, 20);
      const readable = window.filter((r) => r.kind === "both" || r.kind === "placed");
      await reader.names(window.map((r) => r.key));
      expect(calls.readName).toBe(readable.length);
      expect(calls.readName).toBeLessThanOrEqual(window.length);
      expect(inFlight.max).toBeLessThanOrEqual(NAME_READ_CONCURRENCY);
      const inWindow = new Set(window.map((r) => r.principal));
      for (const p of read) expect(inWindow.has(p)).toBe(true);
    });

    it("warm: asking the same window again costs 0 requests; a linked person's answer is shared with its principal", async () => {
      const { deps, total } = world(5, 5);
      const reader = createStakeholderListReader(deps, { linkedNames: true });
      const list = await reader.read();
      const keys = list.rows.map((r) => r.key);
      await reader.names(keys);
      const after = total();
      await reader.names(keys);
      await reader.names(keys);
      expect(total()).toBe(after);
    });

    it("the self row's answer comes from the own card the app already read (selfName): 0 requests, photo and caption kept", async () => {
      let asked = 0;
      const { deps, total, calls } = world(0, 1, {
        selfName: () => (asked++, { kind: "name", name: "Cora Hale", photoUrl: "/photo?p=cora", caption: "Hale AS" }),
      });
      const reader = createStakeholderListReader(deps, { linkedNames: true });
      const list = await reader.read();
      const before = total();
      const self = list.rows[0]!;
      expect(self.kind).toBe("self");
      const out = await reader.names([self.key]);
      expect(total()).toBe(before);
      expect(calls.readName).toBe(0);
      expect(asked).toBe(1);
      expect(out.get(self.key)).toStrictEqual({ state: "name", name: "Cora Hale", photoUrl: "/photo?p=cora", caption: "Hale AS" });
    });

    it("a selfName with nothing to say (null) leaves the self row out of the answer", async () => {
      const { deps } = world(0, 1, { selfName: () => null });
      const reader = createStakeholderListReader(deps, { linkedNames: true });
      const list = await reader.read();
      const out = await reader.names([list.rows[0]!.key]);
      expect(out.has(list.rows[0]!.key)).toBe(false);
    });

    it("by default (no linkedNames) a linked row is never read, also when its key is asked; placed-only rows are read as without the option", async () => {
      const { deps, read } = world(3, 2);
      const reader = createStakeholderListReader(deps);
      const list = await reader.read();
      const out = await reader.names(list.rows.map((r) => r.key));
      expect(read.sort()).toEqual([who(0), who(1)]);
      expect([...out.keys()].sort()).toEqual([who(0), who(1)]);
    });
  });
});
