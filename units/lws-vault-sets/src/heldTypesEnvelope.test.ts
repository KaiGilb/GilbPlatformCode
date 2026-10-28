// @vitest-environment node
// New tests for `listVaultHeldTypes` beyond the ported ones: the shapes of the envelope that are read tolerantly.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { typeUri } from "@kaigilb/gilbplatformcode-record-types";
import { listVaultHeldTypes, __resetCensusDoorProbeForTest } from "./vaultSets";
import { resp as respond, setUp, tearDown } from "../test/support";

const resp = (status: number, body: unknown): Response => respond(status, { body });

const VAULT = "https://home.platform.example.test/base";
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setUp();
  __resetCensusDoorProbeForTest();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  __resetCensusDoorProbeForTest();
  vi.unstubAllGlobals();
  tearDown();
});

describe("listVaultHeldTypes: the envelope is read tolerantly", () => {
  it("keeps only the scanned vaults that are strings, and none when the member is absent", async () => {
    fetchMock.mockResolvedValue(resp(200, { types: [], scannedVaults: [VAULT, 3, null, "https://q.platform.example.test/base"] }));
    expect((await listVaultHeldTypes(VAULT))!.scannedVaults).toEqual([VAULT, "https://q.platform.example.test/base"]);
    fetchMock.mockResolvedValue(resp(200, { types: [] }));
    expect((await listVaultHeldTypes(VAULT))!.scannedVaults).toEqual([]);
  });
  it("answers the vault only when it is a string", async () => {
    fetchMock.mockResolvedValue(resp(200, { types: [], vault: 5 }));
    expect((await listVaultHeldTypes(VAULT))!.vault).toBeNull();
    fetchMock.mockResolvedValue(resp(200, { types: [], vault: VAULT }));
    expect((await listVaultHeldTypes(VAULT))!.vault).toBe(VAULT);
  });
  it("normalises the spelling of every type, held and excluded, to the one absolute form", async () => {
    fetchMock.mockResolvedValue(
      resp(200, { types: [{ typeUri: "t:Task", count: 2 }], excludedTypes: [{ typeUri: "t:File", count: 1 }, { typeUri: "Vault", count: "x" }] }),
    );
    const census = (await listVaultHeldTypes(VAULT))!;
    expect(census.types).toEqual([{ typeUri: typeUri("Task"), count: 2 }]);
    expect(census.excludedTypes).toEqual([{ typeUri: typeUri("File"), count: 1 }]);
  });
  it("a body with no types member is an empty census", async () => {
    fetchMock.mockResolvedValue(resp(200, {}));
    const census = (await listVaultHeldTypes(VAULT))!;
    expect(census.types).toEqual([]);
    expect(census.totalItems).toBe(0);
    expect(census.excludedTypes).toEqual([]);
  });
  it("asks the census door with a GET at the vault's own origin", async () => {
    fetchMock.mockResolvedValue(resp(200, { types: [] }));
    await listVaultHeldTypes(VAULT);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`https://home.platform.example.test/lws/vault/${encodeURIComponent(VAULT)}/types`);
  });
});
