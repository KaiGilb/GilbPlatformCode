// @vitest-environment node

/**
 * CENSUS, THEN SCOPED FIND: `hydrateRecordsPage` on a Base that SERVES the door.
 *
 * Winner: the design(*). Ruling cited at the call site:
 * –(as amended at §2). Standards row:.
 * The pre-authored RED check this is the unit twin of: — "1 census + 1 typed find, ≤ 2
 * find requests, 0 untyped calls"§2.2).
 *
 * Collaborators mocked (the two doors, the term dereference, the device store, the content read);
 * `hydrateRecordsPage` is REAL.
 * The FALLBACK branch (door absent → shipped F-CAT sweep) is the instrument of
 * recordHooks.gridTypeFind.test.ts; this file is the SERVED branch.
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
  catalogEntityTypeNames: vi.fn(async () => ["NoteDocument", "Rule"]),
  catalogNodeTypeNames: vi.fn(async () => ["NoteDocument", "Rule", "Classify"]),
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
const WP_ID = "writing-planguage-06g3absv7nwex38gnx00zxjr6w";
const WP_URI = `https://pelleparafin.platform.example.test/base/e/${WP_ID}`;

function pageWith(rows: { id: string; entityUri: string; typeUri: string; updatedAt: number }[]) {
  return { records: rows, total: rows.length, complete: true, pageSize: 20, offset: 0 };
}

/** The -shaped census: three store spellings across the rows, one relation-plane type
 * (CapableOf — the trap), one UNCATALOGUED type (WritingPlanguage — the case), and a
 * G7-excluded class disclosed in the door. */
function census() {
  return {
    types: [
      { typeUri: "https://ontology.platform.example.test/base/t/NoteDocument", count: 3 },
      { typeUri: "https://ontology.platform.example.test/base/t/Person", count: 2 },
      { typeUri: "https://ontology.platform.example.test/base/t/CapableOf", count: 4 },
      { typeUri: "https://ontology.platform.example.test/base/t/WritingPlanguage", count: 1 },
    ],
    totalItems: 10,
    totalItemsKind: "exact" as const,
    excludedTypes: [{ typeUri: "https://ontology.platform.example.test/base/t/AppUiPreferences", count: 1 }],
    vault: VAULT,
    scannedVaults: [VAULT],
  };
}

function planeMap(entries: Record<string, string>) {
  return { planes: new Map(Object.entries(entries)), dereferences: Object.keys(entries).length, parentWalks: 0, batched: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vaultSets.listVaultHeldTypes.mockResolvedValue(census());
  planes.heldTypePlanes.mockResolvedValue(
    planeMap({ NoteDocument: "entity", Person: "entity", CapableOf: "relation", WritingPlanguage: "uncatalogued" }),
  );
  vaultSets.listVaultRecordsPage.mockResolvedValue(
    pageWith([
      { id: NOTE_ID, entityUri: NOTE_URI, typeUri: "t:NoteDocument", updatedAt: 2 },
      { id: WP_ID, entityUri: WP_URI, typeUri: "t:WritingPlanguage", updatedAt: 1 },
    ]),
  );
  records.readRecord.mockImplementation(async (id: string) =>
    id === NOTE_ID
      ? { id: NOTE_ID, entityUri: NOTE_URI, typeUri: "t:NoteDocument", facts: { title: "live note" }, opaqueFacts: [], etag: null }
      : { id: WP_ID, entityUri: WP_URI, typeUri: "t:WritingPlanguage", facts: { label: "Writing Planguage" }, opaqueFacts: [], etag: null },
  );
});

