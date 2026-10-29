// The up-front linked door within the first screen's 40 requests: each member's `find-by-attribute a:sameAs` is asked ONCE per STORE (not
// once per held-vault host: the platform's find scans the holder's whole reach in the store of the host asked), the door spends at most
// the budget the reader gives it, the answers are kept for the session, and the screen's request count starts at the screen's start.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { QueryClient } from "@tanstack/react-query";
import { forgetLinkedRecords, stakeholderListDeps } from "./listDoors";
import { installRequestMeter, requestsSent } from "../test/support";
import { fakeDoorsHost, installPlatformHooks } from "../test/support";

const doorsHost = fakeDoorsHost();
installPlatformHooks();


/** A user vault on its own platform host (`<name>.platform.example.test`). */
const host = (name: string) => `https://${name}.platform.example.test`;
const OWN = `${host("kk")}/vault`;
const O1 = `${host("kko1")}/vault`;
const O2 = `${host("kko2")}/vault`;
const KAIZEN = "https://kaizen.platform.example.test/vault";
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

/** Records linked to members: `links[member]` = the record ids (in held vault O1 unless named) linked to that member. */
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

describe("one find per member per STORE, not per held-vault host", () => {
  it("three held vaults on three user hosts: 4 members cost 4 finds (asked at every host: 12)", async () => {
    const w = world({ [who("1")]: [`${host("kko1")}/base/e/r1`] });
    const deps = depsFor([OWN, O1, O2]);
    const found = await deps.linkedRecordsOf!([who("1"), who("2"), who("3"), who("4")]);
    expect(w.finds()).toHaveLength(4);
    // Asked at the holder's own vault host (the first held vault), the find scanning the holder's whole reach there.
    for (const u of w.finds()) expect(new URL(u).host).toBe(new URL(OWN).host);
    expect(w.reads()).toHaveLength(1);
    // The record is listed in the held vault on its own host.
    expect(found.map((f) => [f.vaultId, f.record.recordId])).toEqual([[O1, `${host("kko1")}/base/e/r1`]]);
  });

  it("a held vault on a system host is another store (the identity node): one more find per member, asked there", async () => {
    const w = world({});
    const deps = depsFor([OWN, O1, KAIZEN]);
    await deps.linkedRecordsOf!([who("1"), who("2")]);
    expect(w.finds()).toHaveLength(4);
    expect(new Set(w.finds().map((u) => new URL(u).host))).toEqual(new Set([new URL(OWN).host, "kaizen.platform.example.test"]));
  });

  it("a record found in a vault that is not held is not listed (no stand-in vault)", async () => {
    world({ [who("1")]: [`${host("stranger")}/base/e/s1`] });
    const deps = depsFor([OWN, O1]);
    expect(await deps.linkedRecordsOf!([who("1")])).toEqual([]);
  });
});

describe("budget · the door spends at most what the reader gives it", () => {
  it("budget 9 on one store: 3 members asked (find + read + resolve each), in the reader's order", async () => {
    const w = world({ [who("1")]: [`${host("kk")}/base/e/a`], [who("2")]: [`${host("kk")}/base/e/b`] });
    const deps = depsFor([OWN, O1, O2]);
    const found = await deps.linkedRecordsOf!([who("1"), who("2"), who("3"), who("4"), who("5")], 9);
    const asked = w.finds().map((u) => JSON.parse(new URL(u).searchParams.get("value")!)["@id"]);
    expect(asked).toEqual([who("1"), who("2"), who("3")]);
    expect(w.reads()).toHaveLength(2);
    // finds + reads + one resolve per record returned <= budget
    expect(w.finds().length + w.reads().length + found.length).toBeLessThanOrEqual(9);
  });

  it("budget 0: no request at all", async () => {
    const w = world({ [who("1")]: [`${host("kk")}/base/e/a`] });
    const deps = depsFor([OWN, O1]);
    expect(await deps.linkedRecordsOf!([who("1"), who("2")], 0)).toEqual([]);
    expect(w.seen).toHaveLength(0);
  });

  it("finds that name more records than the budget can read: only what fits is read, the rest joins with its page", async () => {
    const w = world({ [who("1")]: [`${host("kk")}/base/e/a`, `${host("kk")}/base/e/b`, `${host("kk")}/base/e/c`] });
    const deps = depsFor([OWN]);
    const found = await deps.linkedRecordsOf!([who("1")], 5);
    expect(w.finds()).toHaveLength(1);
    expect(w.reads()).toHaveLength(2);
    expect(found).toHaveLength(2);
  });
});

