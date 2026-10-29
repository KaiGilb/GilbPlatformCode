// @vitest-environment jsdom
// A linked record brought to the first screen only by the up-front door, then deleted: the next draw does not return it, and the kept
// answer forgets it. In this mock the delete ends the record (`deleted = true`); the door cannot see a delete the store has not made.
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
  forgetLinkedRecords(); // a new page
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a linked record deleted in the session is not brought back by the up-front door", () => {
  it("after the record is deleted, the next draw does not return it", async () => {
    const rec = row(OWN, "jairamrec", "Person", "Ann Bhat", ANN);
    let deleted = false;
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === "DELETE" && url.pathname.endsWith("/lws/r/jairamrec")) {
        deleted = true; // the store ends it: the find and the read no longer return it
        return resp(204);
      }
      if (url.pathname.endsWith("/base/find-by-attribute")) {
        const value = JSON.parse(url.searchParams.get("value") ?? "{}") as { "@id"?: string };
        const ids = !deleted && value["@id"] === ANN ? [rec.entity] : [];
        return resp(200, { count: ids.length, ids });
      }
      if (url.pathname.endsWith("/lws/r/jairamrec")) return deleted ? resp(404, {}) : resp(200, rec.body);
      return resp(404, {});
    });
    const qc = new QueryClient();
    const deps = stakeholderListDeps(doorsHost, { qc, holder: DAN, vaults: [OWN], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
    const first = await deps.linkedRecordsOf!([ANN]);
    expect(first.map((f) => f.record.recordId)).toEqual([rec.entity]);

    // "Delete record" in the pane: the app's delete door, as the pane calls it (its id and its own address).
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
    const del = renderHook(() => useDeleteRecord(OWN), { wrapper });
    await act(async () => {
      await del.result.current.mutateAsync({ id: "jairamrec", entityUri: rec.entity });
    });
    expect(deleted).toBe(true);

    const next = await deps.linkedRecordsOf!([ANN]);
    expect(next.map((f) => f.record.recordId)).toEqual([]);
  });
});
