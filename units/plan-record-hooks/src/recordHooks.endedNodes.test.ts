// @vitest-environment node

/**
 * Deleted-nodes hydrate, and the live grid must not recover an ended node one by one now that `GET /lws/r` serves ended nodes.
 *
 * Collaborators mocked; hydrateRecordsPage is REAL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterEach as afterEachSetUp, beforeEach as beforeEachSetUp } from "vitest";
import { setUp, tearDown } from "../test/support";
beforeEachSetUp(() => {
  setUp();
});
afterEachSetUp(() => tearDown());

const vaultSets = vi.hoisted(() => ({ listVaultRecordsPage: vi.fn(), listVaultHeldTypes: vi.fn() }));
const records = vi.hoisted(() => ({ readRecord: vi.fn() }));
const cache = vi.hoisted(() => ({
  listRecordRefs: vi.fn(
    async (): Promise<{ id: string; vaultId: string; typeUri: string; updatedAt: number }[]> => [],
  ),
  forgetRecord: vi.fn(async (_id: string) => undefined),
  rememberRecord: vi.fn(async () => undefined),
}));
const catalog = vi.hoisted(() => ({
  readTypeCatalog: vi.fn(),
  catalogEntityTypeNames: vi.fn(async () => ["NoteDocument"]),
  catalogNodeTypeNames: vi.fn(async () => ["NoteDocument"]),
}));
const planes = vi.hoisted(() => ({ heldTypePlanes: vi.fn() }));

vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listVaultRecordsPage: vaultSets.listVaultRecordsPage,
  listVaultHeldTypes: vaultSets.listVaultHeldTypes,
}));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readRecord: records.readRecord,
}));
vi.mock("@kaigilb/gilbplatformcode-working-set-store", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...cache,
}));
vi.mock("@kaigilb/gilbplatformcode-vault-type-census", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readTypeCatalog: catalog.readTypeCatalog,
  catalogEntityTypeNames: catalog.catalogEntityTypeNames,
  catalogNodeTypeNames: catalog.catalogNodeTypeNames,
  heldTypePlanes: planes.heldTypePlanes,
}));

import { hydrateRecordsPage } from "./recordHooks";

const VAULT = "https://home.platform.example.test/base";
const NOTE_ID = "note-06g1nsxabds0d9m23p0dbmpnkw";
const NOTE_URI = `https://home.platform.example.test/base/e/${NOTE_ID}`;
const ENDED_ID = "ended-06g1nsxabds0d9m23p0dbmpnkz";
const ENDED_URI = `https://home.platform.example.test/base/e/${ENDED_ID}`;

function pageWith(
  rows: {
    id: string;
    entityUri: string;
    typeUri: string;
    updatedAt: number;
    label?: string | null;
    endingActorKind?: "holder" | "agent";
  }[],
) {
  return { records: rows, total: rows.length, complete: true, pageSize: 20, offset: 0 };
}

function planeMap(entries: Record<string, string>) {
  return {
    planes: new Map(Object.entries(entries)),
    dereferences: Object.keys(entries).length,
    parentWalks: 0,
    batched: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  cache.listRecordRefs.mockResolvedValue([]);
  records.readRecord.mockResolvedValue(null);
});

describe("ended hydrate", () => {
  // Spec: Deleted section lists via ?lifecycle=ended, not the live F-LIVE sweep.
  it("ended hydrate asks listVaultRecordsPage with lifecycle=ended and empty type names", async () => {
    vaultSets.listVaultRecordsPage.mockResolvedValue(
      pageWith([
        {
          id: ENDED_ID,
          entityUri: ENDED_URI,
          typeUri: "t:Person",
          updatedAt: 9,
          label: "Ended person",
          endingActorKind: "holder",
        },
      ]),
    );

    const page = await hydrateRecordsPage(VAULT, 0, [], [], "ended");

    expect(vaultSets.listVaultHeldTypes).not.toHaveBeenCalled();
    expect(vaultSets.listVaultRecordsPage).toHaveBeenCalledTimes(1);
    const [vault, names, offset, opts] = vaultSets.listVaultRecordsPage.mock.calls[0] as [
      string,
      string[],
      number,
      { lifecycle?: string },
    ];
    expect(vault).toBe(VAULT);
    expect(names).toEqual([]);
    expect(offset).toBe(0);
    expect(opts).toEqual({ lifecycle: "ended" });
    expect(page.records).toHaveLength(1);
    expect(page.records[0]!.id).toBe(ENDED_ID);
    expect(page.records[0]!.endingActorKind).toBe("holder");
    expect(records.readRecord).not.toHaveBeenCalled();
  });

  it("ended hydrate keeps agent kind and omits absent kind — ⛔ does not invent holder", async () => {
    vaultSets.listVaultRecordsPage.mockResolvedValue(
      pageWith([
        {
          id: "agent-ended",
          entityUri: `${VAULT}/e/agent-ended`,
          typeUri: "t:Person",
          updatedAt: 8,
          label: "Assistant-ended",
          endingActorKind: "agent",
        },
        {
          id: "cross-ended",
          entityUri: `${VAULT}/e/cross-ended`,
          typeUri: "t:Person",
          updatedAt: 7,
          label: "Crossing-ended",
        },
      ]),
    );

    const page = await hydrateRecordsPage(VAULT, 0, [], [], "ended");
    const agent = page.records.find((r) => r.id === "agent-ended");
    const crossed = page.records.find((r) => r.id === "cross-ended");
    expect(agent!.endingActorKind).toBe("agent");
    expect(crossed!.endingActorKind).toBeUndefined();
  });
});

describe("live hydrate must not recover an ended GET", () => {
    // A deleted node leaves the live grid and stays gone across refresh. `GET /lws/r` now serves ended nodes, and the one-by-one open
    // treated a successful GET as live.
    // Force a type-chunk miss so the one-by-one open runs: 100 census names in chunk 0 (succeed),
    // stored EndedPerson in chunk 1 (fail). Then readRecord returns the ended document.
  it("F-OPEN of a stored id whose GET is ended does ⛔ not put it on the live grid", async () => {
    const censusTypes = Array.from({ length: 100 }, (_, i) => ({
      typeUri: `https://ontology.platform.example.test/base/t/Type${i}`,
      count: 1,
    }));
    vaultSets.listVaultHeldTypes.mockResolvedValue({
      types: censusTypes,
      totalItems: 100,
      totalItemsKind: "exact" as const,
      excludedTypes: [],
      vault: VAULT,
      scannedVaults: [VAULT],
    });
    const planeEntries: Record<string, string> = {};
    for (let i = 0; i < 100; i++) planeEntries[`Type${i}`] = "entity";
    planes.heldTypePlanes.mockResolvedValue(planeMap(planeEntries));

    cache.listRecordRefs.mockResolvedValue([
      { id: ENDED_ID, vaultId: VAULT, typeUri: "t:EndedPerson", updatedAt: 1 },
    ]);

    vaultSets.listVaultRecordsPage.mockImplementation(async (_vault: string, names: string[]) => {
      if (names.includes("EndedPerson")) {
        throw new Error("type-chunk miss — EndedPerson");
      }
      return pageWith([
        { id: NOTE_ID, entityUri: NOTE_URI, typeUri: "t:Type0", updatedAt: 2, label: "Live note" },
      ]);
    });

    records.readRecord.mockImplementation(async (id: string) => {
      if (id !== ENDED_ID) return null;
      return {
        id: ENDED_ID,
        entityUri: ENDED_URI,
        typeUri: "t:EndedPerson",
        facts: { entityLifecycleState: "ended", endingActorKind: "holder", label: "Should not be live" },
        opaqueFacts: [],
        etag: '"ended"',
      };
    });

    const page = await hydrateRecordsPage(VAULT, 0, []);
    expect(page.records.find((r) => r.id === ENDED_ID)).toBeUndefined();
    expect(page.records.find((r) => r.facts.entityLifecycleState === "ended")).toBeUndefined();
  });
});
