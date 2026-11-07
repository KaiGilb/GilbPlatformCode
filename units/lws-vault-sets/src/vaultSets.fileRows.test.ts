// A caller that asks for `File` gets file rows; every other caller's output is unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setUp, tearDown } from "../test/support";
import { listVaultRecordsPage } from "./vaultSets";

const VAULT = "https://home.platform.example.test/vault";
const at = "2026-11-07T00:00:00.000Z";
const ROWS = [
  { entity: `${VAULT}/e/f1`, typeUri: "t:File", updatedAt: at, label: "a.jpg" },
  { entity: `${VAULT}/e/p1`, typeUri: "t:Person", updatedAt: at, label: "Ann" },
  { entity: `${VAULT}/e/v1`, typeUri: "t:Vault", updatedAt: at, label: "v" },
];

function serve() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ records: ROWS, total: 3, complete: true, pageSize: 20, offset: 0 }), { status: 200, headers: { "content-type": "application/json" } })),
  );
}

beforeEach(() => setUp());
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("t:File rows", () => {
  it("are returned when the caller asked for File", async () => {
    serve();
    const page = await listVaultRecordsPage(VAULT, ["File"], 0);
    expect(page.records.map((r) => r.id)).toEqual(["f1", "p1"]);
    expect(page.served).toBe(3);
  });

  it("are returned when the caller asked for File spelled t:File", async () => {
    serve();
    const page = await listVaultRecordsPage(VAULT, ["t:File"], 0);
    expect(page.records.map((r) => r.id)).toContain("f1");
  });

  it("stay dropped for a caller that did not ask for File (output pinned)", async () => {
    serve();
    for (const types of [[], ["Person"]] as string[][]) {
      const page = await listVaultRecordsPage(VAULT, types, 0);
      expect(page.records.map((r) => r.id)).toEqual(["p1"]);
      expect(page.served).toBe(3);
      expect(page.total).toBe(1);
    }
  });
});
