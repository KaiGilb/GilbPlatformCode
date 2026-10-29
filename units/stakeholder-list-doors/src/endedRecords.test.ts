// A kept linked record that ended in another tab or device: a new reader's resolve answers 404 for it, and the door forgets it (unless this
// reader's own pages listed it); the same reader's later draw asks its kept members again within the budget; a kept record the reader has
// not been given yet costs its resolve; a new find wins over a kept answer; a failed find keeps the kept answer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { QueryClient } from "@tanstack/react-query";
import { createStakeholderListReader } from "@kaigilb/gilbplatformcode-stakeholder-list-reader";
import { type ConnectionsReading } from "@kaigilb/gilbplatformcode-person-connections";
import { forgetLinkedRecords, stakeholderListDeps } from "./listDoors";
import { fakeDoorsHost, installPlatformHooks } from "../test/support";

const doorsHost = fakeDoorsHost();
installPlatformHooks();


const OWN = "https://dan.example.test/vault";
const DAN = "https://dan.example.test/vault/i";
const ANN = "https://ann.example.test/vault";
const TYPES = ["Person", "Organization"];
const who = (n: string) => `https://p${n}.example.test/vault`;

function resp(status: number, body?: unknown): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body ?? "") } as unknown as Response;
}
function row(vault: string, id: string, label: string, link?: string) {
  const entity = `${new URL(vault).origin}/base/e/${id}`;
  const body: Record<string, unknown> = { "@id": entity, "@type": "t:Person", name: label };
  if (link) body.sameAs = { "@id": link };
  return { entity, typeUri: "t:Person", updatedAt: "2026-10-19T10:00:00Z", label, vault, vaultAmbiguous: false, body };
}
const tail = (u: string) => u.slice(u.lastIndexOf("/") + 1);

