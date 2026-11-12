// EESpeed round 7, batch 1, against the fake as the platform: the signin `makeSignInAuth` and `shortName`, the bridge's `configureLiveApp`,
// and picture-set's copy map, `storePictureSet` and `copiesToEnd`. Integration tests live here, not in those units, because this unit
// already takes them as dev-dependencies (a dev-dependency back would be a cycle).
import { baseOrigin, resetBaseOrigin, resetSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { configureLiveApp, resetLwsAuth, signedSend } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { copiesOf, copiesToEnd, endPictureFiles, largestUriOf, loadCopyMap, storePictureSet, thumbUriOf } from "@kaigilb/gilbplatformcode-picture-set";
import { CodeRejectedError, listVaults } from "@kaigilb/gilbplatformcode-signin";
import { makeSignInAuth } from "@kaigilb/gilbplatformcode-signin/session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { world, type World } from "./support";

const EMAIL = "new.sailor@example.test";
const VAULT_ORIGIN = "https://ann.fake.test";
const bytes = (n: number, seed = 1): Uint8Array<ArrayBuffer> => {
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = (i * 7 + seed) % 251;
  return u;
};

let w: World;
beforeEach(async () => {
  w = await world();
  vi.stubGlobal("fetch", w.fake.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
});

/** A live app set up the way an app does it: one call, the fake as the platform and as the identity host. */
function liveApp() {
  return configureLiveApp({ platformOrigin: w.fake.origin, idOrigin: w.fake.origin, credentialOptions: { transport: w.fake.transport as never, store: false } });
}

describe("makeSignInAuth + configureLiveApp against the fake", () => {
  it("a new person: requestCode, verifyCode (needs a name), prepareName, checkName, then the vault is made and the session holds it", async () => {
    const { credential, idOrigin } = liveApp();
    expect(baseOrigin()).toBe(w.fake.origin);
    const auth = makeSignInAuth({ credential, origin: idOrigin, productName: "Test", transport: w.fake.transport as never });
    await auth.requestCode(EMAIL);
    expect(w.fake.calls.of("POST /base/auth/email/request-code")).toHaveLength(1);
    expect(await auth.prepareName(EMAIL)).toMatchObject({ isReturning: false, suggestedName: "newsailor" });
    const out = await auth.verifyCode(EMAIL, w.fake.pendingCode(EMAIL)!);
    expect(out.needsVaultName).toBe(true);
    expect(credential.session).not.toBeNull();
    expect((await auth.checkName("My-Boat")).name).toBe("myboat");
    await expect(auth.completeNamedVault("myboat")).rejects.toThrow("Creating a new vault is not part of Test.");
    expect(w.fake.violations).toEqual([]);
  });

  it("createsVault: the name goes with verifyCode and completeNamedVault just resolves", async () => {
    const { credential, idOrigin } = liveApp();
    const auth = makeSignInAuth({ credential, origin: idOrigin, productName: "Test", transport: w.fake.transport as never, createsVault: true });
    await auth.requestCode(EMAIL);
    const out = await auth.verifyCode(EMAIL, w.fake.pendingCode(EMAIL)!, "Club-House");
    expect(out.needsVaultName).toBe(false);
    await expect(auth.completeNamedVault("clubhouse")).resolves.toBeUndefined();
    expect(credential.session!.vaults.map((v) => v.vaultId)).toEqual(["https://clubhouse.fake.test/vault"]);
  });

  it("a wrong code is CodeRejectedError", async () => {
    const { credential, idOrigin } = liveApp();
    const auth = makeSignInAuth({ credential, origin: idOrigin, productName: "Test", transport: w.fake.transport as never });
    await auth.requestCode(EMAIL);
    await expect(auth.verifyCode(EMAIL, "999999")).rejects.toBeInstanceOf(CodeRejectedError);
  });

  it("a returning person: after sign-in the configured seam signs a platform read, and listVaults gives shortName from the platform's podName", async () => {
    const { credential, idOrigin } = liveApp();
    const auth = makeSignInAuth({ credential, origin: idOrigin, productName: "Test", transport: w.fake.transport as never });
    await auth.requestCode(w.ann.email);
    expect((await auth.verifyCode(w.ann.email, w.fake.pendingCode(w.ann.email)!)).needsVaultName).toBe(false);
    const vaults = await listVaults(idOrigin, { credential, transport: w.fake.transport as never });
    expect(vaults).toHaveLength(1);
    expect(vaults[0]).toMatchObject({ vaultId: w.annV.id, name: "ann", shortName: "ann" });
    const res = await signedSend()("GET", `${VAULT_ORIGIN}/lws/vault/${encodeURIComponent(w.annV.id)}/files`);
    expect(res.status).toBe(200);
    expect(w.fake.violations).toEqual([]);
  });

  it("an app that is not signed in cannot sign a read: the seam says so", async () => {
    liveApp();
    await expect(signedSend()("GET", `${VAULT_ORIGIN}/lws/vault/${encodeURIComponent(w.annV.id)}/files`)).rejects.toMatchObject({ name: "NotSignedInError" });
  });

  it("a person who names the vault at sign-in is listed with a shortName", async () => {
    const { credential, idOrigin } = liveApp();
    const auth = makeSignInAuth({ credential, origin: idOrigin, productName: "Test", transport: w.fake.transport as never });
    await auth.requestCode(EMAIL);
    await auth.verifyCode(EMAIL, w.fake.pendingCode(EMAIL)!, "Sea-Dog");
    const [v] = await listVaults(idOrigin, { credential, transport: w.fake.transport as never });
    expect(v).toMatchObject({ name: "seadog", shortName: "seadog" });
  });
});

describe("picture-set copy map, storePictureSet and copiesToEnd against the fake", () => {
  async function signedInAnn() {
    const { credential, idOrigin } = liveApp();
    const auth = makeSignInAuth({ credential, origin: idOrigin, productName: "Test", transport: w.fake.transport as never });
    await auth.requestCode(w.ann.email);
    await auth.verifyCode(w.ann.email, w.fake.pendingCode(w.ann.email)!);
    return signedSend();
  }
  const target = () => ({ vaultOrigin: VAULT_ORIGIN, vaultRoot: w.annV.id, folder: "pictures" });

  it("loadCopyMap lists once; copiesOf, thumbUriOf and largestUriOf read the map", async () => {
    const send = await signedInAnn();
    const { master, thumb } = w.fake.seedPicture(w.annV, { name: "a", master: bytes(300, 1), thumb: bytes(30, 2) });
    w.fake.seedFile(w.annV, { name: "lone.jpg", bytes: bytes(50, 3), mediaType: "image/jpeg" });
    w.fake.calls.clear();
    const map = await loadCopyMap(w.annV.id, { origin: VAULT_ORIGIN, send });
    expect(w.fake.calls.of("GET /lws/vault/:vault/files")).toHaveLength(1);
    const m = `${VAULT_ORIGIN}/vault/e/${master.id}`;
    const t = `${VAULT_ORIGIN}/vault/e/${thumb.id}`;
    expect(copiesOf(map, m).map((c) => c.uri)).toEqual([t]);
    expect(thumbUriOf(map, m)).toBe(t);
    expect(largestUriOf(map, m)).toBe(m);
    expect(thumbUriOf(null, m)).toBeNull();
    expect(w.fake.violations).toEqual([]);
  });

  it("loadCopyMap on a vault the person cannot read warns and answers an empty map", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { credential, idOrigin } = liveApp();
    const auth = makeSignInAuth({ credential, origin: idOrigin, productName: "Test", transport: w.fake.transport as never });
    await auth.requestCode(w.cat.email);
    await auth.verifyCode(w.cat.email, w.fake.pendingCode(w.cat.email)!, "catvault");
    const map = await loadCopyMap(w.annV.id, { origin: VAULT_ORIGIN, send: signedSend() });
    expect(map.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("storePictureSet stores the master and the small copy and links the copy: one PATCH, two PUTs, no warning", async () => {
    await signedInAnn();
    const out = await storePictureSet({ screen: new Blob([bytes(900)], { type: "image/jpeg" }), thumb: new Blob([bytes(90, 2)], { type: "image/jpeg" }) }, target());
    expect(out.warning).toBeNull();
    expect(out.thumb).not.toBeNull();
    expect(out.screenBytes).toBe(900);
    expect(out.thumbBytes).toBe(90);
    expect(w.fake.calls.count("PUT /lws/vault/:vault/files")).toBe(2);
    expect(w.fake.calls.count("PATCH /lws/r/:id")).toBe(1);
    const map = await loadCopyMap(w.annV.id, { origin: VAULT_ORIGIN, send: signedSend() });
    expect(thumbUriOf(map, out.master)).toBe(out.thumb);
    expect(w.fake.violations).toEqual([]);
  });

  it("a thumbnail link that fails once is retried and resumes: still two PUTs, two PATCHes, no warning", async () => {
    await signedInAnn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    w.fake.failNext("PATCH /lws/r/:id", { status: 500 });
    const out = await storePictureSet({ screen: new Blob([bytes(900)], { type: "image/jpeg" }), thumb: new Blob([bytes(90, 2)], { type: "image/jpeg" }) }, target());
    expect(out.warning).toBeNull();
    expect(w.fake.calls.count("PUT /lws/vault/:vault/files")).toBe(2);
    expect(w.fake.calls.count("PATCH /lws/r/:id")).toBe(2);
    const map = await loadCopyMap(w.annV.id, { origin: VAULT_ORIGIN, send: signedSend() });
    expect(thumbUriOf(map, out.master)).toBe(out.thumb);
  });

  it("a link that keeps failing is a warning, and the picture is still stored", async () => {
    await signedInAnn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    w.fake.failNext("PATCH /lws/r/:id", { status: 500, times: 5 });
    const out = await storePictureSet({ screen: new Blob([bytes(900)], { type: "image/jpeg" }), thumb: new Blob([bytes(90, 2)], { type: "image/jpeg" }) }, target());
    expect(out.warning).toMatch(/could not be linked/);
    expect(out.master).toMatch(/\/vault\/e\//);
    expect(w.fake.calls.count("PUT /lws/vault/:vault/files")).toBe(2);
  });

  it("copiesToEnd (by listing with the transcodedFrom filter, and by map) names the thumbnail, and endPictureFiles ends the group", async () => {
    const send = await signedInAnn();
    const out = await storePictureSet({ screen: new Blob([bytes(900)], { type: "image/jpeg" }), thumb: new Blob([bytes(90, 2)], { type: "image/jpeg" }) }, target());
    w.fake.seedPicture(w.annV, { name: "other", master: bytes(80, 5), thumb: bytes(8, 6) });
    w.fake.calls.clear();
    const byListing = await copiesToEnd(out.master, { origin: VAULT_ORIGIN, send, vaultRoot: w.annV.id });
    expect(byListing).toEqual([out.thumb]);
    for (const c of w.fake.calls.of("GET /lws/vault/:vault/files")) expect(c.query.transcodedFrom).toBeDefined();
    const map = await loadCopyMap(w.annV.id, { origin: VAULT_ORIGIN, send });
    expect(await copiesToEnd(out.master, { origin: VAULT_ORIGIN, send, map })).toEqual([out.thumb]);
    const failed = await endPictureFiles(out.master, byListing, { origin: VAULT_ORIGIN, send });
    expect(failed).toEqual([]);
    const left = await loadCopyMap(w.annV.id, { origin: VAULT_ORIGIN, send });
    expect([...left.values()].flat().every((c) => c.uri !== out.master && c.uri !== out.thumb)).toBe(true);
  });
});
