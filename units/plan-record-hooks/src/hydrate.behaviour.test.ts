// @vitest-environment node
// New tests for `hydrateRecordsPage` beyond the ported ones: what a page forgets, what it keeps, what it recovers, and what it says about itself.
// The two doors, the term reading, the catalogue and the device store are mocked collaborators; `hydrateRecordsPage` is real.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterEach as afterEachSetUp, beforeEach as beforeEachSetUp } from "vitest";
import { setUp, tearDown } from "../test/support";
beforeEachSetUp(() => {
  setUp();
});
afterEachSetUp(() => tearDown());

const sets = vi.hoisted(() => ({ listVaultRecordsPage: vi.fn(), listVaultHeldTypes: vi.fn(), lwsReadFetch: vi.fn() }));
const records = vi.hoisted(() => ({ readRecord: vi.fn() }));
const cache = vi.hoisted(() => ({
  listRecordRefs: vi.fn(async (): Promise<{ id: string; vaultId: string; typeUri: string; updatedAt: number }[]> => []),
  forgetRecord: vi.fn(async (_id: string) => undefined),
  rememberRecord: vi.fn(async (_ref: unknown) => undefined),
}));
const census = vi.hoisted(() => ({ catalogNodeTypeNames: vi.fn(async (): Promise<string[]> => []), heldTypePlanes: vi.fn() }));

vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listVaultRecordsPage: sets.listVaultRecordsPage,
  listVaultHeldTypes: sets.listVaultHeldTypes,
  lwsReadFetch: sets.lwsReadFetch,
}));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<Record<string, unknown>>()), readRecord: records.readRecord }));
vi.mock("@kaigilb/gilbplatformcode-working-set-store", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...cache }));
vi.mock("@kaigilb/gilbplatformcode-vault-type-census", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  catalogNodeTypeNames: census.catalogNodeTypeNames,
  heldTypePlanes: census.heldTypePlanes,
}));

import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { markFreshlyCreated, hydrateRecordsPage } from "./recordHooks";

const VAULT = "https://home.platform.example.test/base";
const uri = (id: string) => `${VAULT}/e/${id}`;
const T = (n: string) => `t:${n}`;
const row = (id: string, typeName = "NoteDocument", over: Record<string, unknown> = {}) => ({ id, entityUri: uri(id), typeUri: T(typeName), updatedAt: 1, label: id, ...over });
const page = (rows: unknown[], over: Record<string, unknown> = {}) => ({ records: rows, total: rows.length, complete: true, pageSize: 20, offset: 0, ...over });
const grid = (id: string, typeName = "NoteDocument", over: Partial<GridRecord> = {}): GridRecord => ({ id, entityUri: uri(id), typeUri: T(typeName), facts: { title: id }, opaqueFacts: [], etag: null, updatedAt: 1, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  sets.listVaultHeldTypes.mockResolvedValue(null);
  census.catalogNodeTypeNames.mockResolvedValue(["NoteDocument"]);
  cache.listRecordRefs.mockResolvedValue([]);
  sets.listVaultRecordsPage.mockImplementation(async () => page([row("a")]));
  records.readRecord.mockResolvedValue(null);
});

