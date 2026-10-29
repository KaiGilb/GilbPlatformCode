// The up-front door adds only records of the list's own kinds: a Note that carries a:sameAs = a placed person is not a stakeholder, and
// never becomes a person's row (the records door asks `type=` the kinds; the up-front door must not add others).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { QueryClient } from "@tanstack/react-query";
import { stakeholderListDeps } from "./listDoors";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";

const MASTER_T = "https://ontology.example.test/base/t/";
const OWN = "https://dan.example.test/vault";
const WORK = "https://acme.example.test/vault";
const LAB = "https://lab.example.test/vault";
const DAN = "https://dan.example.test/vault/i";
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

/** One served row of `GET /lws/vault/<v>/records?include=body`, as GilbPlatform's `RecordRefEntry` carries it. */
function row(vault: string, id: string, type: string, label: string | null, link?: string) {
  const host = new URL(vault).origin;
  const entity = `${host}/base/e/${id}`;
  const body: Record<string, unknown> = { "@id": entity, "@type": `t:${type}`, ...(label ? { name: label } : {}) };
  if (link) body.sameAs = { "@id": link };
  return { entity, typeUri: `t:${type}`, updatedAt: "2026-10-19T10:00:00Z", label, vault, vaultAmbiguous: false, body };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

import { fakeDoorsHost, installPlatformHooks } from "../test/support";

const doorsHost = fakeDoorsHost();
installPlatformHooks();


const BEN = "https://ben.example.test/vault";
const AVA = "https://ava.example.test/vault";

describe("the up-front door adds only records of the list's kinds", () => {
  it("a Note that carries a:sameAs = a placed person is not a stakeholder record", async () => {
    const note = row(OWN, "note1", "NoteDocument", "Note about Ben", BEN);
    fetchMock.mockImplementation(async (input: string) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/base/find-by-attribute")) {
        const value = JSON.parse(url.searchParams.get("value") ?? "{}") as { "@id"?: string };
        const ids = value["@id"] === BEN ? [note.entity] : [];
        return resp(200, { count: ids.length, ids });
      }
      if (url.pathname.endsWith("/lws/r/note1")) return resp(200, note.body);
      return resp(404, {});
    });
    const deps = stakeholderListDeps(doorsHost, { qc: new QueryClient(), holder: DAN, vaults: [OWN], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
    const found = await deps.linkedRecordsOf!([BEN]);
    expect(found.map((f) => f.record.type)).toEqual([]);
  });
});

export type { ReachableVault };
