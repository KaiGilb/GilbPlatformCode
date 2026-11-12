// createVaultPictures against the fake (run-7's upload tests, ported): the folder, the warning, endFiles' answer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVaultPictures, vaultPictureService, type VaultPictureServiceDeps } from "./vault";
import { VAULT_ORIGIN, bytes, makeWorld, prepared, type World } from "../test/world";

let w: World;
beforeEach(() => {
  w = makeWorld();
});
afterEach(() => w.done());

describe("createVaultPictures", () => {
  it("uploads the screen copy as the master and the small copy, into the folder, with no warning when the small copy is linked", async () => {
    const out = await w.pics.upload(prepared());
    expect(out.warning).toBeNull();
    expect(out.thumb).not.toBeNull();
    const files = [...w.fake.state.files.values()];
    expect(files).toHaveLength(2);
    expect(files.every((f) => (f.facts.fileFolderPath as string[])[0] === "pics")).toBe(true);
    expect(files.map((f) => f.facts.fileName).sort()).toEqual([expect.stringMatching(/-320\.jpg$/), expect.stringMatching(/\.jpg$/)].sort());
    expect(out.master.startsWith(`${VAULT_ORIGIN}/vault/e/`)).toBe(true);
  });

  it("warns, and does not throw, when the small copy's link keeps failing (one retry, no re-upload)", async () => {
    w.fake.failNext("PATCH /lws/r/:id", { status: 500, times: 2 });
    const out = await w.pics.upload(prepared());
    expect(out.warning).toMatch(/small copy/);
    expect(w.fake.calls.count("PUT /lws/vault/:vault/files")).toBe(2);
    expect(w.fake.calls.count("PATCH /lws/r/:id")).toBe(2);
  });

  it("loadCopies lists the vault once and endFiles answers the addresses that could not be ended", async () => {
    const a = w.fake.seedPicture(w.vault, { name: "a", master: bytes(50, 1), thumb: bytes(9, 2) });
    const map = await w.pics.loadCopies();
    expect(map.size).toBeGreaterThan(0);
    expect(w.fake.calls.count("GET /lws/vault/:vault/files")).toBe(1);
    w.fake.failNext("DELETE /files/:id", { status: 403 });
    const master = `${VAULT_ORIGIN}/vault/e/${a.master.id}`;
    const thumb = `${VAULT_ORIGIN}/vault/e/${a.thumb.id}`;
    expect(await w.pics.endFiles(master, [thumb])).toEqual([master]);
    expect(w.ended(a.thumb.id)).toBe(true);
  });

  it("send defaults to the bridge's signed sender (the listing carries a valid proof); a given send is used instead", async () => {
    await w.pics.loadCopies();
    expect(w.fake.calls.last()!.proof).toEqual({ ok: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const seen: string[] = [];
    const unsigned = async (m: string, u: string, i?: RequestInit) => (seen.push(`${m} ${new URL(u).pathname}`), fetch(u, { ...i, method: m }));
    const pics = createVaultPictures({ vaultOrigin: VAULT_ORIGIN, vaultRoot: w.vault.id, folder: "pics", send: unsigned });
    expect((await pics.loadCopies()).size).toBe(0); // the unsigned call is a 401 and loadCopyMap answers an empty map
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^GET \/lws\/vault\/.+\/files$/);
    expect(w.fake.calls.last()!.status).toBe(401);
    warn.mockRestore();
  });
});

describe("vaultPictureService", () => {
  const make = (extra: Partial<VaultPictureServiceDeps> = {}) => {
    const revoked: string[] = [];
    const svc = vaultPictureService({ originOf: () => VAULT_ORIGIN, folder: "pics", revoke: (u) => revoked.push(u), ...extra });
    return { svc, revoked };
  };

  it("forVault gives the same binding for the same vault and another for another vault", () => {
    const { svc } = make();
    const a = svc.forVault("https://a.example.test/vault");
    expect(svc.forVault("https://a.example.test/vault")).toBe(a);
    expect(svc.forVault("https://b.example.test/vault")).not.toBe(a);
  });

  it("the binding is made with the origin the caller's originOf gives for that vault, the folder, and the given send", async () => {
    const seen: string[] = [];
    const send = async (m: string, u: string) => (seen.push(`${m} ${u}`), new Response("{}", { status: 404 }));
    const { svc } = make({ originOf: (v) => `${v}/origin`, send });
    await svc.forVault("https://a.example.test/vault").loadCopies();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("https://a.example.test/vault/origin");
  });

  it("fresh makes a new binding for that vault only and keeps the others", () => {
    const { svc } = make();
    const a = svc.forVault("a");
    const b = svc.forVault("b");
    svc.fresh("a");
    expect(svc.forVault("a")).not.toBe(a);
    expect(svc.forVault("b")).toBe(b);
  });

  it("copies lists once until fresh, then lists again", async () => {
    const { svc } = make({ send: async () => new Response("{}", { status: 404 }) });
    const m1 = svc.copies("a");
    expect(svc.copies("a")).toBe(m1);
    await m1;
    svc.fresh("a");
    expect(svc.copies("a")).not.toBe(m1);
  });

  it("forget with an argument clears that vault's binding; with none it clears all of them", () => {
    const { svc } = make();
    const a = svc.forVault("a");
    const b = svc.forVault("b");
    svc.forget("a");
    expect(svc.forVault("a")).not.toBe(a);
    expect(svc.forVault("b")).toBe(b);
    const a2 = svc.forVault("a");
    svc.forget();
    expect(svc.forVault("a")).not.toBe(a2);
    expect(svc.forVault("b")).not.toBe(b);
  });

  it("track returns the URL; release revokes it once and a second release does nothing", () => {
    const { svc, revoked } = make();
    expect(svc.track("blob:1")).toBe("blob:1");
    svc.release("blob:1");
    svc.release("blob:1");
    svc.release("blob:never-tracked");
    expect(revoked).toEqual(["blob:1"]);
  });

  it("tracking a URL twice still revokes it once", () => {
    const { svc, revoked } = make();
    svc.track("blob:1");
    svc.track("blob:1");
    svc.releaseAll();
    svc.releaseAll();
    expect(revoked).toEqual(["blob:1"]);
  });

  it("releaseAll revokes every tracked URL", () => {
    const { svc, revoked } = make();
    svc.track("blob:1");
    svc.track("blob:2", "a");
    svc.track("blob:3");
    svc.release("blob:3");
    svc.releaseAll();
    expect(revoked.sort()).toEqual(["blob:1", "blob:2", "blob:3"]);
  });

  it("forget(vault) releases only the URLs tracked with that vault; forget() releases all", () => {
    const { svc, revoked } = make();
    svc.track("blob:a", "a");
    svc.track("blob:b", "b");
    svc.track("blob:free");
    svc.forget("a");
    expect(revoked).toEqual(["blob:a"]);
    svc.forget();
    expect(revoked.sort()).toEqual(["blob:a", "blob:b", "blob:free"]);
  });

  it("without a revoke dep it uses URL.revokeObjectURL", () => {
    const orig = URL.revokeObjectURL;
    const spy = vi.fn();
    URL.revokeObjectURL = spy as unknown as typeof URL.revokeObjectURL;
    try {
      const svc = vaultPictureService({ originOf: () => VAULT_ORIGIN, folder: "pics" });
      svc.track("blob:x");
      svc.release("blob:x");
      expect(spy).toHaveBeenCalledWith("blob:x");
    } finally {
      URL.revokeObjectURL = orig;
    }
  });
});