let sent: string[];
/** The records the store has ended (another tab's delete: no act of this app). */
const ended = new Set<string>();
/** Live records whose resolve answers 404 all the same (no person card behind the link). */
const noCard = new Set<string>();
let records: ReturnType<typeof row>[] = [];
/** What the records door lists (its first page), when a test reads a page. */
let paged: ReturnType<typeof row>[] = [];
beforeEach(() => {
  forgetLinkedRecords(); // a new page
  sent = [];
  ended.clear();
  noCard.clear();
  records = [];
  paged = [];
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push(`${init?.method ?? "GET"} ${url.host}${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/records")) {
      const live = paged.filter((r) => !ended.has(tail(r.entity)));
      return resp(200, { total: live.length, complete: true, pageSize: 20, offset: 0, nextOffset: null, records: live });
    }
    if (url.pathname.endsWith("/base/find-by-attribute")) {
      const value = JSON.parse(url.searchParams.get("value") ?? "{}") as { "@id"?: string };
      const ids = records.filter((r) => !ended.has(tail(r.entity)) && (r.body.sameAs as { "@id": string } | undefined)?.["@id"] === value["@id"]).map((r) => r.entity);
      return resp(200, { count: ids.length, ids });
    }
    if (url.pathname.includes("online-card-anchor")) {
      const rec = url.searchParams.get("record") ?? "";
      const r = records.find((x) => x.entity === rec);
      if (!r || ended.has(tail(rec)) || noCard.has(tail(rec))) return resp(404, { error: "no_online_card" });
      const p = (r.body.sameAs as { "@id": string })["@id"];
      return resp(200, { kind: "person", principal: p, entity: `${p}/e/card`, vaultRepresents: "https://ontology.example.test/base/t/Person" });
    }
    const r = records.find((x) => url.pathname.endsWith(`/lws/r/${tail(x.entity)}`));
    // The platform reads an ended record with 200: only the find and the resolver tell.
    return r ? resp(200, r.body) : resp(404, {});
  });
});
afterEach(() => vi.unstubAllGlobals());

const depsOf = (vaults = [OWN]) => stakeholderListDeps(doorsHost, { qc: new QueryClient(), holder: DAN, vaults, ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
const ids = (fs: readonly { record: { recordId: string } }[]) => fs.map((f) => f.record.recordId);
const finds = () => sent.filter((s) => s.includes("/base/find-by-attribute"));
const reads = () => sent.filter((s) => s.includes("/lws/r/"));
const resolves = () => sent.filter((s) => s.includes("online-card-anchor"));

describe("a new reader's resolve answers 404 for a kept record that ended in another tab", () => {
  it("the door forgets it: the next draw, of any reader, does not return it, and asks nothing for it", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    const firstDeps = depsOf();
    expect(ids(await firstDeps.linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    // A 404 ends only a record this session saw joined; the first reader's own resolve
    // (which the reader sends for every record it is given) joined it here.
    expect((await firstDeps.resolve(rec.entity)).kind).toBe("person");
    ended.add("jairamrec");
    const reader2 = depsOf();
    expect(ids(await reader2.linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]); // kept: no find, no read
    expect(finds()).toHaveLength(1);
    expect((await reader2.resolve(rec.entity)).kind).toBe("none");
    expect(resolves()).toHaveLength(2); // the first reader's join resolve, then the one request the signal costs: the reader's own resolve
    const before = sent.length;
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([]);
    expect(sent.slice(before)).toEqual([]);
  });

  it("guard: a record this reader's own pages listed is not forgotten on a 404 alone", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    paged = [rec];
    noCard.add("jairamrec"); // live, but no person card behind the link: the same 404
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    const reader2 = depsOf();
    await reader2.listRecords(OWN, 0, 20);
    expect((await reader2.resolve(rec.entity)).kind).toBe("none");
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
  });

  it("a record forgotten on a 404 comes back when a later page lists it", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    const firstDeps = depsOf();
    expect(ids(await firstDeps.linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    // A 404 ends only a record this session saw joined; the first reader's own resolve
    // (which the reader sends for every record it is given) joined it here.
    expect((await firstDeps.resolve(rec.entity)).kind).toBe("person");
    noCard.add("jairamrec");
    const reader2 = depsOf();
    expect((await reader2.resolve(rec.entity)).kind).toBe("none");
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([]);
    paged = [rec];
    await depsOf().listRecords(OWN, 0, 20);
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
  });

  it("a resolve that could not be asked (5xx) forgets nothing", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) =>
      String(input).includes("online-card-anchor") ? resp(503, {}) : inner(input, init),
    );
    expect((await depsOf().resolve(rec.entity)).kind).toBe("unavailable");
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
  });
});

describe("the same reader's later draw (a create's refresh) asks its kept members again, within the budget", () => {
  it("with budget left: one find per kept member; the ended record is not returned and is not read", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    const reader = depsOf();
    expect(ids(await reader.linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    ended.add("jairamrec");
    const before = { finds: finds().length, reads: reads().length };
    expect(ids(await reader.linkedRecordsOf!([ANN], 40))).toEqual([]);
    expect(finds().length - before.finds).toBe(1);
    expect(reads().length - before.reads).toBe(0);
  });

  it("a live kept record is still returned after the find again, with no read again", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    const reader = depsOf();
    await reader.linkedRecordsOf!([ANN], 40);
    const before = reads().length;
    expect(ids(await reader.linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    expect(reads().length).toBe(before);
  });

  it("the residual: at budget 0 nothing is asked, and the kept record is returned (it leaves at the next new reader or reload)", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    const reader = depsOf();
    await reader.linkedRecordsOf!([ANN], 40);
    ended.add("jairamrec");
    const before = sent.length;
    expect(ids(await reader.linkedRecordsOf!([ANN], 0))).toEqual([rec.entity]);
    expect(sent.slice(before)).toEqual([]);
  });

  it("new members are asked before kept members are asked again", async () => {
    const a = row(OWN, "a", "A", who("1"));
    const b = row(OWN, "b", "B", who("2"));
    records = [a, b];
    const reader = depsOf();
    await reader.linkedRecordsOf!([who("1")], 40);
    const before = finds().length;
    // One store: a new member costs 3 (find, read, resolve). Budget 3 buys member 2 and nothing is left to ask member 1 again.
    expect(ids(await reader.linkedRecordsOf!([who("1"), who("2")], 3)).sort()).toEqual([a.entity, b.entity].sort());
    expect(finds().slice(before).map((s) => JSON.parse(new URL(`https://x${s.slice(s.indexOf("/"))}`).searchParams.get("value")!)["@id"])).toEqual([who("2")]);
  });

  it("a new reader's FIRST draw asks no kept member again (a kept answer costs no find on the first screen)", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    await depsOf().linkedRecordsOf!([ANN], 40);
    const before = finds().length;
    await depsOf().linkedRecordsOf!([ANN], 40);
    expect(finds().length).toBe(before);
  });
});

