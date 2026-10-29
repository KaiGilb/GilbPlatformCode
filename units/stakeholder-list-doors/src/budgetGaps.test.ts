// A member the budget cut short is kept as cut short (not whole) and asked again next time, and the list's request count starts at the
// screen's start (`requestsSoFar: () => requestsSent() - (a.screenStartedAt ?? 0)`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { QueryClient } from "@tanstack/react-query";
import { forgetLinkedRecords, stakeholderListDeps } from "./listDoors";
import { installRequestMeter, requestsSent } from "../test/support";
import { fakeDoorsHost, installPlatformHooks } from "../test/support";

const doorsHost = fakeDoorsHost();
installPlatformHooks();


const OWN = "https://dan.example.test/vault";
const DAN = "https://dan.example.test/vault/i";
const ANN = "https://ann.example.test/vault";
const TYPES = ["Person", "Organization", "SoftwareSystem", "AiAgent", "DataStore"];

function resp(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body ?? ""),
  } as unknown as Response;
}

function row(vault: string, id: string, type: string, label: string | null, link?: string) {
  const host = new URL(vault).origin;
  const entity = `${host}/base/e/${id}`;
  const body: Record<string, unknown> = { "@id": entity, "@type": `t:${type}`, ...(label ? { name: label } : {}) };
  if (link) body.sameAs = { "@id": link };
  return { entity, typeUri: `t:${type}`, updatedAt: "2026-10-19T10:00:00Z", label, vault, vaultAmbiguous: false, body };
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

describe("a member the budget cut short is asked again next time", () => {
  it("two records, a budget that reads only one: the next draw asks the member's find again", async () => {
    const a = row(OWN, "reca", "Person", "Ann A", ANN);
    const b = row(OWN, "recb", "Person", "Ann B", ANN);
    let finds = 0;
    fetchMock.mockImplementation(async (input: string) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/base/find-by-attribute")) {
        finds++;
        return resp(200, { count: 2, ids: [a.entity, b.entity] });
      }
      if (url.pathname.endsWith("/lws/r/reca")) return resp(200, a.body);
      if (url.pathname.endsWith("/lws/r/recb")) return resp(200, b.body);
      return resp(404, {});
    });
    const deps = stakeholderListDeps(doorsHost, { qc: new QueryClient(), holder: DAN, vaults: [OWN], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
    // 1 store: a member costs 1 find + (read + resolve) per record. Budget 3: the find, then one record; the second does not fit.
    const first = await deps.linkedRecordsOf!([ANN], 3);
    expect(first.map((f) => f.record.recordId)).toEqual([a.entity]);
    expect(finds).toBe(1);
    await deps.linkedRecordsOf!([ANN], 40);
    expect(finds).toBe(2);
  });
});

describe("the list's request count starts at the screen's start", () => {
  it("requestsSoFar is the requests sent since screenStartedAt, not since the page loaded", async () => {
    installRequestMeter();
    fetchMock.mockImplementation(async () => resp(200, {}));
    await fetch("/before-the-screen");
    const start = requestsSent();
    const deps = stakeholderListDeps(doorsHost, { qc: new QueryClient(), holder: DAN, vaults: [OWN], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [], screenStartedAt: start });
    await fetch("/screen-1");
    await fetch("/screen-2");
    expect(deps.requestsSoFar!()).toBe(2);
  });
});
