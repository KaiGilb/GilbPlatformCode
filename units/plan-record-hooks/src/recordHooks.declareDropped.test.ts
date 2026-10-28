// @vitest-environment node

// A LISTED ROW WHOSE CONTENT WAS NEVER READ MUST NOT BE SILENT.
//
// The grading defect, in words (2026-08-19): the defect "was graded green off a two-row
// list that came back after reload — a surface that CANNOT FAIL ON CONTENT".
//
// The mechanism, measured: `GET /lws/vault/<vault>/records` answers membership ONLY — the wire
// carries `{entity, typeUri, updatedAt}` and NO facts (Base `src/lws/records.ts`, confirmed
// live in the repro: arm A3). Content comes from a per-row `GET /lws/r/<id>`. When that
// read fails, `hydrateRecordsPage` kept the row with `facts: {}` and said NOTHING. Downstream
// that is indistinguishable from a record the person never named:
//   • the grid falls through `entityDisplayName` to the entity-URI fallback and prints the
//     ADDRESS (`petter-06g1nt2pd5v131v2rzf3knf2kc`) as if it were a label
//   • the detail pane prints `Untitled` with every field blank
// Both of records carry live `a:label` facts in production db `base`. Nothing was lost;
// it was never read, and nothing said so.
//
// a path that discards what it could not carry MUST report the
// discarded set — COUNT AND IDENTITY — on the same channel as the result, and the result MUST
// be marked partial. This asserts both halves.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { afterEach as afterEachSetUp, beforeEach as beforeEachSetUp } from "vitest";
import { setUp, tearDown } from "../test/support";
beforeEachSetUp(() => {
  setUp();
});
afterEachSetUp(() => tearDown());

const vaultSets = vi.hoisted(() => ({
  listVaultRecordsPage: vi.fn(),
  // census door absent (404 → null): the FALLBACK branch, unchanged.
  listVaultHeldTypes: vi.fn(async () => null),
}));
const records = vi.hoisted(() => ({ readRecord: vi.fn() }));
const cache = vi.hoisted(() => ({
  listRecordRefs: vi.fn(async () => []),
  forgetRecord: vi.fn(async () => undefined),
  rememberRecord: vi.fn(async () => undefined),
}));
const catalog = vi.hoisted(() => ({
  readTypeCatalog: vi.fn(async () => ({
    terms: [
      { name: "NoteDocument", label: "Note", plane: "entity" as const },
      { name: "Person", label: "Person", plane: "entity" as const },
    ],
    stale: false,
  })),
  catalogEntityTypeNames: vi.fn(async () => ["NoteDocument", "Person"]),
  catalogNodeTypeNames: vi.fn(async () => ["NoteDocument", "Person"]),
}));

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
}));

import { hydrateRecordsPage } from "./recordHooks";

const VAULT = "https://kaigilb.platform.example.test/base";
const OK_ID = "hallo-note-06g1nsxabds0d9m23p0dbmpnkw";
const FAIL_ID = "petter-06g1nt2pd5v131v2rzf3knf2kc";
const OK_URI = `${VAULT.replace("/base", "")}/base/e/${OK_ID}`;
const FAIL_URI = `${VAULT.replace("/base", "")}/base/e/${FAIL_ID}`;

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vaultSets.listVaultRecordsPage.mockResolvedValue({
    records: [
      { id: OK_ID, entityUri: OK_URI, typeUri: "t:NoteDocument", updatedAt: 2, label: "hallo note" },
      { id: FAIL_ID, entityUri: FAIL_URI, typeUri: "t:Person", updatedAt: 1 },
    ],
    total: 2,
    complete: true,
    pageSize: 20,
    offset: 0,
  });
  // One row reads; one row's content read 404s — exactly the production split.
  records.readRecord.mockImplementation(async (id: string) =>
    id === OK_ID
      ? { id: OK_ID, entityUri: OK_URI, typeUri: "t:NoteDocument", facts: { label: "hallo note" }, etag: null }
      : null,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the grid paints from the list door, ⛔ not a per-row F-OPEN", () => {
  it("does not F-OPEN a labelled list row", async () => {
    await hydrateRecordsPage(VAULT, 0, []);
    const ids = records.readRecord.mock.calls.map((c) => c[0]);
    expect(ids).not.toContain(OK_ID);
    expect(ids).toContain(FAIL_ID);
  });

  it("carries the list label so a named row is not the address fallback", async () => {
    const page = await hydrateRecordsPage(VAULT, 0, []);
    const ok = page.records.find((r) => r.id === OK_ID)!;
    const failed = page.records.find((r) => r.id === FAIL_ID)!;
    expect(ok.facts.label).toBe("hallo note");
    expect(ok.hydrated).toBe(false);
    expect(failed.hydrated).toBe(false);
    expect(failed.facts).toEqual({});
  });

  it("membership is still never dropped", async () => {
    const page = await hydrateRecordsPage(VAULT, 0, []);
    expect(page.records.map((r) => r.id).sort()).toEqual([OK_ID, FAIL_ID].sort());
  });

  it("an unlabelled unread row is still reported with count and identity", async () => {
    await hydrateRecordsPage(VAULT, 0, []);
    expect(warn).toHaveBeenCalled();
    const [message, payload] = warn.mock.calls[0] as [string, unknown];
    expect(message).toContain("1 of 2");
    expect(JSON.stringify(payload)).toContain(FAIL_ID);
    expect(JSON.stringify(payload)).toContain(FAIL_URI);
  });
});
