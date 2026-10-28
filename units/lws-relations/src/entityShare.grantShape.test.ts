/**
 * Cycle161 `D-F3d` — THE GRANT-SHAPE AGREEMENT WITH BASE, captured as BYTES.
 *
 * 🔴 WHAT THIS FILE IS FOR, AND WHY IT IS NOT THE SAME TEST AS `entityShare.wField.test.ts`.
 * That file asks a CLIENT question — "is the revoke a W-FIELD on one predicate, and not a
 * whole-record replace" — and it inspects the PARSED patch object. This file asks a
 * CROSS-REPO AGREEMENT question ([[Rule_Code_check-evidence#RuleChkevAgreementNotCorrectness]]):
 * *do the exact bytes this client PUTS ON THE WIRE land in the shape Base's grantee decider
 * matches?* An agreement cannot be settled by either side alone, so this file's job is to
 * pin the BYTES — and the other half of the proof is that those same bytes were REPLAYED
 * through Base's shipped `PATCH /lws/r/:id` on a rig built at Base `e8dfada`, recorded in
 * `Cycle161-FIX-D-F3d-ClientGrantShape-And-D-F9c-ShareBox-BaseApp-…`.
 *
 * ⚠ `patchRecord` is REAL here — only `readRecord`, the vault re-list, the token and `fetch`
 * are stood in for ([[Rule_Code_base-testing#RuleBasetestMockedModuleNoInstrument]]). A test
 * that mocked `patchRecord` would be measuring its own stub's argument, not the wire.
 *
 * 🔴 THE SHAPE, from Base `e8dfada` `src/authz/direct-grantee.ts`:
 *   • ONE grantee   → a BARE PRINCIPAL STRING (⛔ never a one-member array)
 *   • TWO OR MORE   → a JSON ARRAY OF BARE STRINGS
 *   • NONE          → the attribute is RETRACTED (merge-patch `null`)
 * `directGranteeMatches` admits exactly the first two; `{"@id": …}` satisfies neither
 * disjunct and `decodeDirectGrantees` drops it, which is why the pre-repair client shape
 * made a per-person revoke remove EVERY reader.
 *
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import * as records from "@kaigilb/gilbplatformcode-lws-records";
import { setUp, tearDown, type FakeHost } from "../test/support";

const vaults = vi.hoisted(() => ({ listVaultRecordsPage: vi.fn() }));

// ⚠ PARTIAL mock — `patchRecord` is deliberately NOT listed, so the REAL one runs and the
// body below is the real merge-patch body, produced by the real `attrKey` spelling.
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, readRecord: vi.fn() };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listVaultRecordsPage: vaults.listVaultRecordsPage,
}));
import { revokeEntityShare } from "./entityShare";

const VAULT = "https://person.platform.example.test/base";
const REC_ID = "rec-c161-grantshape000000001";
const FRAMED = `${VAULT}/e/${REC_ID}`;
// Fixed, so the assertions below are deterministic and depend on no environment.
const ALICE = "https://alice.platform.example.test/base";
const BOB = "https://bob.platform.example.test/base";
const CAROL = "https://carol.platform.example.test/base";
/** 🔴 THE UPLOADER'S OWN SELF-GRANT — in every fixture below, and it is not decoration.
 *  Base read authz is strictly grant-driven with NO owner arm, so `file-store.ts` plants
 *  `a:directReader = storedBy` on every stored file; the holder of an item is therefore
 *  ALREADY a member of its reader set before anyone is shared with. Measured on my rig at
 *  Base `e8dfada`: with no self-grant the holder cannot even `GET` their own entity
 *  (`authorizeReadIds(owner,[e])` → `[]`), so a fixture without it is not the production
 *  shape. Revoking somebody else MUST leave it standing — that is `D-VC1` in one assertion. */
const HOLDER = "https://ann.platform.example.test/base";

