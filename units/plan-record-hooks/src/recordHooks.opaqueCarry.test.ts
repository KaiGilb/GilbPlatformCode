// @vitest-environment node

// `hydrateRecordsPage` MUST PROPAGATE THE OPACITY MARKING, ON BOTH ITS ARMS.
//
// 🔴 THIS FILE EXISTS BECAUSE A MEASUREMENT SAID IT HAD TO, ⛔ not because a diff looked thin.
//
// The increment shipped a comment naming `hydrateRecordsPage` as a member of the set of
// producers that carry `BaseRecord.opaqueFacts`, and crediting that set with being "pinned by
// a test". tested the credit rather than reading it: it made the success arm stop
// propagating the field and ran the FULL suite. **2373 tests, and not one of them noticed.**
//
// ⇒ The function was SHIPPED AND UNPINNED — deletable tomorrow with every test still green —
// while a comment asserted the opposite. That is the same defect class as the `searchHooks`
// carry earlier in this cycle, found the same way, and it is the reason the invariant is now
// carried by a REQUIRED FIELD rather than by a sentence: the compiler enumerates producers,
// and these tests hold the two behaviours a type cannot express.
//
// ⚠ BOTH ARMS, deliberately. `hydrateRecordsPage` returns through two paths and the comment
// that credited it was true of only one:
//   • the SUCCESS arm spreads `...record` from `readRecord`  → must carry the real marking
//   • the `stub()` arm builds a row for a content read that FAILED, `facts: {}` → must carry
//     `[]`, because it holds nothing and "nothing was lost" is the honest statement there
// A test that exercised only the first would have re-created the exact half-truth.

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

const VAULT = "https://ontology.platform.example.test/base";
const RICH_ID = "rich-06g1nsxabds0d9m23p0dbmpnkw";
const DEAD_ID = "dead-06g1nt2pd5v131v2rzf3knf2kc";
const RICH_URI = `https://ontology.platform.example.test/base/e/${RICH_ID}`;
const DEAD_URI = `https://ontology.platform.example.test/base/e/${DEAD_ID}`;

/** A measured spelling — `a:sanskritLabel` is a live object-valued fact on 16 veda entities. */
const SANSKRIT_LABEL = "sanskritLabel";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vaultSets.listVaultRecordsPage.mockResolvedValue({
    records: [
      { id: RICH_ID, entityUri: RICH_URI, typeUri: "t:NoteDocument", updatedAt: 2 },
      { id: DEAD_ID, entityUri: DEAD_URI, typeUri: "t:NoteDocument", updatedAt: 1 },
    ],
    total: 2,
    complete: true,
    pageSize: 20,
    offset: 0,
  });
  // One row reads and carries an unrepresentable fact; one row's content read 404s.
  records.readRecord.mockImplementation(async (id: string) =>
    id === RICH_ID
      ? {
          id: RICH_ID,
          entityUri: RICH_URI,
          typeUri: "t:NoteDocument",
          facts: { title: "Kārya", [SANSKRIT_LABEL]: "" },
          opaqueFacts: [SANSKRIT_LABEL],
          etag: null,
        }
      : null,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("open path is the list payload — ⛔ no F-OPEN of the body", () => {
  it("paints from the list door and does not GET /lws/r/:id for the grid", async () => {
    vaultSets.listVaultRecordsPage.mockResolvedValue({
      records: [
        {
          id: RICH_ID,
          entityUri: RICH_URI,
          typeUri: "t:NoteDocument",
          updatedAt: 2,
          label: "Kārya",
        },
        { id: DEAD_ID, entityUri: DEAD_URI, typeUri: "t:NoteDocument", updatedAt: 1 },
      ],
      total: 2,
      complete: true,
      pageSize: 20,
      offset: 0,
    });
    const page = await hydrateRecordsPage(VAULT, 0, []);
    // Labelled rows skip F-OPEN. Unlabelled rows still F-OPEN (create Untitled / test harness).
    expect(records.readRecord.mock.calls.map((c) => c[0])).toEqual([DEAD_ID]);
    const rich = page.records.find((r) => r.id === RICH_ID)!;
    expect(rich.facts.label).toBe("Kārya");
    expect(rich.hydrated).toBe(false);
    expect(rich.opaqueFacts).toEqual([]);
    const dead = page.records.find((r) => r.id === DEAD_ID)!;
    expect(dead.hydrated).toBe(false);
    expect(dead.facts).toEqual({});
    expect(dead.opaqueFacts).toEqual([]);
  });
});

describe("hydrateRecordsPage carries the opacity marking", () => {
  it("the SUCCESS arm propagates the marking onto the grid row", async () => {
    const page = await hydrateRecordsPage(VAULT, 0, []);

    const rich = page.records.find((r) => r.id === RICH_ID)!;
    expect(rich.hydrated).toBe(true);
    expect(rich.opaqueFacts).toContain(SANSKRIT_LABEL);
  });

  it("the STUB arm — the row whose content was never read — carries an empty marking", async () => {
    const page = await hydrateRecordsPage(VAULT, 0, []);

    const dead = page.records.find((r) => r.id === DEAD_ID)!;
    expect(dead.hydrated).toBe(false);
    expect(dead.facts).toEqual({});
    expect(dead.opaqueFacts).toEqual([]);
  });
});
