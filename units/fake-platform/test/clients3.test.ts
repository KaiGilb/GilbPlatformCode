// Part 3 against the real signin unit, end to end: request a code, verify it, check a name, make the vault, list it, and write a record in it through
// lws-records with the session the signin unit holds. No hand-made headers anywhere: the credential signs with its own key.
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { RecordForbiddenError, createRecord, readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { CodeRejectedError, VaultRequestRefusedError, checkVaultName, createNamedVault, listVaults, prepareVaultName, requestSignInCode } from "@kaigilb/gilbplatformcode-signin";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { world, type World } from "./support";

const PERSON = "https://veda.gilb.com/base/t/Person";
const EMAIL = "new.sailor@example.test";
let w: World;
let transport: World["fake"]["transport"];
let origin: string;
beforeEach(async () => {
  w = await world();
  transport = w.fake.transport as never;
  origin = w.fake.origin;
  setBaseOrigin(origin);
  vi.stubGlobal("fetch", w.fake.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
});

async function signIn(email = EMAIL) {
  const cred = new SessionCredential({ transport: transport as never });
  await requestSignInCode(origin, email, undefined, "Test", { transport: transport as never });
  const answer = await cred.signInWithCode(origin, email, w.fake.pendingCode(email)!);
  return { cred, answer };
}
const lwsAuthFor = (cred: SessionCredential) =>
  setLwsAuth({
    bearerHeaderFor: (url, method) => cred.authHeaders(method ?? "GET", url),
    dpopReadAuth: (m, u) => cred.authHeaders(m, u),
    dpopWriteAuth: (m, u) => cred.authHeaders(m, u),
    invalidateDpop: () => cred.invalidate(),
    tokenManager: { getSession: async () => (await cred.getSession()) as never, invalidate: () => cred.invalidate() },
  });

describe("the real signin unit against the fake, end to end", () => {
  it("new person: code, verify, check-name, create-named, list, then a record written in the new vault through lws-records", async () => {
    const t = { transport: transport as never };
    const prep = await prepareVaultName(origin, EMAIL, t);
    expect(prep).toEqual({ isReturning: false, suggestedName: "newsailor", webIdDomain: "fake.test", address: "https://newsailor.fake.test/vault" });
    const { cred, answer } = await signIn();
    expect(answer.needsVaultName).toBe(true);
    expect(cred.session).toMatchObject({ vaults: [] });

    const check = await checkVaultName(origin, "My-Boat", t);
    expect(check).toEqual({ available: true, reserved: false, name: "myboat", requested: "My-Boat", address: "https://myboat.fake.test/vault", message: undefined, suggestion: undefined, normalized: true, note: "'My-Boat' is saved as 'myboat': a vault name keeps only a–z and 0–9." });

    const made = await createNamedVault(origin, { name: "My-Boat", represents: PERSON }, { credential: cred, ...t });
    expect(made).toMatchObject({ complete: true, name: "myboat", vaultId: "https://myboat.fake.test/vault", represents: PERSON });
    expect(made.vault).toBe(w.fake.state.vaults.get(made.vaultId)!.entity);

    const vaults = await listVaults(origin, { credential: cred, ...t });
    expect(vaults).toEqual([{ vaultId: "https://myboat.fake.test/vault", modes: ["read", "write"], isLandingVault: true, name: "myboat", represents: PERSON, entity: made.vault }]);

    lwsAuthFor(cred);
    const rec = await createRecord(vaults[0]!.vaultId, "t:Sailboat", { name: "Heron" });
    expect(rec.entity).toBe(`https://myboat.fake.test/vault/e/${rec.id}`);
    const back = await readRecord(rec.id, rec.entity!);
    expect(back!.facts).toMatchObject({ name: "Heron" });
    expect(w.fake.state.records.get(rec.id)!.vaultId).toBe(vaults[0]!.vaultId);
    expect(w.fake.violations).toEqual([]);
    expect(w.fake.calls.all.filter((c) => c.path.startsWith("/lws") || c.path.startsWith("/base/vault")).every((c) => c.proof.ok)).toBe(true);
  });
  it("sign-in with a name in one step: verify-code mints the vault and the session lists it as the landing vault", async () => {
    const cred = new SessionCredential({ transport: transport as never });
    await requestSignInCode(origin, EMAIL, undefined, "Test", { transport: transport as never });
    const answer = (await cred.signInWithCode(origin, EMAIL, w.fake.pendingCode(EMAIL)!, "Club-House")) as { needsVaultName: boolean; vaultName?: string };
    expect(answer.needsVaultName).toBe(false);
    expect(answer.vaultName).toBe("clubhouse");
    expect(cred.session!.vaults).toEqual([{ vaultId: "https://clubhouse.fake.test/vault", modes: ["read", "write"] }]);
  });
  it("a returning person: name-prep says so, sign-in lists the vault, no name is asked for", async () => {
    const t = { transport: transport as never };
    expect(await prepareVaultName(origin, w.ann.email, t)).toEqual({ isReturning: true, webIdDomain: "fake.test", suggestedName: undefined, address: undefined });
    const { cred, answer } = await signIn(w.ann.email);
    expect(answer.needsVaultName).toBe(false);
    expect(cred.session!.vaults.map((v) => v.vaultId)).toEqual([w.annV.id]);
  });
  it("a wrong code and a used code are CodeRejectedError", async () => {
    const cred = new SessionCredential({ transport: transport as never });
    await requestSignInCode(origin, EMAIL, undefined, "Test", { transport: transport as never });
    await expect(cred.signInWithCode(origin, EMAIL, "999999")).rejects.toBeInstanceOf(CodeRejectedError);
    await cred.signInWithCode(origin, EMAIL, w.fake.pendingCode(EMAIL)!);
    await expect(new SessionCredential({ transport: transport as never }).signInWithCode(origin, EMAIL, "000000")).rejects.toBeInstanceOf(CodeRejectedError);
  });
  it("an expired code is CodeRejectedError", async () => {
    await requestSignInCode(origin, EMAIL, undefined, "Test", { transport: transport as never });
    w.clock.ms += 11 * 60 * 1000;
    await expect(new SessionCredential({ transport: transport as never }).signInWithCode(origin, EMAIL, "000000")).rejects.toBeInstanceOf(CodeRejectedError);
  });
  it("the 202 path: createNamedVault answers complete:false, the vault is not listed; the same request again is complete:true and listed", async () => {
    const t = { transport: transport as never };
    const { cred } = await signIn();
    w.fake.partialNextCreateNamed();
    const partial = await createNamedVault(origin, { name: "club", represents: PERSON }, { credential: cred, ...t });
    expect(partial).toMatchObject({ complete: false, name: "club", vaultId: "https://club.fake.test/vault" });
    expect(await listVaults(origin, { credential: cred, ...t })).toEqual([]);
    const done = await createNamedVault(origin, { name: "club", represents: PERSON }, { credential: cred, ...t });
    expect(done).toMatchObject({ complete: true, name: "club", represents: PERSON });
    expect((await listVaults(origin, { credential: cred, ...t })).map((v) => v.name)).toEqual(["club"]);
  });
  it("a taken name is a VaultRequestRefusedError 409 carrying the platform's sentence; a reserved one the same status", async () => {
    const t = { transport: transport as never };
    const { cred } = await signIn();
    const err = await createNamedVault(origin, { name: "ann", represents: PERSON }, { credential: cred, ...t }).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(VaultRequestRefusedError);
    expect(err).toMatchObject({ status: 409 });
    expect((err as VaultRequestRefusedError).platformMessage).toMatch(/^REFUSED: the name 'ann' on 'fake\.test' is already held\./);
    await expect(createNamedVault(origin, { name: "kaizen", represents: PERSON }, { credential: cred, ...t })).rejects.toMatchObject({ status: 409 });
  });
  it("createNamedVault refuses an empty represents before any request; the platform's own sentence comes from a raw call", async () => {
    const { cred } = await signIn();
    const before = w.fake.calls.count();
    await expect(createNamedVault(origin, { name: "x", represents: "" }, { credential: cred, transport: transport as never })).rejects.toThrow(/represents/);
    expect(w.fake.calls.count()).toBe(before);
  });
  it("listVaults keeps the vault's entity URI (signin 0.2.5); a vaultId as parent is 400; the sign-up landing vault's entity as parent is 403 (not minted by the caller); a vault the caller minted is a parent", async () => {
    const t = { transport: transport as never };
    const { cred } = await signIn(w.ann.email);
    const [ann] = await listVaults(origin, { credential: cred, ...t });
    expect(ann!.entity).toBe(w.annV.entity);
    const err = await createNamedVault(origin, { name: "child", represents: PERSON, parentVault: ann!.vaultId }, { credential: cred, ...t }).then(() => null, (e: unknown) => e);
    expect(err).toMatchObject({ status: 400 });
    expect((err as VaultRequestRefusedError).platformMessage).toBe(`parentVault is not a known vault entity: ${w.annV.id}`);
    const landing = await createNamedVault(origin, { name: "child", represents: PERSON, parentVault: w.annV.entity }, { credential: cred, ...t }).then(() => null, (e: unknown) => e);
    expect(landing).toMatchObject({ status: 403 });
    expect((landing as VaultRequestRefusedError).platformMessage).toBe(`You do not own parent vault ${w.annV.entity} — nest only under vaults you have minted`);
    const first = await createNamedVault(origin, { name: "first", represents: PERSON }, { credential: cred, ...t });
    const ok = await createNamedVault(origin, { name: "child", represents: PERSON, parentVault: first.vault }, { credential: cred, ...t });
    expect(ok.parent).toBe(first.vault);
  });
  it("checkVaultName keeps the platform's `normalized` and `note` (signin 0.2.4), so the card can show 'saved as ...' from the platform's own sentence", async () => {
    const raw = await (await w.fake.fetch(`${origin}/onboard/api/check-name`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "zz-eespeed-r5-probe" }) })).json();
    expect(raw).toMatchObject({ normalized: true, note: expect.stringContaining("is saved as 'zzeespeedr5probe'") });
    const viaClient = await checkVaultName(origin, "zz-eespeed-r5-probe", { transport: transport as never });
    expect(viaClient).toMatchObject({ name: "zzeespeedr5probe", requested: "zz-eespeed-r5-probe", normalized: true, note: raw.note });
  });
  it("a record write by someone with no reach is lws-records' RecordForbiddenError (the new person cannot write in ann's vault)", async () => {
    const { cred } = await signIn();
    lwsAuthFor(cred);
    await expect(createRecord(w.annV.id, "t:Sailboat", { name: "x" })).rejects.toBeInstanceOf(RecordForbiddenError);
  });
});
