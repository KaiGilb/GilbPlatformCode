// @vitest-environment node
// The census door's capability, remembered (absence only) and re-asked after a bounded window. Ported from vaultSets.censusDoorProbe.test.ts.
// The transport is stubbed (`fetch`); `listVaultHeldTypes` is real. The app's mocks of its token and DPoP modules are the fake host of `setUp`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { listVaultHeldTypes, __resetCensusDoorProbeForTest, CENSUS_DOOR_ABSENT_TTL_MS } from "./vaultSets";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
});
afterEach(() => tearDown());

/** Two vaults the SAME Base serves (one host, two vault namespaces — the rig and dev shape
 * `vaultOriginOf` documents), and one vault on a DIFFERENT Base. */
const VAULT_A = "https://home.platform.example.test/base";
const VAULT_B = "https://home.platform.example.test/team/base";
const VAULT_ELSEWHERE = "https://geo.other.example.test/base";

const ENVELOPE = {
  types: [{ typeUri: "t:NoteDocument", count: 3 }],
  totalItems: 3,
  totalItemsKind: "exact",
  excludedTypes: [],
  vault: VAULT_A,
  scannedVaults: [VAULT_A],
};

function resp(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body ?? ""),
  } as unknown as Response;
}

const T0 = Date.parse("2026-09-02T22:00:00.000Z");

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  __resetCensusDoorProbeForTest();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __resetCensusDoorProbeForTest();
});

/** Every `GET …/types` this run issued — the instrument is the REQUEST, not a flag. */
function typesRequests(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => /\/lws\/vault\/[^/]+\/types$/.test(u));
}

describe("a Base WITHOUT the census door is asked ONCE, not once per hydrate", () => {
  it("four hydrates of the same vault issue ONE probe — the other three cost NO request at all", async () => {
    fetchMock.mockResolvedValue(resp(404, { message: "Route GET:/lws/vault/x/types not found" }));

    const answers = [
      await listVaultHeldTypes(VAULT_A),
      await listVaultHeldTypes(VAULT_A),
      await listVaultHeldTypes(VAULT_A),
      await listVaultHeldTypes(VAULT_A),
    ];

    // Every hydrate still gets the SAME verdict — the caller takes the shipped F-CAT sweep.
    expect(answers).toEqual([null, null, null, null]);
    // …and the door was asked exactly once. At `bfd8889` this reads 4.
    expect(typesRequests()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a SECOND vault on the SAME Base origin rides the same verdict — `useRecordsMulti` pays 1, not N", async () => {
    expect(vaultOriginOf(VAULT_A)).toBe(vaultOriginOf(VAULT_B));
    fetchMock.mockResolvedValue(resp(404, { message: "not found" }));

    expect(await listVaultHeldTypes(VAULT_A)).toBeNull();
    expect(await listVaultHeldTypes(VAULT_B)).toBeNull();

    expect(typesRequests()).toHaveLength(1);
  });

  it("the verdict is scoped to the BASE ORIGIN — a vault on ANOTHER Base is still asked", async () => {
    expect(vaultOriginOf(VAULT_ELSEWHERE)).not.toBe(vaultOriginOf(VAULT_A));
    fetchMock.mockResolvedValue(resp(404, { message: "not found" }));

    await listVaultHeldTypes(VAULT_A);
    await listVaultHeldTypes(VAULT_ELSEWHERE);

    // Two origins, two probes: one Base's absence is never read as another's.
    expect(typesRequests()).toHaveLength(2);
  });
});

describe("HONESTY — the probe can still say YES; a Base that GAINS the door is found", () => {
  it("after the window elapses the door is asked AGAIN, and a Base promoted mid-session answers", async () => {
    fetchMock.mockResolvedValue(resp(404, { message: "not found" }));
    expect(await listVaultHeldTypes(VAULT_A)).toBeNull();
    expect(typesRequests()).toHaveLength(1);

    // …still inside the window: no request, same verdict.
    vi.setSystemTime(T0 + CENSUS_DOOR_ABSENT_TTL_MS - 1);
    expect(await listVaultHeldTypes(VAULT_A)).toBeNull();
    expect(typesRequests()).toHaveLength(1);

    // romotes the census door under the running client.
    vi.setSystemTime(T0 + CENSUS_DOOR_ABSENT_TTL_MS);
    fetchMock.mockResolvedValue(resp(200, ENVELOPE));
    const census = await listVaultHeldTypes(VAULT_A);

    expect(typesRequests()).toHaveLength(2);
    expect(census).not.toBeNull();
    expect(census!.types.map((t) => t.count)).toEqual([3]);
  });

  it("a door that comes back and goes away again is remembered AFRESH — the window restarts from the NEW 404", async () => {
    // T0: absent.
    fetchMock.mockResolvedValue(resp(404, { message: "not found" }));
    expect(await listVaultHeldTypes(VAULT_A)).toBeNull();

    // One window later the door is asked again and ANSWERS — a rollout, or a rollback undone.
    const BACK = T0 + CENSUS_DOOR_ABSENT_TTL_MS;
    vi.setSystemTime(BACK);
    fetchMock.mockResolvedValue(resp(200, ENVELOPE));
    expect(await listVaultHeldTypes(VAULT_A)).not.toBeNull();

    // Shortly after, the Base is rolled back and the door is gone again.
    const GONE_AGAIN = BACK + 5_000;
    vi.setSystemTime(GONE_AGAIN);
    fetchMock.mockResolvedValue(resp(404, { message: "not found" }));
    expect(await listVaultHeldTypes(VAULT_A)).toBeNull();
    expect(typesRequests()).toHaveLength(3);

    // …and the SECOND absence starts its OWN window. A memo that recorded only the FIRST
    // instant would already be expired here and would pay a fourth 404.
    vi.setSystemTime(GONE_AGAIN + CENSUS_DOOR_ABSENT_TTL_MS - 1);
    expect(await listVaultHeldTypes(VAULT_B)).toBeNull();
    expect(typesRequests()).toHaveLength(3);
  });
});

describe("ONLY absence is remembered; the census itself is never cached", () => {
  it("a SERVED door is asked on EVERY call — the census is the caller's answer, not a probe result", async () => {
    fetchMock.mockResolvedValue(resp(200, ENVELOPE));

    await listVaultHeldTypes(VAULT_A);
    await listVaultHeldTypes(VAULT_A);
    await listVaultHeldTypes(VAULT_A);

    // ⛔ No memo on the served path: three views, three fresh censuses. A cached census would
    // answer a vault's CURRENT holdings from a stale reading (the census is a vault answer).
    expect(typesRequests()).toHaveLength(3);
  });

  it("a 500 still THROWS after a remembered absence has expired — absence is not an error memo", async () => {
    fetchMock.mockResolvedValue(resp(404, { message: "not found" }));
    expect(await listVaultHeldTypes(VAULT_A)).toBeNull();

    vi.setSystemTime(T0 + CENSUS_DOOR_ABSENT_TTL_MS);
    fetchMock.mockResolvedValue(resp(500, "boom"));
    await expect(listVaultHeldTypes(VAULT_A)).rejects.toThrow();

    // A 500 proves the ROUTE exists (the vault is unreachable) — so it must not be
    // re-remembered as an absence.
    vi.setSystemTime(T0 + CENSUS_DOOR_ABSENT_TTL_MS + 1);
    fetchMock.mockResolvedValue(resp(200, ENVELOPE));
    expect(await listVaultHeldTypes(VAULT_A)).not.toBeNull();
    expect(typesRequests()).toHaveLength(3);
  });
});