/** Every PATCH body `revokeEntityShare` put on the wire, as the literal string sent. */
let sentBodies: string[] = [];
/** Named captures, for the optional dump the Base replay consumes. */
const captured: Record<string, unknown> = {};

function recWith(directReader: string): BaseRecord {
  return {
    id: REC_ID,
    entityUri: FRAMED,
    typeUri: "t:NoteDocument",
    facts: { title: "Ann's shared note", directReader },
    opaqueFacts: [],
    etag: '"etag-1"',
  };
}

/** The frame Base would serve AFTER the revoke — `factToString` joins an array with `", "`,
 *  so the read-back is the same string whichever legal shape the value took. */
function frameAfter(remaining: string[]): BaseRecord {
  const r = recWith(remaining.join(", "));
  if (remaining.length === 0) delete (r.facts as Record<string, string>).directReader;
  return { ...r, etag: '"etag-2"' };
}

async function revokeAndCapture(before: string[], target: string): Promise<unknown> {
  sentBodies = [];
  const remaining = before.filter((p) => p !== target);
  vi.mocked(records.readRecord)
    .mockResolvedValueOnce(recWith(before.join(", ")))
    .mockResolvedValueOnce(frameAfter(remaining));
  // 🔴 C161 `F7` — the DOOR. `revokeEntityShare` takes the entity's own address as its 4th
  // argument; passing the framed URI is what makes the read reach the vault that holds the item.
  await revokeEntityShare(REC_ID, target, VAULT, FRAMED);
  expect(sentBodies, "exactly one W-FIELD PATCH per changed predicate").toHaveLength(1);
  return JSON.parse(sentBodies[0]!);
}

beforeEach(() => {
  setUp();
  vi.mocked(records.readRecord).mockReset();
  vaults.listVaultRecordsPage.mockReset();
  vaults.listVaultRecordsPage.mockResolvedValue({
    records: [], total: 0, complete: true, pageSize: 50, offset: 0,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      if (typeof init?.body === "string") sentBodies.push(init.body);
      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({}),
        headers: { get: () => '"etag-2"' },
      };
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

describe("C161 D-F3d — the grant value this client puts on the wire is the shape Base matches", () => {
  it("THREE remaining grantees ride as a JSON ARRAY OF BARE STRINGS, holder first", async () => {
    const body = await revokeAndCapture([HOLDER, ALICE, BOB, CAROL], BOB);
    captured.threeMinusOne = body;
    expect(body).toEqual({ "a:directReader": [HOLDER, ALICE, CAROL] });
  });

  it("ONE remaining grantee rides as a BARE STRING — never a one-member array", async () => {
    const body = await revokeAndCapture([HOLDER, BOB], BOB);
    captured.twoMinusOne = body;
    expect(body).toEqual({ "a:directReader": HOLDER });
    // The array form would be a DIFFERENT value hash for a set Base has always stored as a
    // scalar — stated as its own assertion because "equals a string" and "is not an array"
    // are two different claims and only the second one names the hazard.
    expect(Array.isArray((body as Record<string, unknown>)["a:directReader"])).toBe(false);
  });

  it("the LAST grantee leaving retracts the attribute — merge-patch null", async () => {
    const body = await revokeAndCapture([ALICE], ALICE);
    captured.oneMinusOne = body;
    expect(body).toEqual({ "a:directReader": null });
  });

  it("revoking a shared reader never names the HOLDER's own self-grant for removal (D-VC1)", async () => {
    const body = (await revokeAndCapture([HOLDER, ALICE, BOB], BOB)) as Record<string, unknown>;
    expect(body["a:directReader"]).toContain(HOLDER);
  });

  it("no wire value anywhere is an `@id` object — the shape Base matches NOWHERE", async () => {
    for (const [before, target] of [
      [[HOLDER, ALICE, BOB, CAROL], BOB],
      [[HOLDER, BOB], BOB],
    ] as const) {
      const body = await revokeAndCapture([...before], target);
      expect(JSON.stringify(body)).not.toContain("@id");
    }
  });
});
