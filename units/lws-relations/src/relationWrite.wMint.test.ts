/**
 * Relation CREATE is PUT `/base/r/:id` (recorded Base door).
 *
 * N1 filled W-MINT POST `/c` (entity). HT3a measured that as the no-line cause:
 * `lwsCreate` → `baseEntityUri` → `/base/e/<id>`. Graph edges are `/base/r/<id>`
 * from PUT AfterWrite `syncRelationMembers`. ⛔ Do not invent a Lookup row.
 *
 * Spec: PUT `/base/r/:id` (this file's UPDATE arm, the recorded CREATE door)
 * · [[Lookup_Code_base-value-io-find]] graph pair = `readRelations`
 * · [[Rule_Code_base-value-io#RuleBasevioPair]]
 * · HT1: WRITE type is `t:<Type>`. FIND `?type=` stays bare.
 *
 * `readRelations` mocked as collaborator; `writePairRelation` is REAL
 * ([[Rule_Code_base-testing#RuleBasetestMockedModuleNoInstrument]]).
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";

const vaults = vi.hoisted(() => ({ listVaultRecordsPage: vi.fn() }));

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@kaigilb/gilbplatformcode-lws-records");
  return {
    ...actual,
    readRecord: vi.fn(),
  };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listVaultRecordsPage: vaults.listVaultRecordsPage,
}));
const rels = vi.hoisted(() => ({ readRelations: vi.fn(async () => []) }));
vi.mock("./relations", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("./relations");
  return {
    ...actual,
    readRelations: rels.readRelations,
  };
});

import * as records from "@kaigilb/gilbplatformcode-lws-records";
import { writePairRelation } from "./relationWrite";
import { GENERIC_PREDICATE_CURIE } from "./relationPredicates";
import { __setCatalogForTest, catalogFromGraph } from "./linkPlaneCatalog";
import { setUp, tearDown, type FakeHost } from "../test/support";

const VAULT = "https://ben.platform.example.test/base";
const HOME_VAULT = "https://home.platform.example.test/base";
const A = "https://ben.platform.example.test/base/e/rec-a";
const B = "https://ben.platform.example.test/base/e/rec-b";
const SERVER_ID = "servermintedrel000000000001";
const LOCATION = `https://ben.platform.example.test/lws/r/${SERVER_ID}`;
const PRINCIPAL = "https://ben.platform.example.test/base/p/ann";

function seedLiveUserPlane(): void {
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
        {
          "@id": "https://ontology.example.test/base/t/Reference",
          "a:label": "references",
          "a:linkPlane": "user",
          "a:typeAttribute": "t:Reference",
          "a:symmetric": false,
        },
        {
          "@id": "https://ontology.example.test/base/t/CapableOf",
          "a:label": "capable-of",
          "a:linkPlane": "user",
          "a:typeAttribute": "t:CapableOf",
          "a:symmetric": false,
        },
      ],
      "user",
    ),
  );
}

function opened(): BaseRecord {
  return {
    id: SERVER_ID,
    entityUri: `https://ben.platform.example.test/base/e/${SERVER_ID}`,
    typeUri: "https://ontology.example.test/base/t/ConnectedTo",
    facts: {},
    opaqueFacts: [],
    etag: '"etag-mint"',
  };
}

function fileSrc(): string {
  return readFileSync("src/relationWrite.ts", "utf8");
}

let posts: { url: string; body: Record<string, unknown> }[] = [];
let puts: { url: string; body: Record<string, unknown> }[] = [];
let host: FakeHost;

beforeEach(() => {
  host = setUp();
  posts = [];
  puts = [];
  seedLiveUserPlane();
  vi.mocked(records.readRecord).mockReset();
  vaults.listVaultRecordsPage.mockReset();
  rels.readRelations.mockReset();
  rels.readRelations.mockResolvedValue([]);
  host.tokenManager.getSession.mockReset();
  host.tokenManager.getSession.mockResolvedValue({
    principal: PRINCIPAL,
    vault: { vaultId: HOME_VAULT },
    vaults: [{ vaultId: VAULT, modes: ["read", "write"] as string[] }],
  } as never);
  vi.mocked(records.readRecord).mockResolvedValue(opened());
  vaults.listVaultRecordsPage.mockResolvedValue({
    records: [],
    total: 0,
    complete: true,
    pageSize: 50,
    offset: 0,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push({ url: String(url), body: JSON.parse(String(init.body ?? "{}")) });
        return {
          ok: true,
          status: 201,
          headers: {
            get: (name: string) => {
              if (name.toLowerCase() === "location") return LOCATION;
              if (name.toLowerCase() === "etag") return '"etag-mint"';
              return null;
            },
          },
          json: async () => ({ "@id": LOCATION }),
          text: async (): Promise<string> => "",
        };
      }
      if (init?.method === "PUT") {
        puts.push({ url: String(url), body: JSON.parse(String(init.body ?? "{}")) });
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __setCatalogForTest(null);
  tearDown();
});

describe("N1 retired — W-MINT POST /c was the no-line cause (HT3a). Kept as negatives.", () => {
  it("N1 retired: CREATE must not POST /lws/vault/.../c (that minted /base/e/, not an edge)", async () => {
    await writePairRelation({
      sourceId: "rec-a",
      targetId: "rec-b",
      vaultNamespace: VAULT,
      sourceEntityUri: A,
      targetEntityUri: B,
    });
    expect(posts.filter((p) => /\/lws\/vault\/.*\/c$/.test(p.url))).toHaveLength(0);
    expect(puts[0]!.url).toMatch(/\/base\/r\//);
    expect(puts[0]!.body.type).toBe("t:ConnectedTo");
    expect(puts[0]!.body.type).not.toBe("ConnectedTo");
    expect(puts[0]!.body.type).toBe(GENERIC_PREDICATE_CURIE);
    expect(puts[0]!.body.facts).toMatchObject({
      "role:source": { "@id": A },
      "role:target": { "@id": B },
    });
    expect(puts[0]!.body.vault).toBe(VAULT);
    expect(puts[0]!.url).toMatch(/\/base\/r\/[0-9a-f]{26}$/);
  });

  it("N1 retired: F-LIVE of CapableOf as records is not the graph pair", async () => {
    await writePairRelation({
      sourceId: "rec-a",
      targetId: "rec-b",
      typeCurie: "t:Reference",
      vaultNamespace: VAULT,
      sourceEntityUri: A,
      targetEntityUri: B,
    });
    expect(vaults.listVaultRecordsPage).not.toHaveBeenCalled();
    expect(rels.readRelations).toHaveBeenCalledWith("rec-a", A);
    expect(puts[0]!.body.type).toBe("t:Reference");
    expect(puts[0]!.body.type).not.toBe("Reference");
  });

  it("N1 miss of named vault is a miss — does not mint on a composed default", async () => {
    await expect(
      writePairRelation({
        sourceId: "rec-a",
        targetId: "rec-b",
        sourceEntityUri: A,
        targetEntityUri: B,
      }),
    ).rejects.toThrow(/names the vault/i);
    expect(posts).toHaveLength(0);
    expect(puts).toHaveLength(0);
    expect(records.readRecord).not.toHaveBeenCalled();
  });

  it("N1 known relationId still PUTs — CREATE is the other arm of the same door", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          puts.push({ url: String(url), body: JSON.parse(String(init.body ?? "{}")) });
          return {
            ok: true,
            status: 200,
            json: async () => ({ changed: true }),
            text: async () => "",
            headers: { get: () => null },
          };
        }
        if (init?.method === "POST") {
          posts.push({ url: String(url), body: JSON.parse(String(init.body ?? "{}")) });
          throw new Error("N1 UPDATE must not POST a new mint");
        }
        throw new Error(`unexpected fetch ${url} ${init?.method}`);
      }),
    );
    const result = await writePairRelation({
      relationId: "https://ben.platform.example.test/base/r/existingrel0000000001",
      sourceId: "rec-a",
      targetId: "rec-b",
      vaultNamespace: VAULT,
      sourceEntityUri: A,
      targetEntityUri: B,
    });
    expect(puts).toHaveLength(1);
    expect(puts[0]!.url).toMatch(/\/base\/r\/existingrel0000000001$/);
    expect(posts).toHaveLength(0);
    expect(result.id).toBe("existingrel0000000001");
  });
});

describe("HT1 CREATE body type is a notation ingest accepts", () => {
  it("HT1 mint body type is t:CapableOf — not the bare slug Ann's 400 named", async () => {
    await writePairRelation({
      sourceId: "rec-a",
      targetId: "rec-b",
      typeCurie: "t:CapableOf",
      vaultNamespace: VAULT,
      sourceEntityUri: A,
      targetEntityUri: B,
    });
    expect(puts).toHaveLength(1);
    // Live ingest `normalizeTypeStage1` T7 rejects a string with no colon:
    // "a bare slug carries no namespace" — Ann 2026-09-01 400 on a club vault.
    expect(puts[0]!.body.type).toBe("t:CapableOf");
    expect(puts[0]!.body.type).not.toBe("CapableOf");
  });

  it("HT1 source no longer writes type: typeBare on mint", () => {
    const src = fileSrc();
    expect(src).not.toMatch(/type: typeBare/);
    expect(src).toMatch(/type: typeCurie/);
  });

  it("HT1 WRITE type is the CURIE — FIND ?type= stays the bare door, unused on this edge", async () => {
    await writePairRelation({
      sourceId: "rec-a",
      targetId: "rec-b",
      typeCurie: "t:CapableOf",
      vaultNamespace: VAULT,
      sourceEntityUri: A,
      targetEntityUri: B,
    });
    expect(puts[0]!.body.type).toBe("t:CapableOf");
    expect(vaults.listVaultRecordsPage).not.toHaveBeenCalled();
  });
});

/**
 * Ann 2026-09-01 a club vault: Ann → Writing Planguage
 * capable-of appeared as a node with no connecting line, then vanished.
 *
 * Named cause (re-measured at origin/main c1d3cc2): mintRelation POSTs `/lws/vault/<VAULT>/c`
 * → Base `lwsCreate` (`src/lws/crud.ts:151`) composes `baseEntityUri` → `/base/e/<id>`.
 * Graph edges come from `readRelations` → GET `/base/e/:id/relations` returning `/base/r/<id>`
 * URIs filled by PUT `/base/r/:id` AfterWrite `syncRelationMembers`.
 *
 * Recorded relation CREATE door on Base is PUT `/base/r/:id` (this file's UPDATE arm).
 * ⛔ W-MINT is mint an entity. ⛔ W-LINK is a `{ "@id" }` fact on a record, not `/base/r/`.
 * ⛔ Do not POST `/c` for a graph join. ⛔ Do not invent a Lookup row.
 */
