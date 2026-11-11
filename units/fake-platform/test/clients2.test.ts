// Part 2 against the code-bank clients that will use it: picture-set (upload with a small copy, list every page, thumbFor, endFile),
// picture-upload (the door) and vault-access (grant, share, unshare, read the list). Their real functions, the fake as the platform.
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { PictureUploadError, uploadPicture } from "@kaigilb/gilbplatformcode-picture-upload";
import { PictureFilesError, endFile, endPictureFiles, listVaultFiles, thumbFor, thumbIndexFor, uploadWithThumb } from "@kaigilb/gilbplatformcode-picture-set";
import { VaultAccessError, fetchVaultAcl, grantVaultAccess, revokeVaultAccess, shareVault, unshareVault } from "@kaigilb/gilbplatformcode-vault-access";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { world, type Who, type World } from "./support";

function signAs(who: Who) {
  const sign = (method: string, url: string) => who.headers(method, url);
  setLwsAuth({
    bearerHeaderFor: (url, method) => sign(method ?? "GET", url),
    dpopReadAuth: sign,
    dpopWriteAuth: sign,
    invalidateDpop: () => undefined,
    tokenManager: { getSession: async () => ({ principal: who.person.principal, vault: null, vaults: [] }), invalidate: () => undefined },
  });
}
const bytes = (n: number, seed = 1): Uint8Array<ArrayBuffer> => {
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = (i * 7 + seed) % 251;
  return u;
};

