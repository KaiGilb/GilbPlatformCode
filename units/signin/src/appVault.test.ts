import { describe, expect, it, vi } from "vitest";
import {
  createAppVaultService,
  ensureAppVault,
  findOwnAppVault,
  lastUsedVault,
  PartialVaultError,
  rememberLastVault,
  vaultsOfType,
  wantedAppVaultName,
  type AppVaultConfig,
  type AppVaultDeps,
} from "./appVault";
import { VaultRequestRefusedError, SignInUnreachableError } from "./types";
import type { CreatedNamedVault, ListedVault } from "./vaults";

const TYPE = "https://example.test/base/t/Plant";
const CFG: AppVaultConfig = { represents: TYPE, nameSuffix: "houseplants", storageKey: "app" };
const P = "https://ann.example.test/vault";
const v = (host: string, extra: Partial<ListedVault> = {}): ListedVault => ({
  vaultId: `https://${host}.example.test/vault`,
  modes: ["read", "write"],
  isLandingVault: false,
  ...extra,
});
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, x: string) => void m.set(k, x), m };
};
const landing = v("ann", { name: "ann", isLandingVault: true });
const ownVault = v("annhouseplants", { name: "annhouseplants", represents: TYPE });

describe("vaultsOfType", () => {
  it("matches the type as given and with or without one trailing slash, nothing else", () => {
    const a = v("a", { represents: TYPE });
    const b = v("b", { represents: TYPE + "/" });
    const c = v("c", { represents: "https://example.test/base/t/Person" });
    expect(vaultsOfType([a, b, c, landing], TYPE)).toEqual([a, b]);
    expect(vaultsOfType([a, b], TYPE + "/")).toEqual([a, b]);
  });
});

describe("finding vaults", () => {
  const shared = v("friendplants", { name: "friendplants", represents: TYPE, modes: ["read"] });
  it("own vault: the remembered id wins over a name match; a remembered id that is gone is ignored", () => {
    const s = mem();
    const other = v("abc", { name: "abc", represents: TYPE });
    expect(findOwnAppVault([landing, ownVault, other], CFG, P, s)).toBe(ownVault);
    s.setItem(`app:own:${P}`, other.vaultId);
    expect(findOwnAppVault([landing, ownVault, other], CFG, P, s)).toBe(other);
    s.setItem(`app:own:${P}`, "https://gone.example.test/vault");
    expect(findOwnAppVault([landing, ownVault, other], CFG, P, s)).toBe(ownVault);
  });
  it("a read-only vault of the type is not own", () => {
    expect(findOwnAppVault([landing, shared], CFG, P, null)).toBeUndefined();
    const s = mem();
    s.setItem(`app:own:${P}`, shared.vaultId);
    expect(findOwnAppVault([landing, shared], CFG, P, s)).toBeUndefined();
  });
  it("a numbered variant is own; a non-numeric tail is not; the lowest number wins", () => {
    const n2 = v("annhouseplants2", { name: "annhouseplants2", represents: TYPE });
    const n10 = v("annhouseplants10", { name: "annhouseplants10", represents: TYPE });
    const xyz = v("annhouseplantsxyz", { name: "annhouseplantsxyz", represents: TYPE });
    expect(findOwnAppVault([landing, n2], CFG, P, null)).toBe(n2);
    expect(findOwnAppVault([landing, xyz], CFG, P, null)).toBeUndefined();
    expect(findOwnAppVault([landing, n10, n2], CFG, P, null)).toBe(n2);
  });
  it("last used: per person, must still be listed, any mode", () => {
    const s = mem();
    rememberLastVault(s, CFG, P, shared.vaultId);
    expect(lastUsedVault([landing, ownVault, shared], CFG, P, s)).toBe(shared);
    expect(lastUsedVault([landing, ownVault], CFG, P, s)).toBeUndefined();
    expect(lastUsedVault([shared], CFG, "https://other.example.test/vault", s)).toBeUndefined();
  });
});