describe("chunks of the find", () => {
  const names = Array.from({ length: 150 }, (_, i) => `Type${String(i).padStart(3, "0")}`);
  it("150 names make two finds (100 and 50), each asked once", async () => {
    census.catalogNodeTypeNames.mockResolvedValue(names);
    await hydrateRecordsPage(VAULT, 0);
    const asked = sets.listVaultRecordsPage.mock.calls.map((c) => (c[1] as string[]).length).sort((a, b) => a - b);
    expect(asked).toEqual([50, 100]);
  });
  it("a name the door cannot be asked for is not sent, and the others still are", async () => {
    census.catalogNodeTypeNames.mockResolvedValue(["Good", "has space", "x".repeat(65), "x".repeat(64)]);
    await hydrateRecordsPage(VAULT, 0);
    expect(sets.listVaultRecordsPage.mock.calls[0]![1]).toEqual(["Good", "x".repeat(64)]);
  });
  it("only unaskable names is an error, not an empty vault", async () => {
    census.catalogNodeTypeNames.mockResolvedValue(["has space"]);
    await expect(hydrateRecordsPage(VAULT, 0)).rejects.toThrow(/all 1 named type\(s\) are unaskable/);
  });
  it("rows two chunks both list are one row", async () => {
    census.catalogNodeTypeNames.mockResolvedValue(names);
    sets.listVaultRecordsPage.mockImplementation(async () => page([row("same")]));
    const out = await hydrateRecordsPage(VAULT, 0);
    expect(out.records.map((r) => r.id)).toEqual(["same"]);
  });
  it("a chunk that fails leaves the page incomplete and bounded; the chunk that returned is shown", async () => {
    census.catalogNodeTypeNames.mockResolvedValue(names);
    let n = 0;
    sets.listVaultRecordsPage.mockImplementation(async () => {
      if (n++ === 0) throw new Error("429");
      return page([row("kept")]);
    });
    const out = await hydrateRecordsPage(VAULT, 0);
    expect(out.complete).toBe(false);
    expect(out.askBounded).toBe(true);
    expect(out.records.map((r) => r.id)).toEqual(["kept"]);
  });
  it("every chunk failing is an error, with the first failure", async () => {
    census.catalogNodeTypeNames.mockResolvedValue(names);
    sets.listVaultRecordsPage.mockRejectedValue(new Error("down"));
    await expect(hydrateRecordsPage(VAULT, 0)).rejects.toThrow("down");
  });
  it("a whole answer is complete and not bounded", async () => {
    const out = await hydrateRecordsPage(VAULT, 0);
    expect(out.complete).toBe(true);
    expect(out.askBounded).toBe(false);
  });
  it("the catalogue naming nothing is bounded: nothing was asked", async () => {
    census.catalogNodeTypeNames.mockResolvedValue([]);
    const out = await hydrateRecordsPage(VAULT, 0);
    expect(out).toMatchObject({ records: [], complete: true, askBounded: true });
    expect(sets.listVaultRecordsPage).not.toHaveBeenCalled();
  });
  it("the types held on the previous rows and those stored on the device join the find", async () => {
    cache.listRecordRefs.mockResolvedValue([{ id: "s1", vaultId: VAULT, typeUri: T("StoredType"), updatedAt: 1 }]);
    await hydrateRecordsPage(VAULT, 0, [grid("p1", "HeldType")]);
    expect(sets.listVaultRecordsPage.mock.calls[0]![1]).toEqual(["NoteDocument", "HeldType", "StoredType"]);
  });
  it("temp rows and preference records name no type", async () => {
    await hydrateRecordsPage(VAULT, 0, [grid("temp:1", "TempType"), grid("p2", "AppUiPreferences")]);
    expect(sets.listVaultRecordsPage.mock.calls[0]![1]).toEqual(["NoteDocument"]);
  });
  it("the device store's temp ids and padded type names name no type or a trimmed one", async () => {
    cache.listRecordRefs.mockResolvedValue([{ id: "temp:5", vaultId: VAULT, typeUri: T("TempType"), updatedAt: 1 }, { id: "s2", vaultId: VAULT, typeUri: "t: Padded ", updatedAt: 1 }]);
    await hydrateRecordsPage(VAULT, 0, [grid("p9", "NoteDocument", { typeUri: "t: HeldPadded " })]);
    expect(sets.listVaultRecordsPage.mock.calls[0]![1]).toEqual(["NoteDocument", "HeldPadded", "Padded"]);
  });
  it("2500 names are 25 finds, at most 24 of them in flight at once", async () => {
    census.catalogNodeTypeNames.mockResolvedValue(Array.from({ length: 2500 }, (_, i) => `Type${i}`));
    let inFlight = 0;
    let max = 0;
    sets.listVaultRecordsPage.mockImplementation(async () => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return page([]);
    });
    await hydrateRecordsPage(VAULT, 0);
    expect(sets.listVaultRecordsPage).toHaveBeenCalledTimes(25);
    expect(max).toBe(24);
  });
  it("a full-row ask is for one union only, and never over the platform's page limit", async () => {
    await hydrateRecordsPage(VAULT, 0, [], [], "live", [], [], false, { limit: 500 });
    expect(sets.listVaultRecordsPage.mock.calls[0]![3]).toMatchObject({ includeBody: true, limit: 100 });
    sets.listVaultRecordsPage.mockClear();
    census.catalogNodeTypeNames.mockResolvedValue(Array.from({ length: 150 }, (_, i) => `Type${i}`));
    await hydrateRecordsPage(VAULT, 0, [], [], "live", [], [], false, { limit: 100 });
    for (const c of sets.listVaultRecordsPage.mock.calls) expect(c[3] ?? {}).not.toHaveProperty("limit");
  });
  it("the links a page carries are kept only when the page was asked with its bodies", async () => {
    const body = { "@id": uri("lk"), sameAs: { "@id": "https://k.platform.example.test/vault" } };
    sets.listVaultRecordsPage.mockImplementation(async () => page([row("lk", "NoteDocument", { body, etag: '"e"' })]));
    const { pageLinkOf, forgetPageLinks } = await import("@kaigilb/gilbplatformcode-stakeholder-list-state");
    forgetPageLinks();
    await hydrateRecordsPage(VAULT, 0);
    expect(pageLinkOf("lk")).toBeUndefined();
    await hydrateRecordsPage(VAULT, 0, [], [], "live", [], [], true);
    expect(pageLinkOf("lk")).toEqual({ state: "linked", target: "https://k.platform.example.test/vault" });
    forgetPageLinks();
    await hydrateRecordsPage(VAULT, 0, [], [], "live", [], [], false, { limit: 40 });
    expect(pageLinkOf("lk")).toBeDefined();
  });
  it("later pages take the names the first page issued and do not ask the census or the catalogue again", async () => {
    sets.listVaultHeldTypes.mockResolvedValue({ types: [{ typeUri: T("Other"), count: 1 }], excludedTypes: [], totalItems: 1, totalItemsKind: "exact", vault: VAULT, scannedVaults: [VAULT] });
    await hydrateRecordsPage(VAULT, 20, [], ["Issued"]);
    expect(sets.listVaultHeldTypes).not.toHaveBeenCalled();
    expect(census.catalogNodeTypeNames).not.toHaveBeenCalled();
    expect(sets.listVaultRecordsPage.mock.calls[0]![1]).toEqual(["Issued"]);
  });
  it("the first page asks the census; its answer is the facet and the scanned vaults are passed on", async () => {
    sets.listVaultHeldTypes.mockResolvedValue({ types: [{ typeUri: T("Task"), count: 3 }], excludedTypes: [], totalItems: 3, totalItemsKind: "exact", vault: VAULT, scannedVaults: [VAULT, "q"] });
    census.heldTypePlanes.mockResolvedValue({ planes: new Map([["Task", "entity"]]), dereferences: 1, parentWalks: 0, batched: 0 });
    const out = await hydrateRecordsPage(VAULT, 0);
    expect(out.types).toEqual([{ typeUri: T("Task"), count: 3 }]);
    expect(out.scannedVaults).toEqual([VAULT, "q"]);
    expect(out.issuedTypeNames).toEqual(["Task"]);
  });
  it("more than 100 census names ask for the 100 densest only", async () => {
    const types = Array.from({ length: 130 }, (_, i) => ({ typeUri: T(`C${i}`), count: 200 - i }));
    sets.listVaultHeldTypes.mockResolvedValue({ types, excludedTypes: [], totalItems: 1, totalItemsKind: "exact", vault: VAULT, scannedVaults: [VAULT] });
    census.heldTypePlanes.mockImplementation(async (names: string[]) => ({ planes: new Map(names.map((n) => [n, "entity"])), dereferences: names.length, parentWalks: 0, batched: 0 }));
    await hydrateRecordsPage(VAULT, 0);
    expect(census.heldTypePlanes.mock.calls[0]![0]).toHaveLength(100);
    expect(census.heldTypePlanes.mock.calls[0]![0][0]).toBe("C0");
  });
});

