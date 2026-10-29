// The records door pages by the limit the reader passes (`limit ?? limitOf(vaultId)`), and the linked records of the placed people are read
// up front (`linkedRecordsOf`: one find per member, one read per record found). The transport is stubbed (`fetch`); the doors are REAL.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { QueryClient } from "@tanstack/react-query";
import { forgetLinkedRecords, stakeholderListDeps } from "./listDoors";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { fakeDoorsHost, installPlatformHooks } from "../test/support";

const doorsHost = fakeDoorsHost();
installPlatformHooks();


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
  // The up-front answers are kept for the session; each test is a new session.
  forgetLinkedRecords();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ANN = "https://ann.example.test/vault";
const BEN = "https://ben.example.test/vault";

describe("the records door pages by the reader's share", () => {
  it("sends the limit the reader passes, and the static split only when none is passed", async () => {
    const seen: string[] = [];
    fetchMock.mockImplementation(async (input: string) => {
      seen.push(String(input));
      return resp(200, { total: 0, complete: true, pageSize: 20, offset: 0, nextOffset: null, records: [] });
    });
    const deps = stakeholderListDeps(doorsHost, { qc: new QueryClient(), holder: DAN, vaults: [OWN, WORK, LAB], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] });
    await deps.listRecords(OWN, 0, 13);
    await deps.listRecords(WORK, 0);
    expect(new URL(seen[0]!).searchParams.get("limit")).toBe("13");
    expect(new URL(seen[1]!).searchParams.get("limit")).toBe("7");
  });
});

describe("linkedRecordsOf: the placed people's linked records, up front", () => {
  function world() {
    const seen: string[] = [];
    const jairamRec = row(OWN, "jairam", "Person", "Ann Bhat", ANN);
    fetchMock.mockImplementation(async (input: string) => {
      const url = new URL(String(input));
      seen.push(url.toString());
      if (url.pathname.endsWith("/base/find-by-attribute")) {
        const value = JSON.parse(url.searchParams.get("value") ?? "{}") as { "@id"?: string };
        const ids = value["@id"] === ANN ? [jairamRec.entity] : [];
        return resp(200, { count: ids.length, ids });
      }
      if (url.pathname.endsWith("/lws/r/jairam")) return resp(200, jairamRec.body);
      return resp(404, {});
    });
    return { seen, deps: stakeholderListDeps(doorsHost, { qc: new QueryClient(), holder: DAN, vaults: [OWN, WORK], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] }) };
  }

  it("finds by each member's own address, reads each record found, and names its vault, title, type and link", async () => {
    const { seen, deps } = world();
    const found = await deps.linkedRecordsOf!([ANN, BEN]);
    expect(found).toEqual([
      {
        vaultId: OWN,
        record: {
          recordId: "https://dan.example.test/base/e/jairam",
          title: "Ann Bhat",
          type: `${MASTER_T}Person`,
          link: { state: "linked", target: ANN },
          updatedAt: null,
        },
      },
    ]);
    const finds = seen.filter((u) => u.includes("/base/find-by-attribute"));
    // Both held vaults are on one store here (a test host is not a platform host): one find per member.
    expect(finds).toHaveLength(2);
    for (const u of finds) expect(new URL(u).searchParams.get("attr")).toBe("a:sameAs");
    expect(finds.map((u) => JSON.parse(new URL(u).searchParams.get("value")!)["@id"]).sort()).toEqual([ANN, BEN]);
    expect(seen.filter((u) => u.includes("/lws/r/"))).toHaveLength(1);
    // Read only.
    expect(fetchMock.mock.calls.every((c) => String((c[1] as RequestInit | undefined)?.method ?? "GET").toUpperCase() === "GET")).toBe(true);
  });

  it("a failed find is a failed door (the reader then keeps page order), never 'nobody is linked'", async () => {
    const { deps } = world();
    fetchMock.mockImplementation(async () => resp(503, {}));
    await expect(deps.linkedRecordsOf!([ANN])).rejects.toThrow();
  });
});

