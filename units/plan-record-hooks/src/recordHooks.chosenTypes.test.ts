// @vitest-environment node

/**
 * A CHOICE OF TYPES narrows what `hydrateRecordsPage` asks for.
 *
 * The hydrate function takes the chosen type names and intersects them with the census before it issues `?type=`; a rare chosen type is
 * asked for whatever its rank in the census, and a role record of each relation kind is listed.
 *
 * Collaborators mocked: the two doors, the term dereference, the device store, the content read.
 * `hydrateRecordsPage` is REAL, and so are `chosenCensusCandidates`, `issueChosenCensusNames` and `typeFacetKey`. The same function against
 * the shipped platform routes on a scratch store is a live test of the app, not ported.
 *
 * Fixture provenance: the census spellings (`t:<Name>`) and the two placements of a relation kind (`excludedTypes` in a `/base/r/` vault,
 * `types` in a `/vault/r/` vault) are what the platform answered on a scratch rig. The production code names no stakeholder kind; the
 * fixtures below use `t:Person` / `t:Organization` as values, and the relation kind here is a stand-in (a relation-plane type this suite
 * already uses); its plane is mocked. The filler type URIs are this file's own and name no term.
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
  catalogNodeTypeNames: catalog.catalogNodeTypeNames,
  heldTypePlanes: planes.heldTypePlanes,
}));

import { hydrateRecordsPage } from "./recordHooks";

const VAULT = "https://home.platform.example.test/vault";
const ORG_ID = "06gf4kbct5v2vahv3j7cw6yy28";
const ORG_URI = `${VAULT}/e/${ORG_ID}`;
const ROLE_ID = "role-a-1";
const ROLE_URI = `${VAULT}/r/${ROLE_ID}`;

/** 122 filler types, each denser than any stakeholder type, so the 100-densest ask names none of
 * the types below them. Literal names, no term. */
const FILLER = Array.from({ length: 122 }, (_, i) => ({
  typeUri: `https://ontology.platform.example.test/base/t/Filler${String(i).padStart(3, "0")}`,
  count: 4,
}));

function census(over: {
  types?: { typeUri: string; count: number }[];
  excludedTypes?: { typeUri: string; count: number }[];
}) {
  const types = over.types ?? [];
  return {
    types,
    totalItems: types.reduce((s, t) => s + t.count, 0),
    totalItemsKind: "exact" as const,
    excludedTypes: over.excludedTypes ?? [],
    vault: VAULT,
    scannedVaults: [VAULT],
  };
}

/** The `/vault/r/` form: the relation kind is under `types`, at the tail, with the rare type. */
const vaultFormCensus = () =>
  census({
    types: [
      ...FILLER,
      { typeUri: "t:Person", count: 1 },
      { typeUri: "t:Organization", count: 1 },
      { typeUri: "t:CapableOf", count: 1 },
    ],
    excludedTypes: [{ typeUri: "t:TagHandle", count: 3 }],
  });

/** The `/base/r/` form: the relation kind is disclosed only under `excludedTypes`. */
const baseFormCensus = () =>
  census({
    types: [...FILLER, { typeUri: "t:Person", count: 1 }, { typeUri: "t:Organization", count: 1 }],
    excludedTypes: [
      { typeUri: "t:CapableOf", count: 1 },
      { typeUri: "t:TagHandle", count: 3 },
    ],
  });

const PLANES: Record<string, string> = {
  Person: "entity",
  Organization: "entity",
  CapableOf: "relation",
  TagHandle: "entity",
  NoteDocument: "entity",
  Task: "entity",
};

/** The plane of exactly the names asked about, as the real reading would return it. */
function planeReading(names: readonly string[]) {
  const m = new Map<string, string>();
  for (const n of names) m.set(n, PLANES[n] ?? (n.startsWith("Filler") ? "entity" : "uncatalogued"));
  return { planes: m, dereferences: names.length, parentWalks: 0, batched: 0 };
}