describe("what a first page forgets", () => {
  const stored = (id: string, typeName = "NoteDocument") => ({ id, vaultId: VAULT, typeUri: T(typeName), updatedAt: 1 });
  it("a complete first page forgets the stored ids it did not list, and keeps the ones it did", async () => {
    cache.listRecordRefs.mockResolvedValue([stored("a"), stored("gone")]);
    await hydrateRecordsPage(VAULT, 0);
    expect(cache.forgetRecord.mock.calls.map((c) => c[0])).toEqual(["gone"]);
  });
  it("an incomplete first page forgets nothing", async () => {
    cache.listRecordRefs.mockResolvedValue([stored("gone")]);
    sets.listVaultRecordsPage.mockImplementation(async () => page([row("a")], { complete: false }));
    await hydrateRecordsPage(VAULT, 0);
    expect(cache.forgetRecord).not.toHaveBeenCalled();
  });
  it("a later page forgets nothing", async () => {
    cache.listRecordRefs.mockResolvedValue([stored("gone")]);
    await hydrateRecordsPage(VAULT, 20, [], ["NoteDocument"]);
    expect(cache.forgetRecord).not.toHaveBeenCalled();
  });
  it("a freshly created id and a temp id are kept", async () => {
    markFreshlyCreated("fresh-1");
    cache.listRecordRefs.mockResolvedValue([stored("fresh-1"), stored("temp:9"), stored("gone")]);
    await hydrateRecordsPage(VAULT, 0);
    expect(cache.forgetRecord.mock.calls.map((c) => c[0])).toEqual(["gone"]);
  });
  it("an id whose type could not be asked for is kept: the find said nothing about it", async () => {
    cache.listRecordRefs.mockResolvedValue([stored("lost", "bad name"), stored("gone")]);
    await hydrateRecordsPage(VAULT, 0);
    expect(cache.forgetRecord.mock.calls.map((c) => c[0])).toEqual(["gone"]);
  });
  it("an id the previous rows hold under a type that could not be asked for is kept", async () => {
    cache.listRecordRefs.mockResolvedValue([stored("held", "NoteDocument")]);
    await hydrateRecordsPage(VAULT, 0, [grid("held", "bad name")]);
    expect(cache.forgetRecord).not.toHaveBeenCalled();
  });
  it("every listed row is remembered on the device, with its type and recency", async () => {
    sets.listVaultRecordsPage.mockImplementation(async () => page([row("a", "NoteDocument", { updatedAt: 77 })]));
    await hydrateRecordsPage(VAULT, 0);
    expect(cache.rememberRecord).toHaveBeenCalledWith({ id: "a", vaultId: VAULT, typeUri: T("NoteDocument"), updatedAt: 77 });
  });
});

