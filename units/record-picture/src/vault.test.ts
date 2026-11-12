// createVaultPictures against the fake (run-7's upload tests, ported): the folder, the warning, endFiles' answer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVaultPictures } from "./vault";
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