describe("wantedAppVaultName", () => {
  it("shortName beats name beats host label", () => {
    const l = (x: Partial<ListedVault>) => [v("host-label", { isLandingVault: true, ...x })];
    expect(wantedAppVaultName(l({ shortName: "Short-Name", name: "Some Name" }), CFG, P)).toBe("shortnamehouseplants");
    expect(wantedAppVaultName(l({ name: "Some Name" }), CFG, P)).toBe("somenamehouseplants");
    expect(wantedAppVaultName(l({}), CFG, P)).toBe("hostlabelhouseplants");
  });
  it("says so in words when there is no landing vault", () => {
    expect(() => wantedAppVaultName([ownVault], CFG, P)).toThrow(/main vault/);
  });
});

describe("ensureAppVault (injected calls)", () => {
  const made = (complete = true): CreatedNamedVault => ({ vaultId: ownVault.vaultId, complete, name: "annhouseplants", represents: TYPE });
  const deps = (over: Partial<AppVaultDeps> = {}) => {
    let listed = [landing];
    const d = {
      list: vi.fn(async () => listed),
      checkName: vi.fn().mockResolvedValue({ available: true, reserved: false, name: "annhouseplants" }),
      create: vi.fn(async () => {
        listed = [landing, ownVault];
        return made();
      }),
      store: mem(),
      sleep: vi.fn().mockResolvedValue(undefined),
      ...over,
    } satisfies AppVaultDeps;
    return d;
  };

  it("opens an existing own vault without creating", async () => {
    const d = deps({ list: vi.fn().mockResolvedValue([landing, ownVault]) });
    const r = await ensureAppVault(d, CFG, P);
    expect(r.created).toBe(false);
    expect(r.vault).toBe(ownVault);
    expect(d.create).not.toHaveBeenCalled();
  });
  it("creates top level (no parentVault), reports the steps, remembers the id", async () => {
    const steps: string[] = [];
    const d = deps({ onStep: (s) => steps.push(s) });
    const r = await ensureAppVault(d, CFG, P);
    expect(d.checkName).toHaveBeenCalledWith("annhouseplants");
    expect(d.create).toHaveBeenCalledWith({ name: "annhouseplants", represents: TYPE });
    expect(r.created).toBe(true);
    expect(r.vault.vaultId).toBe(ownVault.vaultId);
    expect(steps).toEqual(["listing", "creating"]);
    expect((d.store as ReturnType<typeof mem>).m.get(`app:own:${P}`)).toBe(ownVault.vaultId);
  });
  it("uses the suggestion when the name is taken; throws the sentence when there is none", async () => {
    const d = deps({ checkName: vi.fn().mockResolvedValue({ available: false, reserved: false, name: "annhouseplants", suggestion: "annhouseplants2" }) });
    await ensureAppVault(d, CFG, P).catch(() => undefined);
    expect(d.create).toHaveBeenCalledWith({ name: "annhouseplants2", represents: TYPE });
    const d2 = deps({ checkName: vi.fn().mockResolvedValue({ available: false, reserved: true, name: "x", message: "That name is reserved." }) });
    await expect(ensureAppVault(d2, CFG, P)).rejects.toThrow("That name is reserved.");
    expect(d2.create).not.toHaveBeenCalled();
  });
  it("resends the identical body after sleep(2000) on complete:false, at most twice more", async () => {
    const d = deps();
    const full = d.create;
    d.create = vi.fn().mockResolvedValueOnce(made(false)).mockImplementationOnce(full) as never;
    const steps: string[] = [];
    d.onStep = ((s: string) => steps.push(s)) as never;
    await ensureAppVault(d, CFG, P);
    expect(d.sleep).toHaveBeenCalledTimes(1);
    expect(d.sleep).toHaveBeenCalledWith(2000);
    expect(d.create).toHaveBeenCalledTimes(2);
    expect((d.create as ReturnType<typeof vi.fn>).mock.calls[1]).toEqual((d.create as ReturnType<typeof vi.fn>).mock.calls[0]);
    expect(steps).toEqual(["listing", "creating", "finishing"]);
    expect(d.checkName).toHaveBeenCalledTimes(1);
  });
  it("still partial after two re-posts: PartialVaultError with vaultName, three POSTs, pending kept", async () => {
    const d = deps({ create: vi.fn().mockResolvedValue(made(false)) });
    const err = await ensureAppVault(d, CFG, P).catch((e) => e);
    expect(err).toBeInstanceOf(PartialVaultError);
    expect(err.vaultName).toBe("annhouseplants");
    expect(err.name).toBe("PartialVaultError");
    expect(d.create).toHaveBeenCalledTimes(3);
    expect(d.sleep).toHaveBeenCalledTimes(2);
    expect((d.store as ReturnType<typeof mem>).m.get(`app:pending:${P}`)).toBe("annhouseplants");
  });
  it("a refusal is thrown unchanged and clears the pending name; an unreachable platform keeps it", async () => {
    const refused = new VaultRequestRefusedError("Making the vault", 409, "taken");
    const d = deps({ create: vi.fn().mockRejectedValue(refused) });
    await expect(ensureAppVault(d, CFG, P)).rejects.toBe(refused);
    expect((d.store as ReturnType<typeof mem>).m.get(`app:pending:${P}`)).toBe("");
    const off = new SignInUnreachableError();
    const d2 = deps({ create: vi.fn().mockRejectedValue(off) });
    await expect(ensureAppVault(d2, CFG, P)).rejects.toBe(off);
    expect((d2.store as ReturnType<typeof mem>).m.get(`app:pending:${P}`)).toBe("annhouseplants");
  });
  it("made but not in the re-list: throws a sentence, returns no fake vault", async () => {
    const d = deps({ create: vi.fn().mockResolvedValue(made()) });
    await expect(ensureAppVault(d, CFG, P)).rejects.toThrow(/not in your vault list/);
  });
  it("no landing vault: the sentence, no POST", async () => {
    const d = deps({ list: vi.fn().mockResolvedValue([]) });
    await expect(ensureAppVault(d, CFG, P)).rejects.toThrow(/main vault/);
    expect(d.create).not.toHaveBeenCalled();
  });
  it("a store that throws on every call: still works, no exception", async () => {
    const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const d = deps({ store: boom });
    const r = await ensureAppVault(d, CFG, P);
    expect(r.created).toBe(true);
    expect(() => rememberLastVault(boom, CFG, P, "x")).not.toThrow();
    expect(lastUsedVault([landing], CFG, P, boom)).toBeUndefined();
  });
  it("store null: no memory, still works", async () => {
    const d = deps({ store: null });
    expect((await ensureAppVault(d, CFG, P)).created).toBe(true);
  });
});

describe("createAppVaultService", () => {
  it("concurrent opens share one run; after it settles the next open runs fresh; reset drops memos", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const list = vi.fn(async () => {
      await gate;
      return [landing, ownVault];
    });
    const svc = createAppVaultService({ list, checkName: vi.fn(), create: vi.fn(), store: null }, CFG);
    const a = svc.open(P);
    const b = svc.open(P);
    expect(a).toBe(b);
    release();
    expect((await a).vault).toBe(ownVault);
    expect(list).toHaveBeenCalledTimes(1);
    await svc.open(P);
    expect(list).toHaveBeenCalledTimes(2);
    svc.reset();
  });
  it("a failure also frees the slot", async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue([landing, ownVault]);
    const svc = createAppVaultService({ list, checkName: vi.fn(), create: vi.fn(), store: null }, CFG);
    await expect(svc.open(P)).rejects.toThrow("down");
    expect((await svc.open(P)).created).toBe(false);
  });
});
