import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { canReadVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { listReachableVaults, lwsVaultsUrl, vaultsKey } from "./reachableVaults";
import { ORIGIN, jsonResponse, setUp, stubFetch, tearDown } from "../test/support";

beforeEach(() => void setUp());
afterEach(tearDown);

// The five tests of GilbApp's `lib/base/reachableVaults.test.ts` (listReachableVaults), same inputs and expectations, the host names
// changed to example hosts. The assertions about `vaultLabel`, `canWriteVault` and `modesLabel` are left out: they test other functions of
// the app's types file, not this one. Where a test used `canWriteVault`, the modes list is asserted instead.
describe("listReachableVaults (GET /lws/vaults, the app's reachable set) — ported", () => {
  it("maps every vault the platform reports, keeping the vault-id namespace, the mode SET and the landing flag", async () => {
    stubFetch(() =>
      jsonResponse({
        "@context": "https://www.w3.org/ns/lws/v1",
        "@id": "https://kaizen.platform.example.test/lws/vaults",
        total: 2,
        vaults: [
          { "@id": "https://kaizen.platform.example.test/base/e/2jq519x3a9ft", vaultId: "https://kaizen.platform.example.test/base/pced78b6ef83587", name: null, partOf: null, parentAmbiguous: false, modes: ["read", "write"], isLandingVault: true },
          { "@id": "https://kaizen.platform.example.test/base/e/zdw80nwwq236", vaultId: "https://kaizen.platform.example.test/base/pb52ff37536d643", name: "BaseKaiZen", partOf: null, parentAmbiguous: false, modes: ["read", "write"], isLandingVault: false },
        ],
      }),
    );
    const vaults = await listReachableVaults();
    expect(vaults).toHaveLength(2);
    expect(vaults.map((p) => p.vaultId)).toEqual([
      "https://kaizen.platform.example.test/base/pced78b6ef83587",
      "https://kaizen.platform.example.test/base/pb52ff37536d643",
    ]);
    expect(vaults.filter((p) => p.isLandingVault)).toHaveLength(1);
    expect(vaults.length).toBe(2);
    expect(vaults[0]!.name).toBeNull();
  });

  it("keeps read and write DISJOINT: a write-only vault stays write-only and is not dropped", async () => {
    stubFetch(() =>
      jsonResponse({
        total: 3,
        vaults: [
          { vaultId: "https://h.example.test/base/pw", name: "WriteOnly", modes: ["write"], isLandingVault: false },
          { vaultId: "https://h.example.test/base/pr", name: "ReadOnly", modes: ["read"], isLandingVault: false },
          { vaultId: "https://h.example.test/base/pn", name: "NoModes", modes: [], isLandingVault: false },
        ],
      }),
    );
    const [w, r, n] = await listReachableVaults();
    expect(w!.modes).toEqual(["write"]);
    expect(canReadVault(w!)).toBe(false);
    expect(r!.modes).toEqual(["read"]);
    expect(canReadVault(r!)).toBe(true);
    expect(n!.modes).toEqual([]);
    expect(canReadVault(n!)).toBe(false);
  });

  it("carries a bare granted namespace (no vault entity) and an AMBIGUOUS parent honestly", async () => {
    stubFetch(() =>
      jsonResponse({
        total: 2,
        vaults: [
          { vaultId: "https://h.example.test/base/pbare", name: null, modes: ["read"], isLandingVault: false },
          { vaultId: "https://h.example.test/base/pamb", "@id": "https://h.example.test/base/e/amb", name: "Ambiguous", partOf: null, parentAmbiguous: true, modes: ["read"], isLandingVault: false },
        ],
      }),
    );
    const [bare, amb] = await listReachableVaults();
    expect(bare!.entity).toBeNull();
    expect(bare!.vaultId).toBe("https://h.example.test/base/pbare");
    expect(amb!.parentAmbiguous).toBe(true);
    expect(amb!.parent).toBeNull();
  });

  it("drops a mode it does not understand rather than passing an unknown grant through", async () => {
    stubFetch(() => jsonResponse({ total: 1, vaults: [{ vaultId: "https://h.example.test/base/px", name: "X", modes: ["read", "control", "write"], isLandingVault: false }] }));
    const [vault] = await listReachableVaults();
    expect(vault!.modes).toEqual(["read", "write"]);
  });

  it("returns an EMPTY set as a real answer, never substituting a vault", async () => {
    stubFetch(() => jsonResponse({ total: 0, vaults: [] }));
    await expect(listReachableVaults()).resolves.toEqual([]);
  });
});

describe("listReachableVaults — pinned with a fake fetch", () => {
  const node = (over: Record<string, unknown> = {}) => ({ vaultId: "https://h.example.test/base/pa", modes: ["read"], ...over });
  const one = async (over: Record<string, unknown>) => {
    stubFetch(() => jsonResponse({ vaults: [node(over)] }));
    return (await listReachableVaults())[0]!;
  };

  it("drops a node with no vaultId, and an empty one, and keeps the others in order", async () => {
    stubFetch(() =>
      jsonResponse({ vaults: [{ name: "No id", modes: ["read"] }, { vaultId: "", name: "Empty", modes: ["read"] }, node({ vaultId: "https://h.example.test/base/p1" }), node({ vaultId: "https://h.example.test/base/p2" })] }),
    );
    expect((await listReachableVaults()).map((v) => v.vaultId)).toEqual(["https://h.example.test/base/p1", "https://h.example.test/base/p2"]);
  });

  it("a body with no vaults list is an empty set", async () => {
    stubFetch(() => jsonResponse({ total: 0 }));
    await expect(listReachableVaults()).resolves.toEqual([]);
  });

  it("reads the parent from partOf only when it names both the entity and the vault", async () => {
    expect((await one({ partOf: { "@id": "https://h.example.test/base/e/up", vaultId: "https://h.example.test/base/pup" } })).parent).toEqual({ entity: "https://h.example.test/base/e/up", vaultId: "https://h.example.test/base/pup" });
    expect((await one({ partOf: { "@id": "https://h.example.test/base/e/up" } })).parent).toBeNull();
    expect((await one({ partOf: { vaultId: "https://h.example.test/base/pup" } })).parent).toBeNull();
    expect((await one({ partOf: null })).parent).toBeNull();
    expect((await one({})).parent).toBeNull();
  });

  it("parentAmbiguous is true only for the value true", async () => {
    expect((await one({ parentAmbiguous: true })).parentAmbiguous).toBe(true);
    expect((await one({ parentAmbiguous: "true" })).parentAmbiguous).toBe(false);
    expect((await one({})).parentAmbiguous).toBe(false);
  });

  it("isLandingVault is true only for the value true, so a missing flag is not landing", async () => {
    expect((await one({ isLandingVault: true })).isLandingVault).toBe(true);
    expect((await one({ isLandingVault: 1 })).isLandingVault).toBe(false);
    expect((await one({})).isLandingVault).toBe(false);
  });

  it("represents is trimmed, and a blank, missing or non-text one is null", async () => {
    expect((await one({ represents: "  https://h.example.test/base/t/Banana  " })).represents).toBe("https://h.example.test/base/t/Banana");
    expect((await one({ represents: "   " })).represents).toBeNull();
    expect((await one({ represents: "" })).represents).toBeNull();
    expect((await one({ represents: 7 })).represents).toBeNull();
    expect((await one({})).represents).toBeNull();
  });

  it("the entity and the name are carried, and absent ones are null", async () => {
    const v = await one({ "@id": "https://h.example.test/base/e/x", name: "Ann" });
    expect([v.entity, v.name]).toEqual(["https://h.example.test/base/e/x", "Ann"]);
    const bare = await one({});
    expect([bare.entity, bare.name]).toEqual([null, null]);
  });

  it("the short name is known only with podNameKnown true; it is trimmed; a blank one is known and none", async () => {
    expect(await one({ podName: "ann", podNameKnown: true })).toMatchObject({ shortName: "ann", shortNameKnown: true });
    expect(await one({ podName: "  ann  ", podNameKnown: true })).toMatchObject({ shortName: "ann", shortNameKnown: true });
    expect(await one({ podName: "   ", podNameKnown: true })).toMatchObject({ shortName: null, shortNameKnown: true });
    expect(await one({ podNameKnown: true })).toMatchObject({ shortName: null, shortNameKnown: true });
    expect(await one({ podName: "ann", podNameKnown: false })).toMatchObject({ shortName: null, shortNameKnown: false });
    expect(await one({ podName: "ann" })).toMatchObject({ shortName: null, shortNameKnown: false });
    expect(await one({ podName: 5, podNameKnown: true })).toMatchObject({ shortName: null, shortNameKnown: true });
  });

  it("asks GET on the vaults address built from the base origin, with the accept header, and signs it Bearer first", async () => {
    const auth = setUp();
    const seen = stubFetch(() => jsonResponse({ vaults: [] }));
    await listReachableVaults();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(`${ORIGIN}/lws/vaults`);
    expect(seen[0]!.init?.method).toBe("GET");
    const h = seen[0]!.init?.headers as Record<string, string>;
    expect(h.accept).toBe("application/ld+json, application/json");
    expect(h.authorization).toBe("DPoP tok-bearer");
    expect(h.dpop).toBe("proof-bearer");
    expect(auth.bearerHeaderFor).toHaveBeenCalledWith(`${ORIGIN}/lws/vaults`, "GET");
    expect(auth.dpopReadAuth).not.toHaveBeenCalled();
  });

  it("falls back to the DPoP read pair when the bearer pair has no authorization", async () => {
    const auth = setUp({ bearerHeaderFor: async () => ({}) });
    const seen = stubFetch(() => jsonResponse({ vaults: [] }));
    await listReachableVaults();
    const h = seen[0]!.init?.headers as Record<string, string>;
    expect(h.authorization).toBe("DPoP tok-read");
    expect(auth.dpopReadAuth).toHaveBeenCalledWith("GET", `${ORIGIN}/lws/vaults`);
  });

  it("falls back to the DPoP read pair when the bearer seam throws", async () => {
    setUp({ bearerHeaderFor: async () => { throw new Error("no bridge"); } });
    const seen = stubFetch(() => jsonResponse({ vaults: [] }));
    await listReachableVaults();
    expect((seen[0]!.init?.headers as Record<string, string>).authorization).toBe("DPoP tok-read");
  });

  it("builds the address from the base origin at the time of the call, not when the module loaded", async () => {
    const { setBaseOrigin } = await import("@kaigilb/gilbplatformcode-base-origin");
    expect(lwsVaultsUrl()).toBe(`${ORIGIN}/lws/vaults`);
    setBaseOrigin("https://other.example.test");
    expect(lwsVaultsUrl()).toBe("https://other.example.test/lws/vaults");
    const seen = stubFetch(() => jsonResponse({ vaults: [] }));
    await listReachableVaults();
    expect(seen[0]!.url).toBe("https://other.example.test/lws/vaults");
  });

  it("a 401 drops the DPoP token and rejects with NotSignedInError", async () => {
    const auth = setUp();
    stubFetch(() => new Response("{}", { status: 401 }));
    await expect(listReachableVaults()).rejects.toBeInstanceOf(NotSignedInError);
    expect(auth.invalidateDpop).toHaveBeenCalledTimes(1);
  });

  it("another failure rejects with the server's sentence, or the label and the status, and drops no token", async () => {
    const auth = setUp();
    stubFetch(() => jsonResponse({ message: "The vault list is busy." }, 503));
    await expect(listReachableVaults()).rejects.toThrow("The vault list is busy.");
    stubFetch(() => new Response("", { status: 500 }));
    await expect(listReachableVaults()).rejects.toThrow(/Vault listing failed \(HTTP 500\)/);
    expect(auth.invalidateDpop).not.toHaveBeenCalled();
  });
});

describe("vaultsKey", () => {
  it("is scoped to the principal, and anonymous when there is none", () => {
    expect(vaultsKey("https://id.example.test/base/p/ann")).toEqual(["base", "vaults", "https://id.example.test/base/p/ann"]);
    expect(vaultsKey(undefined)).toEqual(["base", "vaults", "anonymous"]);
  });
});