function pageWith(rows: { id: string; entityUri: string; typeUri: string; updatedAt: number; label?: string }[]) {
  return { records: rows, total: rows.length, complete: true, pageSize: 20, offset: 0 };
}

const askedNames = (call = 0) => (vaultSets.listVaultRecordsPage.mock.calls[call] as [string, string[], number])[1];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vaultSets.listVaultHeldTypes.mockResolvedValue(vaultFormCensus());
  planes.heldTypePlanes.mockImplementation(async (names: readonly string[]) => planeReading(names));
  vaultSets.listVaultRecordsPage.mockResolvedValue(
    pageWith([
      { id: ORG_ID, entityUri: ORG_URI, typeUri: "t:Organization", updatedAt: 2, label: "C214 rare organization" },
      { id: ROLE_ID, entityUri: ROLE_URI, typeUri: "t:CapableOf", updatedAt: 1, label: "role" },
    ]),
  );
  records.readRecord.mockResolvedValue(null);
});

describe("the fixture puts the rare types past the 100-densest cap", () => {
  it("the rare stakeholder type and the relation kind sit at census positions 124 and 125 of 125", () => {
    const names = vaultFormCensus().types.map((t) => t.typeUri);
    expect(names).toHaveLength(125);
    expect(names.indexOf("t:Organization")).toBe(123);
    expect(names.indexOf("t:CapableOf")).toBe(124);
  });
});

describe("with chosen types, ?type= names the chosen types the census holds", () => {
  it("a rare chosen type past position 100 IS asked for, in ONE find, and nothing else is", async () => {
    const page = await hydrateRecordsPage(VAULT, 0, [], [], "live", ["organization"]);
    expect(vaultSets.listVaultHeldTypes).toHaveBeenCalledTimes(1);
    expect(vaultSets.listVaultRecordsPage).toHaveBeenCalledTimes(1);
    expect(askedNames()).toEqual(["Organization"]);
    expect(page.records.map((r) => r.id)).toContain(ORG_ID);
    expect(page.issuedTypeNames).toEqual(["Organization"]);
  });

  it("only the chosen-and-held names are dereferenced — not the 100 densest", async () => {
    await hydrateRecordsPage(VAULT, 0, [], [], "live", ["organization"]);
    expect(planes.heldTypePlanes).toHaveBeenCalledTimes(1);
    expect(planes.heldTypePlanes.mock.calls[0]![0]).toEqual(["Organization"]);
  });

  it("the choice is matched through the grid's facet key: a CURIE, a full URI and a bare id all select the type", async () => {
    for (const chosen of ["t:Organization", "https://ontology.platform.example.test/base/t/Organization", "organization"]) {
      vaultSets.listVaultRecordsPage.mockClear();
      await hydrateRecordsPage(VAULT, 0, [], [], "live", [chosen]);
      expect(askedNames(), chosen).toEqual(["Organization"]);
    }
  });

  it("/vault/r/ form: a chosen relation kind listed under types IS asked for", async () => {
    await hydrateRecordsPage(VAULT, 0, [], [], "live", ["capableof", "organization"]);
    expect(askedNames()).toEqual(["Organization", "CapableOf"]);
  });

  it("/base/r/ form: a chosen relation kind disclosed only under excludedTypes IS asked for", async () => {
    vaultSets.listVaultHeldTypes.mockResolvedValue(baseFormCensus());
    const page = await hydrateRecordsPage(VAULT, 0, [], [], "live", ["capableof", "organization"]);
    expect(askedNames()).toEqual(["Organization", "CapableOf"]);
    expect(page.records.map((r) => r.id)).toContain(ROLE_ID);
  });

  it("a chosen name-set exclusion (not a relation) is NOT asked for; the chosen type beside it is", async () => {
    vaultSets.listVaultHeldTypes.mockResolvedValue(baseFormCensus());
    await hydrateRecordsPage(VAULT, 0, [], [], "live", ["taghandle", "organization"]);
    expect(askedNames()).toEqual(["Organization"]);
  });

  it("a chosen type the vault does not hold issues NO find, and the page is empty and complete", async () => {
    const page = await hydrateRecordsPage(VAULT, 0, [], [], "live", ["task"]);
    expect(vaultSets.listVaultRecordsPage).not.toHaveBeenCalled();
    expect(catalog.catalogNodeTypeNames).not.toHaveBeenCalled();
    expect(page.records).toEqual([]);
    expect(page.complete).toBe(true);
    expect(page.askBounded).toBeUndefined();
  });

  it("the type facet the page returns is still the WHOLE census, not the narrowed set", async () => {
    const page = await hydrateRecordsPage(VAULT, 0, [], [], "live", ["organization"]);
    expect(page.types).toHaveLength(125);
    expect(page.types).toEqual(vaultFormCensus().types);
  });
});

