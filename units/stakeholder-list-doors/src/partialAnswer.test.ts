// @vitest-environment jsdom
// A member cut short by the budget keeps what was read: its records already read come back at 0 cost, the rest is asked again when the
// budget allows. A record deleted in the session leaves such a partial answer too.
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
const DAN = "https://dan.example.test/vault/i";
const ANN = "https://ann.example.test/vault";
const TYPES = ["Person"];

function resp(status: number, body?: unknown): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body ?? "") } as unknown as Response;
}
function row(id: string) {
  const entity = `https://dan.example.test/base/e/${id}`;
  return { entity, body: { "@id": entity, "@type": "t:Person", name: id, sameAs: { "@id": ANN } } as Record<string, unknown> };
}
const A = row("reca");
const B = row("recb");

let sent: string[];
let finds: number;
beforeEach(() => {
  forgetLinkedRecords();
  sent = [];
  finds = 0;
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (init?.method === "DELETE") return resp(204);
    if (url.pathname.endsWith("/base/find-by-attribute")) {
      finds++;
      return resp(200, { count: 2, ids: [A.entity, B.entity] });
    }
    const r = [A, B].find((x) => url.pathname.endsWith(`/lws/r/${x.entity.slice(x.entity.lastIndexOf("/") + 1)}`));
    return r ? resp(200, r.body) : resp(404, {});
  });
});
afterEach(() => vi.unstubAllGlobals());

const deps = (qc = new QueryClient()) => stakeholderListDeps(doorsHost, { qc, holder: DAN, vaults: [OWN], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
const ids = (fs: readonly { record: { recordId: string } }[]) => fs.map((f) => f.record.recordId);

describe("a member cut short by the budget keeps what was read", () => {
  it("a member with 2 records, a budget that reads 1, then a refresh at budget 0: the 1 read comes back, with 0 requests", async () => {
    const d = deps();
    // 1 store: the find (1) + one record's read and resolve (2) = 3; the second record does not fit.
    expect(ids(await d.linkedRecordsOf!([ANN], 3))).toEqual([A.entity]);
    const before = sent.length;
    expect(ids(await d.linkedRecordsOf!([ANN], 0))).toEqual([A.entity]);
    expect(sent.slice(before)).toEqual([]);
  });

  it("when the budget allows, the rest is asked again and both come; then the member is kept whole", async () => {
    const d = deps();
    await d.linkedRecordsOf!([ANN], 3);
    expect(ids(await d.linkedRecordsOf!([ANN], 40)).sort()).toEqual([A.entity, B.entity].sort());
    expect(finds).toBe(2);
    const before = sent.length;
    expect(ids(await d.linkedRecordsOf!([ANN], 0)).sort()).toEqual([A.entity, B.entity].sort());
    expect(sent.slice(before)).toEqual([]);
  });

  it("a record deleted in the session leaves the partial answer too", async () => {
    const qc = new QueryClient();
    const d = deps(qc);
    await d.linkedRecordsOf!([ANN], 3);
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
    const del = renderHook(() => useDeleteRecord(OWN), { wrapper });
    await act(async () => {
      await del.result.current.mutateAsync({ id: "reca", entityUri: A.entity });
    });
    expect(await d.linkedRecordsOf!([ANN], 0)).toEqual([]);
  });
});