describe("cache · never the same up-front read twice in a session for the same members", () => {
  it("a refresh with the same members asks nothing; a link write forgets; another member is asked alone", async () => {
    const w = world({ [who("1")]: [`${host("kk")}/base/e/a`] });
    const deps = depsFor([OWN, O1, O2]);
    const first = await deps.linkedRecordsOf!([who("1"), who("2")], 40);
    const n = w.seen.length;
    expect(n).toBe(3);
    // Plain refresh after a create: the same members, the same answer, no read again. The member
    // whose kept answer names a record is asked its find again (1 request, with budget left), so a record ended in another tab
    // is not drawn again; the member with no record is not asked again.
    expect(await deps.linkedRecordsOf!([who("1"), who("2")], 40)).toEqual(first);
    expect(w.seen.length).toBe(n + 1);
    expect(w.finds().slice(2).map((u) => JSON.parse(new URL(u).searchParams.get("value")!)["@id"])).toEqual([who("1")]);
    expect(w.reads()).toHaveLength(1);
    const n2 = w.seen.length;
    // The same holder's new reader (a holder switch back) is the same session: still 0 (its first draw asks nothing again).
    expect(await depsFor([OWN, O1, O2]).linkedRecordsOf!([who("1"), who("2")], 40)).toEqual(first);
    expect(w.seen.length).toBe(n2);
    // A member not asked before is asked first (then member 1 again, as above).
    await deps.linkedRecordsOf!([who("1"), who("2"), who("3")], 40);
    expect(w.finds().slice(3).map((u) => JSON.parse(new URL(u).searchParams.get("value")!)["@id"])).toEqual([who("3"), who("1")]);
    // A link write forgets every kept answer.
    forgetLinkedRecords();
    await deps.linkedRecordsOf!([who("1"), who("2")], 40);
    expect(w.finds()).toHaveLength(7);
  });

  // A kept record costs 0 whatever the budget. The reader
  // holds its resolve (`resolveCache`); a new reader pays it in its own `settleLinks`, under its own limiter. See listDoors.s1.test.ts.
  it("a kept record costs 0 against the budget (the reader already holds its resolve)", async () => {
    const w = world({ [who("1")]: [`${host("kk")}/base/e/a`] });
    const deps = depsFor([OWN]);
    await deps.linkedRecordsOf!([who("1")], 40);
    const n = w.seen.length;
    expect((await deps.linkedRecordsOf!([who("1")], 0)).length).toBe(1);
    expect(w.seen.length).toBe(n);
    // With 1 left, the same reader asks member 1's find again (1 request) and reads nothing again.
    expect((await deps.linkedRecordsOf!([who("1")], 1)).length).toBe(1);
    expect(w.seen.length).toBe(n + 1);
    expect(w.reads()).toHaveLength(1);
  });
});

describe("the screen's request count", () => {
  it("installRequestMeter counts every fetch sent, once installed, and the list's door reads it from the screen's start", async () => {
    world({});
    installRequestMeter();
    const before = requestsSent();
    await fetch(`${host("kk")}/base/x`);
    await fetch(`${host("kk")}/base/y`);
    expect(requestsSent() - before).toBe(2);
    const deps = stakeholderListDeps(doorsHost, {
      qc: new QueryClient(),
      holder: DAN,
      vaults: [OWN],
      ownVaultId: OWN,
      typeNames: TYPES,
      ownCardIds: [],
      screenStartedAt: before,
    });
    expect(deps.requestsSoFar!()).toBe(2);
  });
});
