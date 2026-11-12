// EESpeed round 7, batch U3a: signin's app-vault orchestration (`ensureAppVault`, `createAppVaultService`) against the fake as the platform.
// It lives here, not in signin, because this unit already takes signin as a dev-dependency (a dev-dependency back would be a cycle).
import {
  checkVaultName,
  createAppVaultService,
  createNamedVault,
  ensureAppVault,
  listVaults,
  PartialVaultError,
  type AppVaultConfig,
  type AppVaultDeps,
  type CreatedNamedVault,
} from "@kaigilb/gilbplatformcode-signin/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { world, type World } from "./support";

const TYPE = "https://veda.gilb.com/base/t/Plant";
const CFG: AppVaultConfig = { represents: TYPE, nameSuffix: "houseplants", storageKey: "app" };
const CREATE = "POST /base/vault/create-named" as const;
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, x: string) => void m.set(k, x), m };
};

let w: World;
let principal: string;
beforeEach(async () => {
  w = await world();
  principal = w.ann.principal;
});

/** Real signin calls against the fake, signed as Ann. `create` can be wrapped to make a 202 persist. */
async function depsFor(over: Partial<AppVaultDeps> = {}) {
  const ann = await w.as(w.ann);
  const credential = { authHeaders: async (m: string, u: string) => (await ann.headers(m, u)) as { Authorization: string; DPoP: string } };
  const opts = { credential, transport: w.fake.transport as never };
  const checkName = vi.fn((name: string) => checkVaultName(w.fake.origin, name, { transport: w.fake.transport as never }));
  const create = vi.fn((body: Parameters<AppVaultDeps["create"]>[0]) => createNamedVault(w.fake.origin, body, opts));
  const sleep = vi.fn().mockResolvedValue(undefined);
  const deps: AppVaultDeps = { list: () => listVaults(w.fake.origin, opts), checkName, create, store: mem(), sleep, ...over };
  return { deps, checkName, create, sleep };
}

describe("ensureAppVault against the fake", () => {
  it("the first open makes exactly one vault (created:true); the second finds it with no POST", async () => {
    const { deps } = await depsFor();
    const first = await ensureAppVault(deps, CFG, principal);
    expect(first.created).toBe(true);
    expect(first.vault).toMatchObject({ name: "annhouseplants", represents: TYPE });
    expect(w.fake.calls.count(CREATE)).toBe(1);
    const second = await ensureAppVault(deps, CFG, principal);
    expect(second.created).toBe(false);
    expect(second.vault.vaultId).toBe(first.vault.vaultId);
    expect(w.fake.calls.count(CREATE)).toBe(1);
  });

  it("two concurrent service.open calls make one POST and give the same vault", async () => {
    const { deps } = await depsFor();
    const svc = createAppVaultService(deps, CFG);
    const [a, b] = await Promise.all([svc.open(principal), svc.open(principal)]);
    expect(w.fake.calls.count(CREATE)).toBe(1);
    expect(a.vault.vaultId).toBe(b.vault.vaultId);
    expect(a.created).toBe(true);
  });

  it("a 202 is finished by re-posting the identical body once; check-name is called exactly once", async () => {
    w.fake.partialNextCreateNamed();
    const { deps, checkName, create, sleep } = await depsFor();
    const r = await ensureAppVault(deps, CFG, principal);
    expect(r.created).toBe(true);
    expect(r.vault.name).toBe("annhouseplants");
    expect(w.fake.calls.count(CREATE)).toBe(2);
    const [one, two] = w.fake.calls.of(CREATE);
    expect(two!.body).toEqual(one!.body);
    expect(create).toHaveBeenCalledTimes(2);
    expect(checkName).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("still partial after every re-post: PartialVaultError with vaultName, pending kept; a new ensure re-posts that name WITHOUT check-name and completes", async () => {
    w.fake.partialNextCreateNamed(); // the first real POST is a 202; the next two answers are made up as 202 too
    const base = await depsFor();
    let n = 0;
    const create = vi.fn(async (body: Parameters<AppVaultDeps["create"]>[0]): Promise<CreatedNamedVault> => {
      n += 1;
      if (n === 1) return base.create(body); // real 202 from the fake
      if (n <= 3) return { vaultId: "https://annhouseplants.fake.test/vault", complete: false, name: body.name, represents: body.represents };
      return base.create(body);
    });
    const deps = { ...base.deps, create };
    const err = await ensureAppVault(deps, CFG, principal).catch((e) => e);
    expect(err).toBeInstanceOf(PartialVaultError);
    expect(err.vaultName).toBe("annhouseplants");
    expect(base.checkName).toHaveBeenCalledTimes(1);
    expect(base.sleep).toHaveBeenCalledTimes(2);
    expect(deps.store!.getItem(`app:pending:${principal}`)).toBe("annhouseplants");

    const r = await ensureAppVault(deps, CFG, principal);
    expect(base.checkName).toHaveBeenCalledTimes(1); // unchanged: the half-made name is not checked again
    expect(r.created).toBe(true);
    expect(r.vault.name).toBe("annhouseplants");
    expect(w.fake.state.vaults.size).toBe(3); // ann, ben, and the one app vault: no duplicate
    expect(deps.store!.getItem(`app:pending:${principal}`)).toBe("");
  });

  it("another person holds the wanted name (nameCollision refuse): the suggestion is taken", async () => {
    w.fake.seedVault({ name: "annhouseplants", owner: w.ben, represents: TYPE });
    const { deps } = await depsFor();
    const r = await ensureAppVault(deps, CFG, principal);
    expect(r.created).toBe(true);
    expect(r.vault.name).toBe("annhouseplants2");
  });

  it("a shared read-only vault of the same type is listed but not own: a new one is made", async () => {
    const shared = w.fake.seedVault({ name: "benplants", owner: w.ben, represents: TYPE });
    w.fake.grant(shared, w.ann, "read");
    const { deps } = await depsFor();
    const listed = await deps.list();
    expect(listed.find((v) => v.name === "benplants")).toMatchObject({ modes: ["read"], represents: TYPE });
    const r = await ensureAppVault(deps, CFG, principal);
    expect(r.created).toBe(true);
    expect(r.vault.name).toBe("annhouseplants");
    expect(w.fake.calls.count(CREATE)).toBe(1);
  });
});