describe("a row of a chosen relation kind is kept by the client and kept out of the device store", () => {
  const remembered = () => (cache.rememberRecord.mock.calls as unknown as [{ id: string }][]).map((c) => c[0].id);
  const clientOpts = (call = 0) =>
    (vaultSets.listVaultRecordsPage.mock.calls[call] as unknown[])[3] as
      | { admitRelationRow?: (typeUri: string) => boolean }
      | undefined;

  it("with a choice, the records client is told to admit a relation row of a chosen type, and only of a chosen type", async () => {
    await hydrateRecordsPage(VAULT, 0, [], [], "live", ["capableof", "organization"]);
    const admit = clientOpts()?.admitRelationRow;
    expect(admit).toBeTypeOf("function");
    expect(admit!("t:CapableOf")).toBe(true);
    expect(admit!("https://ontology.platform.example.test/base/t/CapableOf")).toBe(true);
    expect(admit!("t:WorksFor")).toBe(false);
  });

  it("with no choice, the records client is given no admit rule at all", async () => {
    await hydrateRecordsPage(VAULT, 0, []);
    expect(vaultSets.listVaultRecordsPage.mock.calls[0]).toHaveLength(3);
  });

  it("page 0 reports the issued relation kinds, and a role row is NOT stored while the row beside it IS", async () => {
    const page = await hydrateRecordsPage(VAULT, 0, [], [], "live", ["capableof", "organization"]);
    expect(page.issuedRelationTypeNames).toEqual(["CapableOf"]);
    expect(page.records.map((r) => r.id)).toEqual([ORG_ID, ROLE_ID]);
    expect(remembered()).toEqual([ORG_ID]);
  });

  it("a later page is told the relation kinds of page 0 and keeps its role rows out of the store too", async () => {
    const page = await hydrateRecordsPage(
      VAULT, 20, [], ["Organization", "CapableOf"], "live", ["capableof", "organization"], ["CapableOf"],
    );
    expect(planes.heldTypePlanes).not.toHaveBeenCalled();
    expect(remembered()).toEqual([ORG_ID]);
    expect(page.issuedRelationTypeNames).toEqual(["CapableOf"]);
  });

  it("a choice with no relation kind in it reports none, and stores every listed row", async () => {
    vaultSets.listVaultRecordsPage.mockResolvedValue(
      pageWith([{ id: ORG_ID, entityUri: ORG_URI, typeUri: "t:Organization", updatedAt: 2, label: "C214 rare organization" }]),
    );
    const page = await hydrateRecordsPage(VAULT, 0, [], [], "live", ["organization"]);
    expect(page.issuedRelationTypeNames).toBeUndefined();
    expect(remembered()).toEqual([ORG_ID]);
  });

  it("with no choice, relation names handed in are ignored and every listed row is stored", async () => {
    await hydrateRecordsPage(VAULT, 0, [], [], "live", [], ["Organization"]);
    expect(remembered()).toEqual([ORG_ID, ROLE_ID]);
  });
});

