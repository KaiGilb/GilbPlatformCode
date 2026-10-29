// @vitest-environment node
// S7 walk fix F-2, the root: `listVaultRecordsPage` drops the rows that are not records (field claims,
// relations, control-plane rows: `isNonRecordListEntry`) AFTER the door sent them, so a page of 20 field claims
// came back as 0 records, and the reader that pages by `offset` took "0 records" for "the end" (the grid said "No
// records yet" over a vault holding 5 people: reproduced in REAL Chrome by the s8 browser
// check on its own rig, which the first F-2 fix, tested against a fake door that kept every row, did not reach).
// The page now says how many rows the door SENT (`served`), and the reader advances by that.
// REAL: vaultSets.listVaultRecordsPage + recordPlane's register filter. MOCK: the network (a stubbed fetch).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listVaultRecordsPage } from "./vaultSets";
import { registerCardPartTypes } from "./recordPlane";
import { setUp, tearDown } from "../test/support";

const VAULT = "https://hytta.platform.example.test/base";
const row = (id: string, type: string) => ({ entity: `https://hytta.platform.example.test/base/e/${id}`, typeUri: type, updatedAt: "2026-10-15T10:00:00Z", label: null });

function door(rows: unknown[], extra: Record<string, unknown> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
    return new Response(JSON.stringify({ total: 60, complete: false, pageSize: 20, offset: 0, records: rows, ...extra }), { status: 200 });
  }));
}

// The way the app registers a person card's parts as not-register-rows (placeVocab.ts, at run time, from the master).
beforeEach(() => {
  setUp();
  registerCardPartTypes(["SelfAssertedFieldClaim", "PlaceClaim"]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("F-2: listVaultRecordsPage reports the rows the door sent, whatever the register filter keeps", () => {
  it("a page of 20 field claims: 0 records kept, 20 served, not the end", async () => {
    door(Array.from({ length: 20 }, (_, i) => row(`c${i}`, "t:SelfAssertedFieldClaim")));
    const page = await listVaultRecordsPage(VAULT, ["SelfAssertedFieldClaim", "Person"], 0);
    expect(page.records).toHaveLength(0);
    expect(page.served).toBe(20);
    expect(page.complete).toBe(false);
    expect(page.offset).toBe(0);
  });

  it("a mixed page keeps the records and still reports every row the door sent", async () => {
    door([...Array.from({ length: 17 }, (_, i) => row(`c${i}`, "t:SelfAssertedFieldClaim")), row("p1", "t:Person"), row("p2", "t:Person"), row("n1", "t:NoteDocument")]);
    const page = await listVaultRecordsPage(VAULT, ["SelfAssertedFieldClaim", "Person", "NoteDocument"], 0);
    expect(page.records.map((r) => r.id)).toEqual(["p1", "p2", "n1"]);
    expect(page.served).toBe(20);
  });

  it("an empty page: nothing served (this is the end)", async () => {
    door([], { total: 0, complete: true });
    const page = await listVaultRecordsPage(VAULT, ["Person"], 0);
    expect(page.records).toHaveLength(0);
    expect(page.served).toBe(0);
    expect(page.complete).toBe(true);
  });
});
