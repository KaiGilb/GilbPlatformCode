// @vitest-environment node
// `listVaultHeldTypes`: the row-less, per-viewer census client. Ported from vaultSets.heldTypes.test.ts. The transport is stubbed (`fetch`);
// `listVaultHeldTypes` is real. The app's mocks of its token and DPoP modules are the fake host of `setUp`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LWS_VAULT_TYPES_URL } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { typeUri } from "@kaigilb/gilbplatformcode-record-types";
import { listVaultHeldTypes, __resetCensusDoorProbeForTest } from "./vaultSets";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
});
afterEach(() => tearDown());

const VAULT = "https://home.platform.example.test/base";

function resp(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body ?? ""),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // The census door's ABSENCE is remembered per Base origin for a window. It is module
  // state, so every arm here starts with it FORGOTTEN — otherwise the 404 arm below would
  // silently answer the arms after it, and a `null` from memory reads exactly like a 404.
  __resetCensusDoorProbeForTest();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  __resetCensusDoorProbeForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ENVELOPE = {
  "@context": ["https://www.w3.org/ns/lws/v1", { totalItemsKind: "https://ontology.example.test/ns/lws-ext#totalItemsKind" }],
  "@id": `https://home.platform.example.test/lws/vault/${encodeURIComponent(VAULT)}/types`,
  types: [
    { typeUri: "t:NoteDocument", count: 3 },
    { typeUri: "https://home.platform.example.test/base/t/Person", count: 2 },
  ],
  totalItems: 5,
  totalItemsKind: "exact",
  vault: VAULT,
  scannedVaults: [VAULT],
  excludedTypes: [{ typeUri: "t:AppUiPreferences", count: 1 }],
};

describe("F-HELD — the census door, asked ONCE, on its own path", () => {
  it("GETs /lws/vault/<vaultId>/types with the read credential and parses the nvelope", async () => {
    fetchMock.mockResolvedValue(resp(200, ENVELOPE));
    const census = await listVaultHeldTypes(VAULT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(LWS_VAULT_TYPES_URL(VAULT));
    expect(url).toMatch(/\/lws\/vault\/[^/]+\/types$/);
    // ⛔ never the records door, ⛔ never `?type=` on this call (a DISTINCT act)
    expect(url).not.toMatch(/\/records/);
    expect(url).not.toMatch(/type=/);
    expect(init.method).toBe("GET");
    expect(census).not.toBeNull();
    expect(census!.types.map((t) => t.count)).toEqual([3, 2]);
    // Both store spellings arrive; the app normalizes to ONE spelling per type.
    expect(census!.types.map((t) => t.typeUri)).toEqual([typeUri("NoteDocument"), typeUri("Person")]);
    expect(census!.totalItems).toBe(5);
    expect(census!.totalItemsKind).toBe("exact");
    expect(census!.vault).toBe(VAULT);
    expect(census!.scannedVaults).toEqual([VAULT]);
    expect(census!.excludedTypes).toHaveLength(1);
  });

  it("carries the declared accuracy: atLeast is read as atLeast, anything else as exact", async () => {
    fetchMock.mockResolvedValue(resp(200, { ...ENVELOPE, totalItemsKind: "atLeast", totalItems: 1002 }));
    const floor = await listVaultHeldTypes(VAULT);
    expect(floor!.totalItemsKind).toBe("atLeast");
    expect(floor!.totalItems).toBe(1002);
    fetchMock.mockResolvedValue(resp(200, { ...ENVELOPE, totalItemsKind: undefined, totalItems: undefined }));
    const bare = await listVaultHeldTypes(VAULT);
    expect(bare!.totalItemsKind).toBe("exact");
    // Σ count when the door omits totalItems
    expect(bare!.totalItems).toBe(5);
  });
});

describe("The capability probe (build condition iii) — the census GET itself, never a HEAD", () => {
  it("a Base that predates the door answers 404 → null (the caller takes the shipped sweep)", async () => {
    fetchMock.mockResolvedValue(resp(404, { error: "NotFound" }));
    const census = await listVaultHeldTypes(VAULT);
    expect(census).toBeNull();
    // ONE GET and NOTHING ELSE was issued to decide capability.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
  });

  it("any other failure THROWS — a 500 is an unreachable vault, ⛔ a missing capability", async () => {
    fetchMock.mockResolvedValue(resp(500, "boom"));
    await expect(listVaultHeldTypes(VAULT)).rejects.toThrow();
  });

  it("a Bearer 401 is retried ONCE with DPoP (the records door's own posture)", async () => {
    fetchMock.mockResolvedValueOnce(resp(401)).mockResolvedValueOnce(resp(200, ENVELOPE));
    const census = await listVaultHeldTypes(VAULT);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(census!.types).toHaveLength(2);
  });
});

describe("rows are NEVER read off the census", () => {
  it("a populated `records` array is reported as the falsifier and NOT consumed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(
      resp(200, { ...ENVELOPE, records: [{ entity: `${VAULT}/e/x`, typeUri: "t:NoteDocument" }] }),
    );
    const census = await listVaultHeldTypes(VAULT);
    expect(census).not.toBeNull();
    expect("records" in (census as object)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/K2 falsifier/));
  });

  it("malformed rows are dropped, never rendered as a type with no name", async () => {
    fetchMock.mockResolvedValue(
      resp(200, { ...ENVELOPE, types: [{ typeUri: "", count: 1 }, { typeUri: "t:Person" }, { typeUri: "t:Task", count: 4 }] }),
    );
    const census = await listVaultHeldTypes(VAULT);
    expect(census!.types.map((t) => t.count)).toEqual([4]);
  });
});
