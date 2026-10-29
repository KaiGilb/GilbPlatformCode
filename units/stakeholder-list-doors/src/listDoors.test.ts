// The doors for the one list of all stakeholders (`createStakeholderListReader` of `stakeholder-list-reader`): the reach cap and its split,
// the type address, the records page as the reader takes it, the names door, the held vaults, and the doors through the real reader.
// The transport is stubbed (`fetch`); the doors, the reader and the merge are REAL. Every record comes from a served records page, never
// from a hand-written row array.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


import { QueryClient } from "@tanstack/react-query";
import { STAKEHOLDER_LIST_REACH_CAP, createStakeholderListReader, pageLimitFor } from "@kaigilb/gilbplatformcode-stakeholder-list-reader";
import { isCredentialSurfaceError } from "@kaigilb/gilbplatformcode-credential-surface";
import { listVaultRecordsPage, type VaultRecordsPage } from "@kaigilb/gilbplatformcode-lws-vault-sets";
// The reach cap and its split live once, in `stakeholder-list-reader`.
import { heldVaultsOwnFirst, listedRecordsPage, masterTypeAddress, nameAnswerOf, stakeholderListDeps } from "./listDoors";
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
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stakeholder list doors", () => {
  describe("pageLimitFor", () => {
    // Until the platform pages by a cursor, one reach of the end brings at most 20 records across all held vaults.
    it("splits the 20 records of one reach across the held vaults, never more than 20 in total", () => {
      expect(STAKEHOLDER_LIST_REACH_CAP).toBe(20);
      expect(pageLimitFor(0, 1)).toBe(20);
      expect([0, 1, 2].map((i) => pageLimitFor(i, 3))).toEqual([7, 7, 6]);
      for (let n = 1; n <= 20; n++) {
        const sum = Array.from({ length: n }, (_, i) => pageLimitFor(i, n)).reduce((a, b) => a + b, 0);
        expect(sum).toBe(20);
      }
    });

    it("still asks one record of every vault past 20 held vaults (the cap's known edge)", () => {
      expect(pageLimitFor(24, 25)).toBe(1);
    });
  });

  describe("masterTypeAddress", () => {
    it("gives the master's full term address for every spelling a vault serves", () => {
      expect(masterTypeAddress("t:Person")).toBe(`${MASTER_T}Person`);
      expect(masterTypeAddress("https://dan.example.test/base/t/SoftwareSystem")).toBe(`${MASTER_T}SoftwareSystem`);
      expect(masterTypeAddress("Organization")).toBe(`${MASTER_T}Organization`);
      expect(masterTypeAddress("")).toBeNull();
    });
  });

  describe("the records door sets type", () => {
    // A door that forgets to set the type would compile, and every row would come out null with no warning: the door sets the type on
    // each listed record.
    it("every listed record carries its type, title, link and the next page", async () => {
      fetchMock.mockResolvedValueOnce(
        resp(200, {
          total: 3,
          complete: false,
          pageSize: 2,
          offset: 0,
          nextOffset: 2,
          records: [row(OWN, "p1", "Person", "Ann", "https://ann.example.test/vault/i"), row(OWN, "o1", "Organization", "Acme AS")],
        }),
      );
      const page = await listVaultRecordsPage(OWN, TYPES, 0, { includeBody: true, limit: 2 });
      const listed = listedRecordsPage(page);
      expect(listed.records.map((r) => r.type)).toEqual([`${MASTER_T}Person`, `${MASTER_T}Organization`]);
      expect(listed.records.every((r) => typeof r.type === "string" && r.type.length > 0)).toBe(true);
      expect(listed.records.map((r) => r.title)).toEqual(["Ann", "Acme AS"]);
      expect(listed.records[0]!.link).toEqual({ state: "linked", target: "https://ann.example.test/vault/i" });
      expect(listed.records[1]!.link).toEqual({ state: "none" });
      expect(listed.next).toBe(2);
      const url = new URL(String(fetchMock.mock.calls[0]![0]));
      expect(url.searchParams.get("include")).toBe("body");
      expect(url.searchParams.get("limit")).toBe("2");
      expect(url.searchParams.getAll("type")).toEqual(TYPES);
    });

    it("a complete page has no next page", () => {
      const page: VaultRecordsPage = { records: [], total: 0, complete: true, pageSize: 20, offset: 0, served: 0, nextOffset: null };
      expect(listedRecordsPage(page).next).toBeNull();
    });

    it("without a served nextOffset an incomplete page goes on by the rows the door SENT", () => {
      const page: VaultRecordsPage = { records: [], total: 50, complete: false, pageSize: 20, offset: 20, served: 20 };
      expect(listedRecordsPage(page).next).toBe(40);
    });
  });

  describe("nameAnswerOf (public-card at the viewer's rung)", () => {
    it("a card gives its name; no card is none; a busy or failed read is unavailable", () => {
      expect(
        nameAnswerOf({ kind: "card", card: { principal: "x", fields: [{ predicate: "a:givenName", value: "Ben", rung: "r" }, { predicate: "a:familyName", value: "Cora", rung: "r" }], skills: [] } as never }),
      ).toEqual({ kind: "name", name: "Ben Cora" });
      expect(nameAnswerOf({ kind: "none" })).toEqual({ kind: "none" });
      expect(nameAnswerOf({ kind: "busy", retryAfterMs: null })).toEqual({ kind: "unavailable" });
      expect(nameAnswerOf({ kind: "unavailable", status: 503 })).toEqual({ kind: "unavailable" });
    });

    it("a 401 is a sign-in failure the list can name, never an unreadable name", () => {
      let thrown: unknown = null;
      try {
        nameAnswerOf({ kind: "unavailable", status: 401 });
      } catch (e) {
        thrown = e;
      }
      expect(isCredentialSurfaceError(thrown)).toBe(true);
    });
  });

  describe("heldVaultsOwnFirst", () => {
    it("lists every held vault once, the holder's own first", () => {
      const v = (vaultId: string, isLandingVault = false) =>
        ({ vaultId, label: vaultId, modes: ["read", "write"], isLandingVault, entity: null, represents: null }) as unknown as ReachableVault;
      expect(heldVaultsOwnFirst([v(WORK), v(OWN, true), v(LAB), v(WORK)], OWN)).toEqual([OWN, WORK, LAB]);
    });
  });

  describe("stakeholderListDeps through the real reader", () => {
    function world(qc: QueryClient) {
      const seen: string[] = [];
      fetchMock.mockImplementation(async (input: string) => {
        const url = new URL(String(input));
        seen.push(url.toString());
        if (url.pathname.endsWith("/records")) {
          // A test host is not a platform host, so the app sends every vault read to its own origin and names the vault in the path.
          const vault = [OWN, WORK, LAB].find((x) => decodeURIComponent(url.pathname).includes(new URL(x).hostname))!;
          const limit = Number(url.searchParams.get("limit"));
          const offset = Number(url.searchParams.get("offset") ?? "0");
          const all = Array.from({ length: 30 }, (_, i) => row(vault, `${new URL(vault).hostname.split(".")[0]}-r${i}`, i % 2 ? "Organization" : "SoftwareSystem", `Rec ${i}`));
          const records = all.slice(offset, offset + limit);
          return resp(200, { total: all.length, complete: offset + records.length >= all.length, pageSize: limit, offset, nextOffset: offset + records.length < all.length ? offset + records.length : null, records });
        }
        if (url.pathname.includes("audience-rung/members")) return resp(200, { vaultId: OWN, holder: DAN, sets: [] });
        return resp(404, {});
      });
      return { seen, deps: stakeholderListDeps(doorsHost, { qc, holder: DAN, vaults: [OWN, WORK, LAB], ownVaultId: OWN, typeNames: TYPES, ownCardIds: [] }) };
    }

    it("one reach across three held vaults asks for at most 20 records in total", async () => {
      const qc = new QueryClient();
      const { seen, deps } = world(qc);
      const reader = createStakeholderListReader(deps);
      const first = await reader.read();
      const limitsOf = (urls: string[]) => urls.filter((u) => new URL(u).pathname.endsWith("/records")).map((u) => Number(new URL(u).searchParams.get("limit")));
      expect(limitsOf(seen).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(20);
      expect(first.rows.filter((r) => r.recordId).length).toBe(20);
      const before = seen.length;
      await reader.more();
      expect(limitsOf(seen.slice(before)).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(20);
    });

    it("every record row carries the master's type (through the reader and the merge)", async () => {
      const qc = new QueryClient();
      const { deps } = world(qc);
      const list = await createStakeholderListReader(deps).read();
      const records = list.rows.filter((r) => r.kind === "record");
      expect(records.length).toBeGreaterThan(0);
      for (const r of records) expect(r.recordType?.startsWith(MASTER_T)).toBe(true);
    });


    it("the body door reads no record and no find for links", async () => {
      const qc = new QueryClient();
      const { seen, deps } = world(qc);
      await createStakeholderListReader(deps).read();
      expect(seen.filter((u) => new URL(u).pathname.includes("/lws/r/"))).toEqual([]);
      expect(seen.filter((u) => u.includes("find-by-attribute"))).toEqual([]);
    });
  });
});