describe("1 census + 1 typed find per vault view", () => {
  it("issues the census ONCE, then ONE ?type= union naming the held names — and never asks the catalog", async () => {
    await hydrateRecordsPage(VAULT, 0, []);
    expect(vaultSets.listVaultHeldTypes).toHaveBeenCalledTimes(1);
    expect(vaultSets.listVaultHeldTypes).toHaveBeenCalledWith(VAULT);
    // ⛔ F-CAT is NOT the name source when the door is served (§2: "which types EXIST?" is
    // the catalog's question; "which types does THIS VAULT HOLD?" is the census's).
    expect(catalog.catalogNodeTypeNames).not.toHaveBeenCalled();
    expect(catalog.readTypeCatalog).not.toHaveBeenCalled();
    // ONE find, bare names, never empty.
    expect(vaultSets.listVaultRecordsPage).toHaveBeenCalledTimes(1);
    const [vault, names, offset] = vaultSets.listVaultRecordsPage.mock.calls[0] as [string, string[], number];
    expect(vault).toBe(VAULT);
    expect(offset).toBe(0);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it("the relation-plane held type is NOT issued; the uncatalogued one IS (WritingPlanguage lists under its own name)", async () => {
    const page = await hydrateRecordsPage(VAULT, 0, []);
    const [, names] = vaultSets.listVaultRecordsPage.mock.calls[0] as [string, string[]];
    expect(names).toContain("NoteDocument");
    expect(names).toContain("Person");
    expect(names).toContain("WritingPlanguage");
    expect(names).not.toContain("CapableOf");
    // The plane was reached by DEREFERENCE of exactly the held names, bare — never a list.
    expect(planes.heldTypePlanes).toHaveBeenCalledTimes(1);
    expect([...(planes.heldTypePlanes.mock.calls[0]![0] as string[])].sort()).toEqual(
      ["CapableOf", "NoteDocument", "Person", "WritingPlanguage"],
    );
    // And the uncatalogued record is a grid row under its own type — un-anchored by name.
    const wp = page.records.find((r) => r.id === WP_ID);
    expect(wp).toBeDefined();
    expect(wp!.typeUri).toBe("t:WritingPlanguage");
  });

  it("the grid's type facet is F-HELD's per-viewer census, ⛔ the records-page facet (§5)", async () => {
    vaultSets.listVaultRecordsPage.mockResolvedValue({
      ...pageWith([{ id: NOTE_ID, entityUri: NOTE_URI, typeUri: "t:NoteDocument", updatedAt: 2 }]),
      // A records-page facet that DISAGREES with the census — must not surface when the door serves.
      types: [{ typeUri: "https://ontology.platform.example.test/base/t/NoteDocument", count: 99 }],
    });
    const page = await hydrateRecordsPage(VAULT, 0, []);
    expect(page.types).toEqual(census().types);
  });

  it("the second-hand legs STAY in the union (held names on prevFlat, stored names on the device)", async () => {
    cache.listRecordRefs.mockResolvedValueOnce([
      { id: "task-1", vaultId: VAULT, typeUri: "t:Task", updatedAt: 1 },
    ]);
    await hydrateRecordsPage(VAULT, 0, [
      { id: "rule-1", entityUri: `${VAULT}/e/rule-1`, typeUri: "t:Rule", facts: {}, opaqueFacts: [], etag: null, updatedAt: 1 },
    ]);
    const [, names] = vaultSets.listVaultRecordsPage.mock.calls[0] as [string, string[]];
    expect(names).toContain("Task");
    expect(names).toContain("Rule");
    expect(names).toContain("NoteDocument");
    // still ONE find — the union stays one ≤100-name chunk
    expect(vaultSets.listVaultRecordsPage).toHaveBeenCalledTimes(1);
  });

  it("a vault with more held types than one ?type= union classifies and issues only the first 100 (one typed find)", async () => {
    const types = Array.from({ length: 130 }, (_, i) => ({
      typeUri: `https://ontology.platform.example.test/base/t/Type${String(i).padStart(3, "0")}`,
      count: 130 - i,
    }));
    vaultSets.listVaultHeldTypes.mockResolvedValue({
      ...census(),
      types,
      totalItems: types.reduce((s, t) => s + t.count, 0),
    });
    const planesByName: Record<string, string> = {};
    for (const t of types.slice(0, 100)) {
      const local = t.typeUri.slice(t.typeUri.lastIndexOf("/") + 1);
      planesByName[local] = "entity";
    }
    planes.heldTypePlanes.mockResolvedValue(planeMap(planesByName));
    await hydrateRecordsPage(VAULT, 0, []);
    expect(planes.heldTypePlanes).toHaveBeenCalledTimes(1);
    const classified = planes.heldTypePlanes.mock.calls[0]![0] as string[];
    expect(classified).toHaveLength(100);
    expect(classified[0]).toBe("Type000");
    expect(classified).not.toContain("Type100");
    expect(vaultSets.listVaultRecordsPage).toHaveBeenCalledTimes(1);
    const [, names] = vaultSets.listVaultRecordsPage.mock.calls[0] as [string, string[]];
    expect(names.length).toBeLessThanOrEqual(100);
    expect(names).toContain("Type000");
    expect(names).not.toContain("Type100");
  });

  it("a vault holding no grid type for this viewer, with nothing held or stored, is EMPTY and COMPLETE — no find issued, no catalog asked", async () => {
    vaultSets.listVaultHeldTypes.mockResolvedValue({ ...census(), types: [], totalItems: 0 });
    planes.heldTypePlanes.mockResolvedValue(planeMap({}));
    const page = await hydrateRecordsPage(VAULT, 0, []);
    expect(page.records).toEqual([]);
    expect(page.complete).toBe(true);
    expect(page.types).toEqual([]);
    expect(vaultSets.listVaultRecordsPage).not.toHaveBeenCalled();
    expect(catalog.catalogNodeTypeNames).not.toHaveBeenCalled();
  });
});

describe("(iii) — the capability probe: door absent → the shipped F-CAT sweep, unchanged", () => {
  it("404 (null) takes the fallback: F-CAT names are issued and the records-page facet is the grid's facet", async () => {
    vaultSets.listVaultHeldTypes.mockResolvedValue(null);
    vaultSets.listVaultRecordsPage.mockResolvedValue({
      ...pageWith([{ id: NOTE_ID, entityUri: NOTE_URI, typeUri: "t:NoteDocument", updatedAt: 2 }]),
      types: [{ typeUri: "https://ontology.platform.example.test/base/t/NoteDocument", count: 1 }],
    });
    const page = await hydrateRecordsPage(VAULT, 0, []);
    expect(catalog.catalogNodeTypeNames).toHaveBeenCalledTimes(1);
    expect(planes.heldTypePlanes).not.toHaveBeenCalled();
    const [, names] = vaultSets.listVaultRecordsPage.mock.calls[0] as [string, string[]];
    expect(names).toEqual(expect.arrayContaining(["NoteDocument", "Rule", "Classify"]));
    expect(page.types).toEqual([{ typeUri: "https://ontology.platform.example.test/base/t/NoteDocument", count: 1 }]);
  });

  it("the fallback still never issues an untyped find (C1 — holds on both branches)", async () => {
    vaultSets.listVaultHeldTypes.mockResolvedValue(null);
    catalog.catalogNodeTypeNames.mockResolvedValueOnce([]);
    const page = await hydrateRecordsPage(VAULT, 0, []);
    expect(vaultSets.listVaultRecordsPage).not.toHaveBeenCalled();
    expect(page.records).toEqual([]);
    expect(page.complete).toBe(true);
  });
});
