import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetBaseOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { NotSignedInError, resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";

const platform = await import("./platform");
const { findMyVault, VaultNotReachableError, CredentialExpiredError } = platform;

const PIN = "https://testappvaultaccess.gilb.com/vault";
type Row = Record<string, unknown>;
const row = (vaultId: string, modes: string[], over: Row = {}): Row => ({ "@id": `${vaultId}/e/seat`, vaultId, modes, ...over });

function serve(rows: Row[] | Response) {
  vi.stubGlobal("fetch", vi.fn(async () => (rows instanceof Response ? rows : Response.json({ total: rows.length, vaults: rows }))));
}

beforeEach(() => {
  setBaseOrigin("https://gilb.com");
  setSystemVaultHosts(["id.gilb.com"]);
  const a = { authorization: "DPoP t", dpop: "p" };
  setLwsAuth({ bearerHeaderFor: async () => a, dpopReadAuth: async () => a, dpopWriteAuth: async () => a, invalidateDpop() {}, tokenManager: { getSession: async () => ({ principal: "p", vault: null, vaults: [] }), invalidate() {} } });
});
afterEach(() => { vi.unstubAllGlobals(); resetLwsAuth(); resetBaseOrigin(); resetSystemVaultHosts(); });

test("4.2: a pinned URL returns exactly the row that matches, not the landing vault", async () => {
  serve([row("https://landing.gilb.com/vault", ["read", "write"], { isLandingVault: true }), row(PIN, ["read", "write"])]);
  const v = await findMyVault("https://testappvaultaccess.gilb.com/vault");
  expect(v!.recordsVault!.vaultId).toBe(PIN);
});

test("4.2: a trailing slash on either side still matches", async () => {
  const decoy = row("https://landing.gilb.com/vault", ["read", "write"], { isLandingVault: true });
  serve([decoy, row(PIN, ["read", "write"])]);
  expect((await findMyVault("https://testappvaultaccess.gilb.com/vault/"))!.recordsVault!.vaultId).toBe(PIN);
  serve([decoy, row(`${PIN}/`, ["read", "write"])]);
  expect((await findMyVault("https://testappvaultaccess.gilb.com/vault"))!.recordsVault!.vaultId).toBe(`${PIN}/`);
});

test("4.2: no matching row throws VaultNotReachableError naming the URL, and never falls back to the landing vault", async () => {
  serve([row("https://landing.gilb.com/vault", ["read", "write"], { isLandingVault: true })]);
  const err = await findMyVault("https://testappvaultaccess.gilb.com/vault").catch((e) => e);
  expect(err).toBeInstanceOf(VaultNotReachableError);
  expect(err.message).toContain("https://testappvaultaccess.gilb.com/vault");
});

test("4.2: a read-only match throws the same error naming the modes", async () => {
  serve([row(PIN, ["read"])]);
  const err = await findMyVault("https://testappvaultaccess.gilb.com/vault").catch((e) => e);
  expect(err).toBeInstanceOf(VaultNotReachableError);
  expect(err.message).toContain("read");
  expect(err.message).toContain("write");
});

test("4.2: with no pin the landing vault is taken as before", async () => {
  serve([row("https://other.gilb.com/vault", ["read", "write"]), row("https://landing.gilb.com/vault", ["read", "write"], { isLandingVault: true })]);
  expect((await findMyVault(undefined))!.recordsVault!.vaultId).toBe("https://landing.gilb.com/vault");
});

test("4.5: the vault carries how many vaults the credential reaches and its real modes; the row's @id is its entity", async () => {
  serve([row(PIN, ["read", "write"]), row("https://x.gilb.com/vault", ["read"])]);
  const v = (await findMyVault(PIN))!;
  expect(v.recordsVault).toMatchObject({ reachCount: 2, modes: ["read", "write"], entity: `${PIN}/e/seat` });
});

test("4.5: zero vaults says identity is not proven", async () => {
  serve([]);
  await expect(findMyVault(undefined)).rejects.toThrow("Signed in, but this credential reaches no vault: identity not proven.");
});

test("4.5: a 401 whose body names expiry is 'expired', apart from a plain 'not signed in'", async () => {
  serve(new Response('{"error":"Unauthorized","message":"Access token expired"}', { status: 401 }));
  const expired = await findMyVault(undefined).catch((e) => e);
  expect(expired).toBeInstanceOf(CredentialExpiredError);
  expect(expired.message).toContain("expired");
  serve(new Response('{"error":"Unauthorized","message":"Missing or invalid DPoP proof"}', { status: 401 }));
  const plain = await findMyVault(undefined).catch((e) => e);
  expect(plain).toBeInstanceOf(NotSignedInError);
  expect(plain).not.toBeInstanceOf(CredentialExpiredError);
});

test("B10 W1: the landing vault is not the pinned one: records go to the pinned vault, the profile to the landing vault", async () => {
  const LAND = "https://landing.gilb.com/vault";
  serve([row(PIN, ["read", "write"]), row(LAND, ["read", "write"], { isLandingVault: true })]);
  const v = (await findMyVault(PIN))!;
  expect(v.recordsVault!.vaultId).toBe(PIN);
  expect(v.profileVault!.vaultId).toBe(LAND);
  expect(v.profileVault).toMatchObject({ reachCount: 2, modes: ["read", "write"], entity: `${LAND}/e/seat` });
});

test("B10 W1: when no row is flagged landing, profileVault is null: not the pinned vault, not rows[0]", async () => {
  serve([row("https://first.gilb.com/vault", ["read", "write"]), row(PIN, ["read", "write"])]);
  const v = (await findMyVault(PIN))!;
  expect(v.recordsVault!.vaultId).toBe(PIN);
  expect(v.profileVault).toBeNull();
});

test("B10 W1: a landing vault that is not read-capable is not the profile vault", async () => {
  serve([row(PIN, ["read", "write"]), row("https://landing.gilb.com/vault", [], { isLandingVault: true })]);
  expect((await findMyVault(PIN))!.profileVault).toBeNull();
});

test("B10 W1: with no pin and a read-only landing vault, records are null and the profile is the landing vault", async () => {
  serve([row("https://landing.gilb.com/vault", ["read"], { isLandingVault: true })]);
  const v = (await findMyVault(undefined))!;
  expect(v.recordsVault).toBeNull();
  expect(v.profileVault!.vaultId).toBe("https://landing.gilb.com/vault");
});