describe("the device-side legs do not widen a narrowed ask", () => {
  const stored = [
    { id: "task-1", vaultId: VAULT, typeUri: "t:Task", updatedAt: 1 },
    { id: "org-stored", vaultId: VAULT, typeUri: "t:Organization", updatedAt: 1 },
    { id: "untyped-1", vaultId: VAULT, typeUri: "", updatedAt: 1 },
  ];
  const held = [
    { id: "note-1", entityUri: `${VAULT}/e/note-1`, typeUri: "t:NoteDocument", facts: {}, opaqueFacts: [], etag: null, updatedAt: 1 },
  ];

  it("a stored or held type that was not chosen is not named on ?type=", async () => {
    cache.listRecordRefs.mockResolvedValueOnce(stored);
    await hydrateRecordsPage(VAULT, 0, held, [], "live", ["organization"]);
    expect(askedNames()).toEqual(["Organization"]);
  });

  it("a stored type that WAS chosen is still named when the census does not hold it (stays)", async () => {
    vaultSets.listVaultHeldTypes.mockResolvedValue(census({ types: FILLER }));
    cache.listRecordRefs.mockResolvedValueOnce(stored);
    await hydrateRecordsPage(VAULT, 0, [], [], "live", ["organization"]);
    expect(askedNames()).toEqual(["Organization"]);
  });

  it("refs of types that were not asked for are neither opened one by one nor forgotten", async () => {
    cache.listRecordRefs.mockResolvedValueOnce(stored);
    await hydrateRecordsPage(VAULT, 0, held, [], "live", ["organization"]);
    const opened = records.readRecord.mock.calls.map((c) => c[0]);
    expect(opened).not.toContain("task-1");
    expect(opened).not.toContain("untyped-1");
    expect(opened).not.toContain("note-1");
    const forgotten = cache.forgetRecord.mock.calls.map((c) => c[0]);
    expect(forgotten).not.toContain("task-1");
    expect(forgotten).not.toContain("untyped-1");
  });

  it("a stored ref of a chosen type that the complete page did not list IS forgotten (positive control)", async () => {
    cache.listRecordRefs.mockResolvedValueOnce(stored);
    await hydrateRecordsPage(VAULT, 0, [], [], "live", ["organization"]);
    expect(cache.forgetRecord.mock.calls.map((c) => c[0])).toEqual(["org-stored"]);
  });

  it("a later page reuses the narrowed names of page 0 and does not ask the census again", async () => {
    await hydrateRecordsPage(VAULT, 20, [], ["Organization"], "live", ["organization"]);
    expect(vaultSets.listVaultHeldTypes).not.toHaveBeenCalled();
    expect(askedNames()).toEqual(["Organization"]);
  });
});

describe("with no chosen types the ask is what it was", () => {
  it("an empty choice asks for the 100 densest held types, and a relation kind is not among them", async () => {
    vaultSets.listVaultHeldTypes.mockResolvedValue(
      census({ types: [{ typeUri: "t:CapableOf", count: 9 }, { typeUri: "t:Person", count: 1 }] }),
    );
    await hydrateRecordsPage(VAULT, 0, [], [], "live", []);
    expect(askedNames()).toEqual(["Person"]);
    expect(planes.heldTypePlanes.mock.calls[0]![0]).toEqual(["CapableOf", "Person"]);
  });

  it("an omitted choice and an empty choice ask for the same names", async () => {
    await hydrateRecordsPage(VAULT, 0, []);
    const omitted = askedNames();
    vaultSets.listVaultRecordsPage.mockClear();
    await hydrateRecordsPage(VAULT, 0, [], [], "live", []);
    expect(askedNames()).toEqual(omitted);
    expect(omitted).toHaveLength(100);
    expect(omitted[0]).toBe("Filler000");
  });

  it("the catalog fallback (no census door) is not narrowed by a choice", async () => {
    vaultSets.listVaultHeldTypes.mockResolvedValue(null);
    await hydrateRecordsPage(VAULT, 0, [], [], "live", ["organization"]);
    expect(askedNames()).toEqual(["NoteDocument", "Rule", "Classify"]);
  });
});
