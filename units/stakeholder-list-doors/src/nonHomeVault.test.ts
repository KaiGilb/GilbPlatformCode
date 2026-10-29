// A live linked record in a non-home held vault is not taken as ended because the resolver refuses a record off the holder's own vault:
// the platform answers the same 404 there, so a 404 ends a kept record only when it is on the holder's own vault.
// The platform's resolver refuses EVERY record that is not on the caller's own vault host ("record-not-on-callers-vault" -> the one 404
// `no_online_card`). A kept linked record whose resolve answers 404 is taken as ENDED unless this reader's pages listed it. So a LIVE
// linked record in a non-home held vault (a company vault) would be hidden from the Stakeholders list until its own page is loaded; the
// list draws it on the first screen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryClient } from "@tanstack/react-query";
import { forgetLinkedRecords, stakeholderListDeps } from "./listDoors";
import { fakeDoorsHost, installPlatformHooks } from "../test/support";

const doorsHost = fakeDoorsHost();
installPlatformHooks();


const OWN = "https://dan.example.test/vault";
const ACME = "https://acme.example.test/vault";
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

describe("a live linked record in a non-home held vault", () => {
  it("is not taken as ended because the resolver refuses a record off the seat vault", async () => {
    const rec = row(ACME, "acmerec", "Eli at Acme", ANN);
    records = [rec];
    noCard.add("acmerec"); // the platform's answer for a record not on the caller's seat vault host
    const vaults = [OWN, ACME];
    expect(ids(await depsOf(vaults).linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    const r2 = depsOf(vaults);
    await r2.linkedRecordsOf!([ANN], 40);
    expect((await r2.resolve(rec.entity)).kind).toBe("none");
    expect(ids(await depsOf(vaults).linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]); // must not be []
  });

  it("even a record this session saw joined is kept on a 404 when it is not on the holder's own vault", async () => {
    const rec = row(ACME, "acmejoined", "Eli at Acme", ANN);
    records = [rec];
    const vaults = [OWN, ACME];
    const r1 = depsOf(vaults);
    expect(ids(await r1.linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
    expect((await r1.resolve(rec.entity)).kind).toBe("person"); // joined in this session
    noCard.add("acmejoined"); // now the platform's off-the-seat-vault 404
    const r2 = depsOf(vaults);
    await r2.linkedRecordsOf!([ANN], 40);
    expect((await r2.resolve(rec.entity)).kind).toBe("none");
    expect(ids(await depsOf(vaults).linkedRecordsOf!([ANN], 40))).toEqual([rec.entity]);
  });

  it("control: a joined record on the holder's own vault that answers 404 is still taken as ended (R8)", async () => {
    const rec = row(OWN, "ownjoined", "Ann", ANN);
    records = [rec];
    const r1 = depsOf();
    await r1.linkedRecordsOf!([ANN], 40);
    expect((await r1.resolve(rec.entity)).kind).toBe("person");
    ended.add("ownjoined");
    const r2 = depsOf();
    expect((await r2.resolve(rec.entity)).kind).toBe("none");
    expect(ids(await depsOf().linkedRecordsOf!([ANN], 40))).toEqual([]);
  });
});