let w: World;
beforeEach(async () => {
  w = await world();
  setBaseOrigin(w.fake.origin);
  vi.stubGlobal("fetch", w.fake.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
});
const VAULT_ORIGIN = "https://ann.fake.test";
const target = (folder = "pictures") => ({ vaultOrigin: VAULT_ORIGIN, vaultRoot: w.annV.id, folder });

describe("picture-set and picture-upload against the fake", () => {
  it("uploadWithThumb: the master, the 320 copy and the transcodedFrom link all land; the listing alone gives the copy index; thumbFor names the copy", async () => {
    const ann = await w.as(w.ann);
    signAs(ann);
    const master = new File([bytes(2000)], "heron.jpg", { type: "image/jpeg" });
    const thumb = new Blob([bytes(100, 3)], { type: "image/jpeg" });
    const masterEntity = await uploadWithThumb(master, thumb, {}, target());
    const files = await listVaultFiles(w.annV.id, { origin: VAULT_ORIGIN, send: ann.send });
    expect(files.map((f) => f.fileName)).toEqual(["heron-320.jpg", "heron.jpg"]);
    expect(files.find((f) => f.fileName === "heron-320.jpg")!.transcodedFrom).toBe(masterEntity); // the platform carries it per file now
    expect(files[0]!.byteSize).toBe(100);
    const index = thumbIndexFor(files);
    const thumbEntity = files.find((f) => f.fileName === "heron-320.jpg")!.entity;
    expect(thumbFor(masterEntity, index)).toBe(thumbEntity);
    expect(thumbFor("https://ann.fake.test/vault/e/none", index)).toBe("https://ann.fake.test/vault/e/none");
    expect(w.fake.violations).toEqual([]);
    expect(w.fake.calls.of("PATCH /lws/r/:id")).toHaveLength(1);
    expect([...w.fake.state.files.values()].every((f) => (f.facts.fileFolderPath as string[])[0] === "pictures")).toBe(true);
  });
  it("the same picture uploaded twice is 200 (picture-upload accepts both) and stays one file", async () => {
    signAs(await w.as(w.ann));
    const blob = new Blob([bytes(64)], { type: "image/jpeg" });
    const e1 = await uploadPicture(blob, "a.jpg", target());
    const e2 = await uploadPicture(blob, "a.jpg", target());
    expect(e2).toBe(e1);
    expect(w.fake.calls.of("PUT /lws/vault/:vault/files").map((c) => c.status)).toEqual([201, 200]);
  });
  it("listVaultFiles reads ALL pages: 130 files at 50 a page is 3 requests; 250 at the default 200 is 2; every file once", async () => {
    const ann = await w.as(w.ann);
    for (let i = 0; i < 250; i++) w.fake.seedFile(w.annV, { name: `p${String(i).padStart(3, "0")}.jpg`, bytes: bytes(2, i), mediaType: "image/jpeg" });
    const all = await listVaultFiles(w.annV.id, { origin: VAULT_ORIGIN, send: ann.send });
    expect(all).toHaveLength(250);
    expect(new Set(all.map((f) => f.entity)).size).toBe(250);
    const q = w.fake.calls.of("GET /lws/vault/:vault/files").map((c) => c.query);
    expect(q.map((x) => [x.limit![0], x.offset![0]])).toEqual([["200", "0"], ["200", "200"]]);
    w.fake.calls.clear();
    const small = await listVaultFiles(w.annV.id, { origin: VAULT_ORIGIN, send: ann.send, pageSize: 50, maxPages: 100 });
    expect(small).toHaveLength(250);
    expect(w.fake.calls.of("GET /lws/vault/:vault/files").map((c) => c.query.offset![0])).toEqual(["0", "50", "100", "150", "200"]);
  });
  it("listVaultFiles with the transcodedFrom filter lists the copies of one master", async () => {
    const ann = await w.as(w.ann);
    const { master, thumb } = w.fake.seedPicture(w.annV, { name: "a", master: bytes(30, 1), thumb: bytes(5, 2) });
    w.fake.seedPicture(w.annV, { name: "b", master: bytes(30, 3), thumb: bytes(5, 4) });
    const copies = await listVaultFiles(w.annV.id, { origin: VAULT_ORIGIN, send: ann.send, transcodedFrom: `https://ann.fake.test/vault/e/${master.id}` });
    expect(copies.map((f) => f.entity)).toEqual([`https://ann.fake.test/vault/e/${thumb.id}`]);
  });
  it("a reader lists; a stranger's list is a PictureFilesError 403 carrying the platform's sentence", async () => {
    w.fake.seedFile(w.annV, { name: "a.jpg", bytes: bytes(3) });
    w.fake.grant(w.annV, w.ben, "read");
    expect(await listVaultFiles(w.annV.id, { origin: VAULT_ORIGIN, send: (await w.as(w.ben)).send })).toHaveLength(1);
    const err = await listVaultFiles(w.annV.id, { origin: VAULT_ORIGIN, send: (await w.as(w.cat)).send }).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(PictureFilesError);
    expect(err).toMatchObject({ status: 403 });
    expect((err as Error).message).toBe(`vault target denied: the principal holds no read reach on vault ${w.annV.id}`);
  });
  it("endFile ends the file (204); the live listing drops it and its bytes still serve", async () => {
    const ann = await w.as(w.ann);
    const f = w.fake.seedFile(w.annV, { name: "a.jpg", bytes: bytes(3), mediaType: "image/jpeg" });
    await endFile(`https://ann.fake.test/vault/e/${f.id}`, { origin: VAULT_ORIGIN, send: ann.send });
    expect(await listVaultFiles(w.annV.id, { origin: VAULT_ORIGIN, send: ann.send })).toEqual([]);
    expect((await ann.fetch(`${VAULT_ORIGIN}/files/${f.id}`)).status).toBe(200);
  });
  it("endFile by a reader is a 403 PictureFilesError; endPictureFiles reports it per file", async () => {
    const m = w.fake.seedPicture(w.annV, { name: "a", master: bytes(9, 1), thumb: bytes(3, 2) });
    w.fake.grant(w.annV, w.ben, "read");
    const send = (await w.as(w.ben)).send;
    await expect(endFile(`https://ann.fake.test/vault/e/${m.master.id}`, { origin: VAULT_ORIGIN, send })).rejects.toMatchObject({ status: 403 });
    const failed = await endPictureFiles(`https://ann.fake.test/vault/e/${m.master.id}`, [`https://ann.fake.test/vault/e/${m.thumb.id}`], { origin: VAULT_ORIGIN, send });
    expect(failed).toHaveLength(2);
  });
  it("endFile aimed at the platform origin instead of the vault's origin is refused by the client before any request (picture-set 0.1.4); the file is NOT ended", async () => {
    const ann = await w.as(w.ann);
    const f = w.fake.seedFile(w.annV, { name: "a.jpg", bytes: bytes(3) });
    const before = w.fake.calls.count();
    await expect(endFile(`https://ann.fake.test/vault/e/${f.id}`, { origin: w.fake.origin, send: ann.send })).rejects.toBeInstanceOf(PictureFilesError);
    expect(w.fake.calls.count()).toBe(before);
    expect(w.fake.state.files.get(f.id)!.endedSeq).toBeNull();
  });
  it("an empty folder in the UploadTarget is not sent (picture-upload 0.2.1): the upload is filed nowhere and succeeds", async () => {
    signAs(await w.as(w.ann));
    await uploadPicture(new Blob([bytes(5)], { type: "image/jpeg" }), "a.jpg", target(""));
    const put = w.fake.calls.last()!;
    expect(put.status).toBe(201);
    expect(put.url).not.toContain("folder=");
  });
  it("a reader's upload is picture-upload's NoAccessError path (403), a stranger the same", async () => {
    w.fake.grant(w.annV, w.ben, "read");
    signAs(await w.as(w.ben));
    await expect(uploadPicture(new Blob([bytes(5)], { type: "image/jpeg" }), "a.jpg", target())).rejects.toMatchObject({ name: expect.stringMatching(/NoAccess/) });
  });
});

describe("vault-access against the fake", () => {
  it("shareVault edit: write (and the planted read) land; the client reads the access list and finds both; the grantee can then upload", async () => {
    signAs(await w.as(w.ann));
    await shareVault(w.annV.id, w.ben.principal, "edit");
    expect([...w.fake.state.grants.get(w.annV.id)!.get(w.ben.principal)!].sort()).toEqual(["read", "write"]);
    expect(w.fake.calls.of("POST /base/authz/grant-vault")[0]!.status).toBe(201);
    expect(w.fake.calls.of("GET /base/consent/vault-acl")[0]!.status).toBe(200);
    signAs(await w.as(w.ben));
    expect((await w.fake.fetch(`${VAULT_ORIGIN}/lws/vaults`, { headers: await (await w.as(w.ben)).headers("GET", `${VAULT_ORIGIN}/lws/vaults`) })).status).toBe(200);
  });
  it("shareVault with a vault address: the platform resolves it to the holder's principal and the client accepts the resolved echo", async () => {
    signAs(await w.as(w.ann));
    await shareVault(w.annV.id, "https://ben.fake.test/vault", "edit");
    expect(w.fake.state.grants.get(w.annV.id)!.get(w.ben.principal)).toBeDefined();
  });
  it("shareVault view grants read only", async () => {
    signAs(await w.as(w.ann));
    await shareVault(w.annV.id, w.cat.principal, "view");
    expect([...w.fake.state.grants.get(w.annV.id)!.get(w.cat.principal)!]).toEqual(["read"]);
  });
  it("unshareVault revokes write, read and append: the person has no reach left, and a 200 that revoked nothing is fine", async () => {
    const ann = await w.as(w.ann);
    signAs(ann);
    await shareVault(w.annV.id, w.ben.principal, "edit");
    await unshareVault(w.annV.id, w.ben.principal);
    expect(w.fake.state.grants.get(w.annV.id)?.has(w.ben.principal) ?? false).toBe(false);
    expect(w.fake.calls.of("POST /base/authz/revoke-vault").map((c) => (c.body as { mode: string }).mode)).toEqual(["write", "read", "append"]);
    expect((await (await w.as(w.ben)).fetch(`${VAULT_ORIGIN}/lws/vault/${encodeURIComponent(w.annV.id)}/files`)).status).toBe(403);
  });
  it("revokeVaultAccess of write alone leaves the read", async () => {
    signAs(await w.as(w.ann));
    await grantVaultAccess(w.annV.id, w.ben.principal, "write");
    await revokeVaultAccess(w.annV.id, w.ben.principal, "write");
    expect([...w.fake.state.grants.get(w.annV.id)!.get(w.ben.principal)!]).toEqual(["read"]);
  });
  it("fetchVaultAcl: { controlled:true, note, acl, edges } for the owner, with the entries normalised; { controlled:false } for anyone without Control", async () => {
    w.fake.grant(w.annV, w.ben, "write");
    signAs(await w.as(w.ann));
    const acl = await fetchVaultAcl(w.annV.id);
    expect(acl.controlled).toBe(true);
    if (acl.controlled) {
      expect(acl.note).toMatch(/^Whole-vault grants/);
      expect(acl.edges).toEqual([]);
      expect(acl.acl.find((e) => e.principal === w.ben.principal)).toMatchObject({ levels: ["read", "write"], kind: "grant", label: null, webId: null });
      expect(acl.acl.find((e) => e.principal === w.ann.principal)).toMatchObject({ levels: ["read", "write", "control"], kind: "grant" });
    }
    signAs(await w.as(w.ben));
    expect(await fetchVaultAcl(w.annV.id)).toEqual({ controlled: false });
  });
  it("a grant by someone without Control is a VaultAccessError 403 with the client's sentence", async () => {
    w.fake.grant(w.annV, w.ben, "write");
    signAs(await w.as(w.ben));
    const err = await grantVaultAccess(w.annV.id, w.cat.principal, "read").then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(VaultAccessError);
    expect(err).toMatchObject({ status: 403, message: "You don't hold Control on this vault, so you can't change who can access it." });
  });
  it("CLIENT DISAGREES WITH THE PLATFORM (reported, not copied): a bare host that names a vault. The client refuses before sending (400, no request); the platform resolves it and answers 201", async () => {
    const ann = await w.as(w.ann);
    signAs(ann);
    const err = await grantVaultAccess(w.annV.id, "https://ben.fake.test", "read").then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(VaultAccessError);
    expect(w.fake.calls.of("POST /base/authz/grant-vault")).toHaveLength(0);
    const platform = await ann.fetch("https://ann.fake.test/base/authz/grant-vault", { method: "POST", body: JSON.stringify({ vault: w.annV.id, grantee: "https://ben.fake.test", mode: "read" }) });
    expect(platform.status).toBe(201);
    expect((await platform.json()).grantee).toBe(w.ben.principal);
  });
  it("a bare host that names no vault: the client's refusal and the platform's 400 agree on the outcome", async () => {
    const ann = await w.as(w.ann);
    signAs(ann);
    await expect(shareVault(w.annV.id, "https://nobody.fake.test", "view")).rejects.toMatchObject({ status: 400 });
    const platform = await ann.fetch("https://ann.fake.test/base/authz/grant-vault", { method: "POST", body: JSON.stringify({ vault: w.annV.id, grantee: "https://nobody.fake.test", mode: "read" }) });
    expect(platform.status).toBe(400);
  });
  it("a short WebID (/i) the platform resolves to a person: shareVault edit sends it, the echo is the principal, the client accepts it", async () => {
    signAs(await w.as(w.ann));
    await shareVault(w.annV.id, "https://ben.fake.test/i", "edit");
    expect(w.fake.state.grants.get(w.annV.id)!.get(w.ben.principal)).toBeDefined();
  });
});
