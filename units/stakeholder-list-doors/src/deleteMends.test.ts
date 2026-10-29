// @vitest-environment jsdom
// A record deleted in the session never comes back from the up-front door: a delete mends the kept answers (a kept record, a read that
// was out when the delete landed, a find that was out, a delete named by its id only), and a delete the store refuses changes nothing.
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
const BEN = "https://ben.example.test/vault";
const TYPES = ["Person", "Organization"];

function resp(status: number, body?: unknown): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body ?? "") } as unknown as Response;
}

function row(id: string, label: string, link: string) {
  const entity = `https://dan.example.test/base/e/${id}`;
  return { entity, body: { "@id": entity, "@type": "t:Person", name: label, sameAs: { "@id": link } } as Record<string, unknown> };
}

const J1 = row("jairam1", "Ann One", ANN);
const J2 = row("jairam2", "Ann Two", ANN);
const T1 = row("tom1", "Ben Cora", BEN);
const ALL = [J1, J2, T1];

let fetchMock: ReturnType<typeof vi.fn>;
let ended: Set<string>;
let sent: string[];
beforeEach(() => {
  forgetLinkedRecords();
  ended = new Set();
  sent = [];
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    const tail = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
    sent.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (init?.method === "DELETE") {
      ended.add(tail);
      return resp(204);
    }
    const live = ALL.filter((r) => !ended.has(r.entity.slice(r.entity.lastIndexOf("/") + 1)));
    if (url.pathname.endsWith("/base/find-by-attribute")) {
      const value = JSON.parse(url.searchParams.get("value") ?? "{}") as { "@id"?: string };
      const ids = live.filter((r) => (r.body.sameAs as { "@id": string })["@id"] === value["@id"]).map((r) => r.entity);
      return resp(200, { count: ids.length, ids });
    }
    const r = live.find((x) => x.entity.endsWith(`/e/${tail}`));
    return r ? resp(200, r.body) : resp(404, {});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function deleteThroughTheApp(qc: QueryClient, id: string, entityUri: string | null) {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  const del = renderHook(() => useDeleteRecord(OWN), { wrapper });
  await act(async () => {
    await del.result.current.mutateAsync({ id, entityUri });
  });
}

describe("a delete mends the kept up-front answers", () => {
  it("the next draw returns the member's other record and the other member's, and sends no request", async () => {
    const qc = new QueryClient();
    const deps = stakeholderListDeps(doorsHost, { qc, holder: DAN, vaults: [OWN], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
    const first = await deps.linkedRecordsOf!([ANN, BEN]);
    expect(first.map((f) => f.record.recordId).sort()).toEqual([J1.entity, J2.entity, T1.entity].sort());

    await deleteThroughTheApp(qc, "jairam1", J1.entity);
    const before = sent.length;
    const next = await deps.linkedRecordsOf!([ANN, BEN], 0);
    // Budget 0 (the screen past 40): the kept answers still come, the deleted one does not, and nothing is sent.
    expect(next.map((f) => f.record.recordId).sort()).toEqual([J2.entity, T1.entity].sort());
    expect(sent.slice(before)).toEqual([]);
  });

  it("a read that was out when the delete landed is not returned, and is kept as gone", async () => {
    const qc = new QueryClient();
    const deps = stakeholderListDeps(doorsHost, { qc, holder: DAN, vaults: [OWN], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
    // The read of tom1 is held until the delete has landed, then answers with the record as it was read (a stale answer).
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let readAsked!: () => void;
    const asked = new Promise<void>((r) => (readAsked = r));
    const inner = fetchMock.getMockImplementation() as (input: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET" && new URL(String(input)).pathname.endsWith("/lws/r/tom1")) {
        readAsked();
        await held;
        return resp(200, T1.body);
      }
      return inner(input, init);
    });
    const draw = deps.linkedRecordsOf!([BEN]);
    await asked;
    await deleteThroughTheApp(qc, "tom1", T1.entity);
    release();
    expect(await draw).toEqual([]);
    const before = sent.length;
    expect(await deps.linkedRecordsOf!([BEN], 0)).toEqual([]);
    expect(sent.slice(before)).toEqual([]);
  });

  it("a find that was out when the delete landed: the record it names is not read, nor returned", async () => {
    const qc = new QueryClient();
    const deps = stakeholderListDeps(doorsHost, { qc, holder: DAN, vaults: [OWN], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let findAsked!: () => void;
    const asked = new Promise<void>((r) => (findAsked = r));
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input));
      sent.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (init?.method === "DELETE") return resp(204);
      if (url.pathname.endsWith("/base/find-by-attribute")) {
        findAsked();
        await held;
        return resp(200, { count: 1, ids: [T1.entity] }); // as the store answered before the delete
      }
      return resp(200, T1.body);
    });
    const draw = deps.linkedRecordsOf!([BEN]);
    await asked;
    await deleteThroughTheApp(qc, "tom1", T1.entity);
    const before = sent.length;
    release();
    expect(await draw).toEqual([]);
    expect(sent.slice(before)).toEqual([]);
  });

  it("a delete that names only the id (no address) is matched by the id", async () => {
    const qc = new QueryClient();
    const deps = stakeholderListDeps(doorsHost, { qc, holder: DAN, vaults: [OWN], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
    await deps.linkedRecordsOf!([BEN]);
    await deleteThroughTheApp(qc, "tom1", null);
    expect(await deps.linkedRecordsOf!([BEN], 0)).toEqual([]);
  });

  it("a delete the store refuses changes nothing kept", async () => {
    const qc = new QueryClient();
    const deps = stakeholderListDeps(doorsHost, { qc, holder: DAN, vaults: [OWN], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
    await deps.linkedRecordsOf!([BEN]);
    fetchMock.mockImplementationOnce(async () => resp(403, { error: "no" }));
    await deleteThroughTheApp(qc, "tom1", T1.entity).catch(() => undefined);
    expect((await deps.linkedRecordsOf!([BEN], 0)).map((f) => f.record.recordId)).toEqual([T1.entity]);
  });
});
