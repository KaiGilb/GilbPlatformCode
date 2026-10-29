// @vitest-environment jsdom
// A kept linked record deleted outside this tab stays a row until a reload unless the store ends it for the door: the next draw does not
// return it; a member cut short whose unread record is deleted reads only what is left; the delete door's id matches a kept record whose
// address is on another held vault's host.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { forgetLinkedRecords, stakeholderListDeps } from "./listDoors";
import { useDeleteRecord } from "@kaigilb/gilbplatformcode-plan-record-hooks";
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
  return { entity, body };
}
const tail = (u: string) => u.slice(u.lastIndexOf("/") + 1);

let sent: string[];
const ended = new Set<string>();
let records: { entity: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  forgetLinkedRecords(); // a new page
  sent = [];
  ended.clear();
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push(`${init?.method ?? "GET"} ${url.host}${url.pathname}`);
    if (init?.method === "DELETE") {
      ended.add(tail(url.pathname));
      return resp(204);
    }
    if (url.pathname.endsWith("/base/find-by-attribute")) {
      const value = JSON.parse(url.searchParams.get("value") ?? "{}") as { "@id"?: string };
      const ids = records.filter((r) => !ended.has(tail(r.entity)) && (r.body.sameAs as { "@id": string } | undefined)?.["@id"] === value["@id"]).map((r) => r.entity);
      return resp(200, { count: ids.length, ids });
    }
    // The resolver, as `endedRecords.test.ts` answers it (a live linked record resolves to its person; an ended one 404s),
    // so a record can be seen joined before it ends.
    if (url.pathname.includes("online-card-anchor")) {
      const rec = url.searchParams.get("record") ?? "";
      const lr = records.find((x) => x.entity === rec);
      if (!lr || ended.has(tail(rec))) return resp(404, { error: "no_online_card" });
      const p = (lr.body.sameAs as { "@id": string })["@id"];
      return resp(200, { kind: "person", principal: p, entity: `${p}/e/card`, vaultRepresents: "https://ontology.example.test/base/t/Person" });
    }
    const r = records.find((x) => url.pathname.endsWith(`/lws/r/${tail(x.entity)}`));
    return r && !ended.has(tail(r.entity)) ? resp(200, r.body) : resp(404, {});
  });
});
afterEach(() => vi.unstubAllGlobals());

const depsOf = (qc: QueryClient, vaults = [OWN]) => stakeholderListDeps(doorsHost, { qc, holder: DAN, vaults, ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
const ids = (fs: readonly { record: { recordId: string } }[]) => fs.map((f) => f.record.recordId);
const wrapperOf = (qc: QueryClient) => ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);

describe("a kept linked record deleted outside this tab", () => {
  it("the next draw (a new reader after Records and back, or a create's refresh) does not return it", async () => {
    const rec = row(OWN, "jairamrec", "Ann Bhat", ANN);
    records = [rec];
    const firstDeps = depsOf(new QueryClient());
    const first = await firstDeps.linkedRecordsOf!([ANN], 40);
    expect(ids(first)).toEqual([rec.entity]); // the known answer: found and read
    // A 404 ends only a record this session saw joined; the first reader's own resolve
    // (which the reader sends for every record it is given) joined it here.
    expect((await firstDeps.resolve(rec.entity)).kind).toBe("person");
    ended.add("jairamrec"); // another tab of the same person deletes it: the store ends it, this app made no act
    // The act: a new reader (Records and back) is given the kept record and resolves it; the platform answers 404.
    const reader = depsOf(new QueryClient());
    await reader.linkedRecordsOf!([ANN], 40);
    expect((await reader.resolve(rec.entity)).kind).toBe("none");
    const next = await depsOf(new QueryClient()).linkedRecordsOf!([ANN], 40);
    expect(ids(next)).toEqual([]);
    // The same reader's next draw (a create's refresh) does not return it either.
    expect(ids(await reader.linkedRecordsOf!([ANN], 40))).toEqual([]);
  });
});

describe("a delete with a cut-short member: a member cut short whose unread record is deleted", () => {
  it("reads only what is left, never the deleted record, then the member is whole at 0 cost", async () => {
    const a = row(OWN, "reca", "Ben A", ANN);
    const b = row(OWN, "recb", "Ben B", ANN);
    records = [a, b];
    const qc = new QueryClient();
    const d = depsOf(qc);
    expect(ids(await d.linkedRecordsOf!([ANN], 3))).toEqual([a.entity]); // 1 find + 1 read and resolve; B does not fit
    const del = renderHook(() => useDeleteRecord(OWN), { wrapper: wrapperOf(qc) });
    await act(async () => {
      await del.result.current.mutateAsync({ id: "recb", entityUri: b.entity });
    });
    const before = sent.length;
    expect(ids(await d.linkedRecordsOf!([ANN], 40))).toEqual([a.entity]);
    expect(sent.slice(before).filter((s) => s.includes("/lws/r/recb"))).toEqual([]);
    const whole = sent.length;
    expect(ids(await d.linkedRecordsOf!([ANN], 0))).toEqual([a.entity]);
    expect(sent.slice(whole)).toEqual([]);
  });
});

describe("a kept record in a non-home held vault", () => {
  it("the delete door's id leaves the kept answer whose address is on the other vault's host", async () => {
    const w = row(ACME, "wenche", "Wenche Work", ANN);
    const k = row(OWN, "kaione", "Dan One", ANN);
    records = [w, k];
    const qc = new QueryClient();
    const d = depsOf(qc, [OWN, ACME]);
    expect(ids(await d.linkedRecordsOf!([ANN], 40)).sort()).toEqual([k.entity, w.entity].sort());
    const del = renderHook(() => useDeleteRecord(ACME), { wrapper: wrapperOf(qc) });
    await act(async () => {
      await del.result.current.mutateAsync({ id: "wenche", entityUri: w.entity });
    });
    // the address the DELETE goes to is a live run's to prove; here only that one was sent
    expect(sent.filter((s) => s.startsWith("DELETE") && s.endsWith("/lws/r/wenche")).length).toBe(1);
    const before = sent.length;
    expect(ids(await d.linkedRecordsOf!([ANN], 0))).toEqual([k.entity]);
    expect(sent.slice(before)).toEqual([]);
  });
});