describe("HT3a CREATE writes a /base/r/ relation the graph can read as an edge", () => {
  it("HT3a CREATE PUTs /base/r/:id — not POST /lws/vault/.../c", async () => {
    await writePairRelation({
      sourceId: "rec-a",
      targetId: "rec-b",
      typeCurie: "t:CapableOf",
      vaultNamespace: VAULT,
      sourceEntityUri: A,
      targetEntityUri: B,
    });
    const createPosts = posts.filter((p) => /\/lws\/vault\/.*\/c$/.test(p.url));
    expect(createPosts, "POST /c mints /base/e/ — not a graph edge").toHaveLength(0);
    expect(puts.length, "CREATE must PUT the recorded /base/r/:id door").toBeGreaterThan(0);
    expect(puts[0]!.url).toMatch(/\/base\/r\//);
    expect(puts[0]!.url).not.toMatch(/\/base\/e\//);
    expect(puts[0]!.body.type).toBe("t:CapableOf");
  });

  it("HT3a source CREATE is PUT /base/r — not LWS POST /c", () => {
    const src = fileSrc();
    expect(src).not.toMatch(/LWS_VAULT_CONTAINER_URL\(vault\)/);
    expect(src).toMatch(/BASE_RELATION_URL/);
    expect(src).toMatch(/putKnownRelation/);
  });

  it("HT3a CREATE pairs readRelations of the source — the door the graph reads", async () => {
    await writePairRelation({
      sourceId: "rec-a",
      targetId: "rec-b",
      typeCurie: "t:CapableOf",
      vaultNamespace: VAULT,
      sourceEntityUri: A,
      targetEntityUri: B,
    });
    expect(rels.readRelations).toHaveBeenCalledWith("rec-a", A);
  });
});
