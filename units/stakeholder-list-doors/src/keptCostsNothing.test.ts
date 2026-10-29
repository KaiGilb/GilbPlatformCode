// The refresh after a create must not drop the kept joins: a kept record costs 0 whatever the budget, every kept answer is returned, and
// the budget is spent only on new finds and new reads. Also through the shared reader with the doors, with the screen already past 40.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { QueryClient } from "@tanstack/react-query";
import { createStakeholderListReader, type ListedRecord, type RecordsPage, type StakeholderList } from "@kaigilb/gilbplatformcode-stakeholder-list-reader";
import { type ConnectionsReading } from "@kaigilb/gilbplatformcode-person-connections";
import { forgetLinkedRecords, stakeholderListDeps } from "./listDoors";
import { fakeDoorsHost, installPlatformHooks } from "../test/support";

const doorsHost = fakeDoorsHost();
installPlatformHooks();


/** A user vault on its own platform host (`<name>.platform.example.test`). */
const host = (name: string) => `https://${name}.platform.example.test`;
const OWN = `${host("kk")}/vault`;
const DAN = `${OWN}/i`;
const TYPES = ["Person", "Organization"];
const who = (n: string) => `${host(`p${n}`)}/vault`;

function resp(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body ?? ""),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  forgetLinkedRecords();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Records linked to members: `links[member]` = the record ids linked to that member (the find and the record read answer them). */
function world(links: Record<string, string[]>) {
  const seen: string[] = [];
  fetchMock.mockImplementation(async (input: string) => {
    const url = new URL(String(input));
    seen.push(url.toString());
    if (url.pathname.endsWith("/base/find-by-attribute")) {
      const member = (JSON.parse(url.searchParams.get("value") ?? "{}") as { "@id"?: string })["@id"] ?? "";
      const ids = links[member] ?? [];
      return resp(200, { count: ids.length, ids });
    }
    const m = url.pathname.match(/\/lws\/r\/([^/]+)$/);
    if (m) {
      const id = m[1]!;
      const member = Object.keys(links).find((k) => links[k]!.some((e) => e.endsWith(`/base/e/${id}`)));
      const entity = member ? links[member]!.find((e) => e.endsWith(`/base/e/${id}`))! : `${host("x")}/base/e/${id}`;
      return resp(200, { "@id": entity, "@type": "t:Person", name: `Rec ${id}`, ...(member ? { sameAs: { "@id": member } } : {}) });
    }
    return resp(404, {});
  });
  const finds = () => seen.filter((u) => u.includes("/base/find-by-attribute"));
  const reads = () => seen.filter((u) => u.includes("/lws/r/"));
  return { seen, finds, reads };
}

const depsFor = (vaults: string[]) =>
  stakeholderListDeps(doorsHost, { qc: new QueryClient(), holder: DAN, vaults, ownVaultId: vaults[0]!, typeNames: TYPES, ownCardIds: [] });

const askedMembers = (finds: string[]) => finds.map((u) => JSON.parse(new URL(u).searchParams.get("value")!)["@id"] as string);

describe("linkedRecordsOf: a kept record costs 0", () => {
  it("a refresh whose budget is already spent (0) returns every kept record, with 0 requests", async () => {
    const w = world({ [who("1")]: [`${host("kk")}/base/e/a`], [who("2")]: [`${host("kk")}/base/e/b`, `${host("kk")}/base/e/c`] });
    const deps = depsFor([OWN]);
    const first = await deps.linkedRecordsOf!([who("1"), who("2")], 40);
    expect(first).toHaveLength(3);
    const n = w.seen.length;
    // The screen has sent 40 or more since the refresh started (the new record's card): the reader passes 0.
    const again = await deps.linkedRecordsOf!([who("1"), who("2")], 0);
    expect(again).toEqual(first);
    expect(w.seen.length).toBe(n);
  });

  it("a member with a record that is gone (its read answered nothing): the kept record and the kept 'gone' both cost 0", async () => {
    const w = world({ [who("1")]: [`${host("kk")}/base/e/a`, `${host("kk")}/base/e/gone`] });
    const answer = fetchMock.getMockImplementation() as (input: string) => Promise<Response>;
    fetchMock.mockImplementation(async (input: string) => {
      if (String(input).includes("/lws/r/gone")) {
        w.seen.push(String(input));
        return resp(404, {});
      }
      return answer(input);
    });
    const deps = depsFor([OWN]);
    expect((await deps.linkedRecordsOf!([who("1")], 40)).map((f) => f.record.recordId)).toEqual([`${host("kk")}/base/e/a`]);
    const n = w.seen.length;
    expect((await deps.linkedRecordsOf!([who("1")], 0)).map((f) => f.record.recordId)).toEqual([`${host("kk")}/base/e/a`]);
    expect(w.seen.length).toBe(n);
  });

  it("the budget is spent only on new finds and new reads: kept answers do not take a new member's read", async () => {
    const w = world({ [who("1")]: [`${host("kk")}/base/e/a`], [who("2")]: [`${host("kk")}/base/e/b`] });
    const deps = depsFor([OWN]);
    await deps.linkedRecordsOf!([who("1")], 40);
    const before = { finds: w.finds().length, reads: w.reads().length };
    // One store: a new member costs 1 find + 1 read + its resolve = 3. Budget 3 buys exactly member 2, whatever member 1 holds.
    const found = await deps.linkedRecordsOf!([who("1"), who("2"), who("3")], 3);
    expect(found.map((f) => f.record.recordId).sort()).toEqual([`${host("kk")}/base/e/a`, `${host("kk")}/base/e/b`]);
    expect(askedMembers(w.finds().slice(before.finds))).toEqual([who("2")]);
    expect(w.reads().length - before.reads).toBe(1);
  });

  it("a new read still counts its resolve: budget 2 on one store asks no new member (find + read + resolve = 3)", async () => {
    const w = world({ [who("2")]: [`${host("kk")}/base/e/b`] });
    const deps = depsFor([OWN]);
    expect(await deps.linkedRecordsOf!([who("2")], 2)).toEqual([]);
    expect(w.seen).toHaveLength(0);
  });
});