describe("what a page shows", () => {
  it("a row with a label is drawn from it without a read; a row with none is read", async () => {
    sets.listVaultRecordsPage.mockImplementation(async () => page([row("lab"), row("bare", "NoteDocument", { label: null })]));
    records.readRecord.mockResolvedValue({ id: "bare", typeUri: T("NoteDocument"), facts: { title: "Read" }, opaqueFacts: [], etag: '"e"', entityUri: uri("bare") });
    const out = await hydrateRecordsPage(VAULT, 0);
    expect(records.readRecord).toHaveBeenCalledTimes(1);
    expect(records.readRecord).toHaveBeenCalledWith("bare", uri("bare"));
    expect(out.records.find((r) => r.id === "lab")).toMatchObject({ facts: { label: "lab" }, hydrated: false });
    expect(out.records.find((r) => r.id === "bare")).toMatchObject({ facts: { title: "Read" }, hydrated: true });
  });
  it("a row that cannot be read is a stub with the membership known, and is reported", async () => {
    sets.listVaultRecordsPage.mockImplementation(async () => page([row("x", "NoteDocument", { label: null })]));
    records.readRecord.mockRejectedValue(new Error("boom"));
    const out = await hydrateRecordsPage(VAULT, 0);
    expect(out.records[0]).toMatchObject({ id: "x", facts: {}, hydrated: false });
    expect(console.warn).toHaveBeenCalled();
  });
  it("preference records are not rows", async () => {
    sets.listVaultRecordsPage.mockImplementation(async () => page([row("a"), row("prefs", "AppUiPreferences")]));
    const out = await hydrateRecordsPage(VAULT, 0);
    expect(out.records.map((r) => r.id)).toEqual(["a"]);
  });
  it("the ended list is label rows, with who ended them, asked without types and never read one by one", async () => {
    sets.listVaultRecordsPage.mockImplementation(async () => page([row("e1", "NoteDocument", { label: "Old", endingActorKind: "holder" }), row("e2", "NoteDocument", { label: null })]));
    const out = await hydrateRecordsPage(VAULT, 0, [], [], "ended");
    expect(sets.listVaultRecordsPage).toHaveBeenCalledWith(VAULT, [], 0, { lifecycle: "ended" });
    expect(out.records[0]).toMatchObject({ id: "e1", facts: { label: "Old" }, hydrated: false, etag: null, endingActorKind: "holder" });
    expect(out.records[1]).toMatchObject({ id: "e2", facts: {} });
    expect("endingActorKind" in out.records[1]!).toBe(false);
    expect(records.readRecord).not.toHaveBeenCalled();
    expect(out.issuedTypeNames).toEqual([]);
  });
});