describe("a kept record the reader has not been given yet costs its resolve", () => {
  it("door: a new reader with 4 kept records and a budget of 3 is given 3 (the reader resolves each), with 0 finds and 0 reads", async () => {
    records = ["1", "2", "3", "4"].map((n) => row(OWN, `r${n}`, `R${n}`, who(n)));
    const members = ["1", "2", "3", "4"].map(who);
    expect(await depsOf().linkedRecordsOf!(members, 40)).toHaveLength(4);
    const before = sent.length;
    expect(await depsOf().linkedRecordsOf!(members, 3)).toHaveLength(3);
    expect(sent.slice(before)).toEqual([]);
  });

  it("door: a record already given to this reader costs 0 again (its resolve is in the reader's cache)", async () => {
    records = ["1", "2", "3", "4"].map((n) => row(OWN, `r${n}`, `R${n}`, who(n)));
    const members = ["1", "2", "3", "4"].map(who);
    const reader = depsOf();
    expect(await reader.linkedRecordsOf!(members, 40)).toHaveLength(4);
    expect(await reader.linkedRecordsOf!(members, 0)).toHaveLength(4);
  });

  it("door: the kept member not given for lack of budget stays whole (the next reader asks it no find)", async () => {
    records = ["1", "2", "3", "4"].map((n) => row(OWN, `r${n}`, `R${n}`, who(n)));
    const members = ["1", "2", "3", "4"].map(who);
    await depsOf().linkedRecordsOf!(members, 40);
    await depsOf().linkedRecordsOf!(members, 3);
    const before = finds().length;
    expect(await depsOf().linkedRecordsOf!(members, 40)).toHaveLength(4);
    expect(finds().length).toBe(before);
  });

  it("reader: a new reader with 4 kept records and a budget of 3 sends at most 3 requests in the up-front read and its resolves", async () => {
    records = ["1", "2", "3", "4"].map((n) => row(OWN, `r${n}`, `R${n}`, who(n)));
    const members = ["1", "2", "3", "4"].map(who);
    await depsOf().linkedRecordsOf!(members, 40); // an earlier reader of the session kept them
    const app = depsOf();
    const spent = 37; // the screen has 3 left
    const reader = createStakeholderListReader({
      ...app,
      async connections(): Promise<ConnectionsReading> {
        return { holder: DAN, vaultId: OWN, sets: [], people: members.map((principal) => ({ principal, placements: [{ context: "personal", depth: "first-degree" }] })) };
      },
      // One page of plain records and a next page: the linked records are off the first page.
      async listRecords(_v: string, offset: number) {
        return offset === 0
          ? { records: [{ recordId: `${new URL(OWN).origin}/base/e/plain`, title: "Plain", type: "https://ontology.example.test/base/t/Person", link: { state: "none" as const }, updatedAt: 1 }], next: 1 }
          : { records: [], next: null };
      },
      requestsSoFar: () => spent,
      async readName() {
        return { kind: "name", name: null };
      },
      canonical: undefined,
    });
    const before = sent.length;
    const list = await reader.read();
    const upFront = sent.slice(before).filter((s) => s.includes("find-by-attribute") || s.includes("/lws/r/") || s.includes("online-card-anchor"));
    expect(upFront.length).toBeLessThanOrEqual(3);
    expect(list.rows.filter((r) => r.kind === "both")).toHaveLength(3);
  });
});

describe("a new find wins over a kept answer", () => {
  it("a member cut short; in another tab its unread record ends and a new one is linked: the new find's records are returned", async () => {
    const a = row(OWN, "reca", "Ben A", ANN);
    const b = row(OWN, "recb", "Ben B", ANN);
    records = [a, b];
    const reader = depsOf();
    expect(ids(await reader.linkedRecordsOf!([ANN], 3))).toEqual([a.entity]); // B does not fit: the member is cut short
    ended.add("recb");
    const c = row(OWN, "recc", "Ben C", ANN);
    records = [a, b, c];
    const before = reads().length;
    expect(ids(await reader.linkedRecordsOf!([ANN], 40)).sort()).toEqual([a.entity, c.entity].sort());
    expect(reads().slice(before).some((s) => s.includes("/lws/r/recb"))).toBe(false);
  });
});

describe("a kept member asked again whose find fails", () => {
  it("keeps its kept answer: the draw still returns the kept record (⛔ never every join lost for a failed find again)", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    const reader = depsOf();
    await reader.linkedRecordsOf!([ANN], 40);
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) =>
      String(input).includes("find-by-attribute") ? resp(503, {}) : inner(input, init),
    );
    expect(ids(await reader.linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
  });
});