describe("the seam: the shared reader with the doors, a refresh after a create", () => {
  const LINKED = `${host("kk")}/base/e/a`;
  const PLACED = who("1");

  /** One held vault (OWN) with 10 plain records and a next page, so the linked record is off the first page. */
  function readerWorld() {
    const w = world({ [PLACED]: [LINKED] });
    let sent = 0;
    let cardOpensOnRefresh = false;
    const calls = { resolve: 0, budgets: [] as (number | undefined)[] };
    const plain: ListedRecord[] = Array.from({ length: 10 }, (_, i) => ({
      recordId: `${host("kk")}/base/e/r${i}`,
      title: `Record ${i}`,
      type: "https://ontology.example.test/base/t/Person",
      link: { state: "none" as const },
      updatedAt: 1,
    }));
    const app = depsFor([OWN]);
    const reader = createStakeholderListReader({
      ...app,
      async connections(): Promise<ConnectionsReading> {
        return {
          holder: DAN,
          vaultId: OWN,
          sets: [],
          people: [{ principal: PLACED, placements: [{ context: "personal", depth: "first-degree" }] }],
        };
      },
      async listRecords(_vaultId: string, offset: number): Promise<RecordsPage> {
        // The new record's card opens in the same moment as the refresh and sends about 85 requests.
        if (cardOpensOnRefresh) sent += 85;
        return offset === 0 ? { records: plain, next: 10 } : { records: [], next: null };
      },
      async linkedRecordsOf(members, budget) {
        calls.budgets.push(budget);
        return app.linkedRecordsOf!(members, budget);
      },
      requestsSoFar: () => sent,
      async resolve(recordId: string) {
        calls.resolve++;
        sent++;
        return recordId === LINKED ? { kind: "person", principal: PLACED, entity: `${PLACED}/e/card` } : { kind: "none" };
      },
      async readName() {
        return { kind: "name", name: null };
      },
      canonical: undefined,
    });
    return { w, reader, calls, openCardOnRefresh: () => (cardOpensOnRefresh = true) };
  }

  const joined = (l: StakeholderList) => l.rows.filter((r) => r.principal === PLACED).map((r) => [r.kind, r.recordId]);

  it("the refresh, with the screen already past 40, still draws the kept join, with 0 finds, 0 reads and 0 resolves", async () => {
    const { w, reader, calls, openCardOnRefresh } = readerWorld();
    const first = await reader.read();
    expect(joined(first)).toEqual([["both", LINKED]]);
    const sent = { fetches: w.seen.length, resolves: calls.resolve };
    expect(w.finds()).toHaveLength(1);
    expect(w.reads()).toHaveLength(1);

    openCardOnRefresh();
    const after = await reader.refresh();
    // The reader gave the door nothing to spend (40 - 85 < 0): the condition the refresh was measured under.
    expect(calls.budgets.at(-1)).toBe(0);
    expect(joined(after)).toEqual([["both", LINKED]]);
    // The cost really is 0: the door asks nothing again, and the reader joins from its resolveCache.
    expect(w.seen.length).toBe(sent.fetches);
    expect(calls.resolve).toBe(sent.resolves);
  });
});