describe("the rows the previous page held", () => {
  it("a freshly created or temp row the page did not list is put first; a stale one is not", async () => {
    markFreshlyCreated("fresh-2");
    const prev = [grid("fresh-2"), grid("temp:7"), grid("old-1")];
    const out = await hydrateRecordsPage(VAULT, 0, prev);
    expect(out.records.map((r) => r.id)).toEqual(["fresh-2", "temp:7", "a"]);
  });
  it("on a later page nothing is put first", async () => {
    markFreshlyCreated("fresh-3");
    const out = await hydrateRecordsPage(VAULT, 20, [grid("fresh-3"), grid("temp:8")], ["NoteDocument"]);
    expect(out.records.map((r) => r.id)).toEqual(["a"]);
  });
  it("a listed fresh row with no facts keeps the facts the user is looking at", async () => {
    markFreshlyCreated("fresh-4");
    sets.listVaultRecordsPage.mockImplementation(async () => page([row("fresh-4", "NoteDocument", { label: null })]));
    records.readRecord.mockResolvedValue({ id: "fresh-4", typeUri: T("NoteDocument"), facts: {}, opaqueFacts: [], etag: null, entityUri: uri("fresh-4") });
    const out = await hydrateRecordsPage(VAULT, 0, [grid("fresh-4", "NoteDocument", { facts: { title: "Typing" } })]);
    expect(out.records[0]!.facts).toEqual({ title: "Typing" });
  });
  it("a stored id whose type could not be asked for is opened one by one on the first page",async () => {
    cache.listRecordRefs.mockResolvedValue([{ id: "odd", vaultId: VAULT, typeUri: T("bad name"), updatedAt: 5 }]);
    records.readRecord.mockImplementation(async (id: string) => ({ id, typeUri: T("bad name"), facts: { title: "Odd" }, opaqueFacts: [], etag: null, entityUri: uri(id) }));
    const out = await hydrateRecordsPage(VAULT, 0);
    expect(out.records.map((r) => r.id)).toEqual(["odd", "a"]);
  });
  it("a stored id whose type chunk failed is opened one by one and put first; a live one is remembered again", async () => {
    census.catalogNodeTypeNames.mockResolvedValue(Array.from({ length: 150 }, (_, i) => (i === 0 ? "FailType" : `Type${i}`)));
    cache.listRecordRefs.mockResolvedValue([{ id: "lost", vaultId: VAULT, typeUri: T("FailType"), updatedAt: 5 }]);
    sets.listVaultRecordsPage.mockImplementation(async (_v: string, names: string[]) => {
      if (names.includes("FailType")) throw new Error("429");
      return page([row("a", "Type120")]);
    });
    records.readRecord.mockImplementation(async (id: string) => ({ id, typeUri: T("FailType"), facts: { title: "Back" }, opaqueFacts: [], etag: '"e"', entityUri: uri(id) }));
    const out = await hydrateRecordsPage(VAULT, 0);
    expect(out.records.map((r) => r.id)).toEqual(["lost", "a"]);
    expect(out.records[0]).toMatchObject({ hydrated: true, updatedAt: 5 });
    expect(cache.rememberRecord).toHaveBeenCalledWith({ id: "lost", vaultId: VAULT, typeUri: T("FailType"), updatedAt: 5 });
  });
  it("a recovered record that has been ended is forgotten, not shown", async () => {
    census.catalogNodeTypeNames.mockResolvedValue(Array.from({ length: 150 }, (_, i) => (i === 0 ? "FailType" : `Type${i}`)));
    cache.listRecordRefs.mockResolvedValue([{ id: "lost", vaultId: VAULT, typeUri: T("FailType"), updatedAt: 5 }]);
    sets.listVaultRecordsPage.mockImplementation(async (_v: string, names: string[]) => {
      if (names.includes("FailType")) throw new Error("429");
      return page([row("a", "Type120")]);
    });
    records.readRecord.mockResolvedValue({ id: "lost", typeUri: T("FailType"), facts: { entityLifecycleState: "ended" }, opaqueFacts: [], etag: null });
    const out = await hydrateRecordsPage(VAULT, 0);
    expect(out.records.map((r) => r.id)).toEqual(["a"]);
    expect(cache.forgetRecord).toHaveBeenCalledWith("lost");
  });
  it("no recovery on a later page", async () => {
    cache.listRecordRefs.mockResolvedValue([{ id: "lost", vaultId: VAULT, typeUri: T("bad name"), updatedAt: 5 }]);
    await hydrateRecordsPage(VAULT, 20, [grid("held", "bad name")], ["NoteDocument"]);
    expect(records.readRecord).not.toHaveBeenCalled();
  });
});

