// A resolve that answers 404 hid LIVE linked records: the platform answers the same 404 for an ended record, for a live one with no card
// behind its link, and for one off the holder's own vault. So a 404 takes a kept record as ended only if this session saw it joined to a
// person before. The door's own fetch is the one seam.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { QueryClient } from "@tanstack/react-query";
import { forgetLinkedRecords, stakeholderListDeps } from "./listDoors";
import { fakeDoorsHost, installPlatformHooks } from "../test/support";

const doorsHost = fakeDoorsHost();
installPlatformHooks();


const OWN = "https://dan.example.test/vault";
const DAN = "https://dan.example.test/vault/i";
const ANN = "https://ann.example.test/vault";
const TYPES = ["Person", "Organization"];

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

describe("a 404 means ended only for a record this session saw joined", () => {
  it("a kept linked record whose resolves answer 404 from its first draw stays in the list, on that draw and on a new reader's", async () => {
    const rec = row(OWN, "twin00b", "Twin 00b", ANN);
    records = [rec];
    noCard.add("twin00b"); // live; the resolver answers 404 for it from the start (cross-held-vault, platform item 3)
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    const reader2 = depsOf();
    expect((await reader2.resolve(rec.entity)).kind).toBe("none");
    // Never joined in this session: not taken as ended. The next reader still gets it, and asks nothing new for it.
    const before = sent.length;
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    expect(sent.slice(before)).toEqual([]);
  });

  it("kept: a record this session saw joined, that then answers 404, is still taken as ended", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    const reader1 = depsOf();
    expect(ids(await reader1.linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    expect((await reader1.resolve(rec.entity)).kind).toBe("person"); // joined in this session
    ended.add("jairamrec");
    const reader2 = depsOf();
    expect((await reader2.resolve(rec.entity)).kind).toBe("none");
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([]);
  });

  it("forgetLinkedRecords clears what the session saw joined: after it, a 404 alone ends nothing", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    const reader1 = depsOf();
    await reader1.linkedRecordsOf!([ANN], 40);
    expect((await reader1.resolve(rec.entity)).kind).toBe("person");
    forgetLinkedRecords();
    noCard.add("jairamrec");
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    expect((await depsOf().resolve(rec.entity)).kind).toBe("none");
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
  });
});
