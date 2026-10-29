// A relation write carries role:source, role:target, and the type.
// It carries no name, label, or other fact of the selected record.
//
// Collaborators are mocked; `writePairRelation` is real (same harness as relationWrite.wMint.test.ts).
// The captured body is the PUT `putKnownRelation` sends.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vaults = vi.hoisted(() => ({ listVaultRecordsPage: vi.fn() }));

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@kaigilb/gilbplatformcode-lws-records");
  return { ...actual, readRecord: vi.fn() };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listVaultRecordsPage: vaults.listVaultRecordsPage,
}));
const rels = vi.hoisted(() => ({ readRelations: vi.fn(async () => []) }));
vi.mock("./relations", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("./relations");
  return { ...actual, readRelations: rels.readRelations };
});

import * as records from "@kaigilb/gilbplatformcode-lws-records";
import { writePairRelation } from "./relationWrite";
import { __setCatalogForTest, catalogFromGraph } from "./linkPlaneCatalog";
import { setUp, tearDown, type FakeHost } from "../test/support";

const B = "https://b.platform.example.test/base";
const ANN_ID = "ann-06gtest";
const ANN = `https://a.platform.example.test/base/e/${ANN_ID}`;
/** No "name", "label", or "Ann" in this principal — the serialised body is checked for those. */
const PRINCIPAL = "https://a.platform.example.test/base/p/ann";

let puts: { url: string; raw: string; body: Record<string, unknown> }[] = [];

let host: FakeHost;

beforeEach(() => {
  host = setUp();
  puts = [];
  __setCatalogForTest(
    catalogFromGraph(
      [
        {
          "@id": "https://ontology.example.test/base/t/ConnectedTo",
          "a:label": "connected-to",
          "a:linkPlane": "user",
          "a:typeAttribute": "t:ConnectedTo",
          "a:symmetric": true,
        },
      ],
      "user",
    ),
  );
  vi.mocked(records.readRecord).mockReset();
  vaults.listVaultRecordsPage.mockReset();
  vaults.listVaultRecordsPage.mockResolvedValue({
    records: [],
    total: 0,
    complete: true,
    pageSize: 50,
    offset: 0,
  });
  rels.readRelations.mockReset();
  rels.readRelations.mockResolvedValue([]);
  host.tokenManager.getSession.mockReset();
  host.tokenManager.getSession.mockResolvedValue({
    principal: PRINCIPAL,
    vault: { vaultId: B },
    vaults: [{ vaultId: B, modes: ["read", "write"] as string[] }],
  } as never);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const raw = String(init.body ?? "");
        puts.push({ url: String(url), raw, body: JSON.parse(raw) as Record<string, unknown> });
        return {
          ok: true,
          status: 201,
          json: async () => ({ changed: true }),
          text: async (): Promise<string> => "",
          headers: { get: () => null },
        };
      }
      throw new Error(`unexpected fetch ${url} ${init?.method}`);
    }),
  );
});

afterEach(() => {
  __setCatalogForTest(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

describe("GAPP214.48 A7 — the relation write carries the two roles and the type, and no fact of Ann", () => {
  it("the minted PUT's facts are role:source and role:target; the type is the body's type field", async () => {
    await writePairRelation({
      sourceId: ANN_ID,
      sourceEntityUri: ANN,
      targetId: "new1",
      targetEntityUri: "https://b.platform.example.test/base/e/new1",
      typeCurie: "t:ConnectedTo",
      vaultNamespace: B,
    });

    expect(puts).toHaveLength(1);
    const body = puts[0]!.body;
    const facts = body.facts as Record<string, { "@id"?: string }>;
    // The type does not travel inside facts. It is the sibling `type` field on the PUT body.
    expect(body.type).toBe("t:ConnectedTo");
    expect(Object.keys(facts).sort()).toEqual(["role:source", "role:target"]);
    expect(facts["role:source"]!["@id"]).toBe(ANN);
    expect(puts[0]!.raw).not.toContain("Ann");
    expect(puts[0]!.raw).not.toContain("label");
    expect(puts[0]!.raw).not.toContain("name");
  });
});