describe("the feed positions", () => {
  const head = (n: number) => new Response(JSON.stringify({ records: [], complete: true, nextCursor: `c:${n}` }), { status: 200, headers: { "content-type": "application/json" } });
  it("the first page of a full-row list takes both positions before it is read and hands them on", async () => {
    sets.lwsReadFetch.mockImplementation(async () => head(1));
    const onHead = vi.fn();
    await hydrateRecordsPage(VAULT, 0, [], [], "live", [], [], false, { limit: 40, onHead });
    expect(sets.lwsReadFetch).toHaveBeenCalled();
    expect(onHead).toHaveBeenCalledTimes(1);
    expect(onHead.mock.calls[0]![0]).toMatchObject({ typeNames: ["NoteDocument"] });
    expect(onHead.mock.calls[0]![0].state).toBeTruthy();
  });
  it("a later page takes none", async () => {
    sets.lwsReadFetch.mockImplementation(async () => head(1));
    const onHead = vi.fn();
    await hydrateRecordsPage(VAULT, 40, [], ["NoteDocument"], "live", [], [], false, { limit: 100, onHead });
    expect(onHead).not.toHaveBeenCalled();
    expect(sets.lwsReadFetch).not.toHaveBeenCalled();
  });
  it("an ask of several unions takes none (a position belongs to the names it was asked with)", async () => {
    census.catalogNodeTypeNames.mockResolvedValue(Array.from({ length: 150 }, (_, i) => `Type${i}`));
    sets.lwsReadFetch.mockImplementation(async () => head(1));
    const onHead = vi.fn();
    await hydrateRecordsPage(VAULT, 0, [], [], "live", [], [], false, { limit: 100, onHead });
    expect(onHead).toHaveBeenCalledWith(null);
  });
  it("a platform with no feed hands on null", async () => {
    sets.lwsReadFetch.mockImplementation(async () => new Response("{}", { status: 404 }));
    const onHead = vi.fn();
    await hydrateRecordsPage(VAULT, 0, [], [], "live", [], [], false, { limit: 100, onHead });
    expect(onHead).toHaveBeenCalledWith(null);
  });
});
