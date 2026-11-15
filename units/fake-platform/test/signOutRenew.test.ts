// Rows 30 (POST /base/auth/sign-out) and 31 (POST /base/auth/email/renew), and the `renew` / `renewWindowSec` keys of verify-code (row 2).
import { dpopHeaders, dpopProof, generateDpopKeyPair, type DpopKey } from "@kaigilb/gilbplatformcode-signin";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { describe, expect, it } from "vitest";
import { jsonOfB64url } from "../src/bytes";
import { body, world, type World } from "./support";

const O = "https://fake.test";
const DAY = 24 * 3600;
const post = (w: World, path: string, b: unknown, h: Record<string, string> = {}) => w.fake.fetch(`${O}${path}`, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) });

async function signIn(w: World, extra: Record<string, unknown> = {}, email = "ann@example.test") {
  const key = await generateDpopKeyPair();
  await post(w, "/base/auth/email/request-code", { email });
  const res = await post(w, "/base/auth/email/verify-code", { email, code: w.fake.pendingCode(email)!, dpopJwk: key.publicJwk, ...extra });
  return { res, key, answer: res.status === 200 ? await body(res) : null };
}
const signedPost = async (w: World, key: DpopKey, token: string, path: string) => w.fake.fetch(`${O}${path}`, { method: "POST", headers: await dpopHeaders(key, token, "POST", `${O}${path}`) });
const renewCall = async (w: World, key: DpopKey, credential: string, withProof = true) =>
  w.fake.fetch(`${O}/base/auth/email/renew`, { method: "POST", headers: { "content-type": "application/json", ...(withProof ? { dpop: await dpopProof(key, "POST", `${O}/base/auth/email/renew`) } : {}) }, body: JSON.stringify({ renew: credential }) });
const vaultsWith = async (w: World, key: DpopKey, token: string) => w.fake.fetch(`${O}/lws/vaults`, { headers: await dpopHeaders(key, token, "GET", `${O}/lws/vaults`) });
const expOf = (token: string): number => (jsonOfB64url(token.split(".")[1]!) as { exp: number }).exp;
const iso = (w: World, sec: number) => new Date(w.clock.ms + sec * 1000).toISOString();

describe("verify-code with renew (row 2)", () => {
  it("accepts renew and renewWindowSec; the answer carries renew and renewExpiresAt; without renew it carries neither", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const { answer } = await signIn(w, { renew: true, renewWindowSec: 900 });
    expect(answer.renew).toMatch(/^rsi1\.[^.]+\.[A-Za-z0-9_-]{43}$/);
    expect(answer.renewExpiresAt).toBe(iso(w, 900));
    const plain = await signIn(w, {}, "ben@example.test");
    expect(plain.answer).not.toHaveProperty("renew");
    expect(plain.answer).not.toHaveProperty("renewExpiresAt");
  });
  it("honours the window and caps it at 14 days; absent means 14 days", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    expect((await signIn(w, { renew: true, renewWindowSec: 1000 })).answer.renewExpiresAt).toBe(iso(w, 1000));
    expect((await signIn(w, { renew: true, renewWindowSec: 99 * DAY })).answer.renewExpiresAt).toBe(iso(w, 14 * DAY));
    expect((await signIn(w, { renew: true })).answer.renewExpiresAt).toBe(iso(w, 14 * DAY));
  });
  it("the first token lasts no longer than the window", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const { answer } = await signIn(w, { renew: true, renewWindowSec: 900 });
    expect(expOf(answer.token) - Math.floor(w.clock.ms / 1000)).toBe(900);
    const long = await signIn(w, { renew: true });
    expect(expOf(long.answer.token) - Math.floor(w.clock.ms / 1000)).toBe(7 * DAY);
  });
  it("400 for a window under 300 or a float, BEFORE the code is spent; a wrong type is a schema 400; a window without renew is not judged", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const key = await generateDpopKeyPair();
    await post(w, "/base/auth/email/request-code", { email: "ann@example.test" });
    for (const renewWindowSec of [299, 0, -5]) {
      const res = await post(w, "/base/auth/email/verify-code", { email: "ann@example.test", code: "000000", dpopJwk: key.publicJwk, renew: true, renewWindowSec });
      expect(res.status).toBe(400);
      expect((await body(res)).message).toBe("renewWindowSec must be an integer of at least 300 seconds");
    }
    expect(w.fake.pendingCode("ann@example.test")).toBe("000000"); // not spent
    for (const bad of [{ renew: true, renewWindowSec: 600.5 }, { renew: "yes" }, { renewWindowSec: "600" }]) {
      expect((await post(w, "/base/auth/email/verify-code", { email: "ann@example.test", code: "000000", dpopJwk: key.publicJwk, ...bad })).status).toBe(400);
    }
    const ok = await post(w, "/base/auth/email/verify-code", { email: "ann@example.test", code: "000000", dpopJwk: key.publicJwk, renewWindowSec: 10 });
    expect(ok.status).toBe(200);
    expect(await body(ok)).not.toHaveProperty("renew");
  });
  it("renew rides on every answer shape (new person with a name)", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const { answer } = await signIn(w, { renew: true, name: "dora" }, "dora@example.test");
    expect(answer).toMatchObject({ needsVaultName: false, vaultName: "dora" });
    expect(answer.renew).toBeTruthy();
  });
});

describe("POST /base/auth/email/renew (row 31)", () => {
  it("rotates: a new token that works, a new credential, the old credential is spent", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const { key, answer } = await signIn(w, { renew: true, renewWindowSec: 900 });
    w.clock.ms += 800_000;
    const res = await renewCall(w, key, answer.renew);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const next = await body(res);
    expect(Object.keys(next).sort()).toEqual(["principal", "renew", "renewExpiresAt", "token"]);
    expect(next.renew).not.toBe(answer.renew);
    expect(next.renewExpiresAt).toBe(iso(w, 900)); // the window counts from last use
    expect((await vaultsWith(w, key, next.token)).status).toBe(200);
  });
  it("the window counts from last use: renew at 800 s, again 800 s later, works; 1000 s after the last use does not", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const { key, answer } = await signIn(w, { renew: true, renewWindowSec: 900 });
    w.clock.ms += 800_000;
    const a = await body(await renewCall(w, key, answer.renew));
    w.clock.ms += 800_000;
    const b = await renewCall(w, key, a.renew);
    expect(b.status).toBe(200);
    w.clock.ms += 1_000_000;
    expect((await renewCall(w, key, (await body(b)).renew)).status).toBe(401);
  });
  it("the renewed token lasts at most the new window (from this use)", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const { key, answer } = await signIn(w, { renew: true, renewWindowSec: 600 });
    w.clock.ms += 100_000;
    const next = await body(await renewCall(w, key, answer.renew));
    expect(expOf(next.token) - Math.floor(w.clock.ms / 1000)).toBe(600);
  });
  it("one 401 body for every refusal: no proof, another key, an unknown family, a garbled credential, an old secret, a proof with ath", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const { key, answer } = await signIn(w, { renew: true });
    const other = await generateDpopKeyPair();
    const refusals = [
      await renewCall(w, key, answer.renew, false),
      await renewCall(w, other, answer.renew),
      await renewCall(w, key, "rsi1.nope.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
      await renewCall(w, key, "garbage"),
      await w.fake.fetch(`${O}/base/auth/email/renew`, { method: "POST", headers: { dpop: await dpopProof(key, "POST", `${O}/base/auth/email/renew`, answer.token) }, body: JSON.stringify({ renew: answer.renew }) }),
    ];
    for (const r of refusals) {
      expect(r.status).toBe(401);
      expect(await body(r)).toEqual({ error: "Unauthorized", message: "renewal refused" });
    }
    expect((await renewCall(w, key, answer.renew)).status).toBe(200); // none of those spent it
  });
  it("presenting an old secret is reuse: the family ends and every token on that key is refused", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const { key, answer } = await signIn(w, { renew: true });
    const next = await body(await renewCall(w, key, answer.renew));
    expect((await renewCall(w, key, answer.renew)).status).toBe(401);
    expect((await vaultsWith(w, key, next.token)).status).toBe(401);
    expect((await renewCall(w, key, next.renew)).status).toBe(401);
  });
  it("a credential past its window is refused", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const { key, answer } = await signIn(w, { renew: true, renewWindowSec: 300 });
    w.clock.ms += 301_000;
    expect((await renewCall(w, key, answer.renew)).status).toBe(401);
  });
});

describe("POST /base/auth/sign-out (row 30)", () => {
  it("204 with no-store; the token then gets 401 and so does every other token on the key", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const { key, answer } = await signIn(w, { renew: true });
    expect((await vaultsWith(w, key, answer.token)).status).toBe(200);
    const res = await signedPost(w, key, answer.token, "/base/auth/sign-out");
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const after = await vaultsWith(w, key, answer.token);
    expect(after.status).toBe(401);
    expect((await body(after)).message).toBe("Invalid access token: this sign-in has ended");
  });
  it("ends the renewable family: renew is refused afterwards", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const { key, answer } = await signIn(w, { renew: true, renewWindowSec: 900 });
    await signedPost(w, key, answer.token, "/base/auth/sign-out");
    expect((await renewCall(w, key, answer.renew)).status).toBe(401);
  });
  it("another key's sign-in (same person) is not touched", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const a = await signIn(w, { renew: true });
    const b = await signIn(w, { renew: true });
    await signedPost(w, a.key, a.answer.token, "/base/auth/sign-out");
    expect((await vaultsWith(w, b.key, b.answer.token)).status).toBe(200);
    expect((await renewCall(w, b.key, b.answer.renew)).status).toBe(200);
  });
  it("401 with no credential; 400 for a token with no device key (signInAs without a jwk)", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    expect((await post(w, "/base/auth/sign-out", {})).status).toBe(401);
    const ann = await w.as(w.ann);
    const unbound = w.fake.signInAs(w.ann);
    const key = await generateDpopKeyPair();
    const res = await w.fake.fetch(`${O}/base/auth/sign-out`, { method: "POST", headers: await dpopHeaders(key, unbound.token, "POST", `${O}/base/auth/sign-out`) });
    expect(res.status).toBe(400);
    expect((await body(res)).message).toContain("no cnf.jkt");
    expect(ann.token).toBeTruthy();
  });
  it("reset() forgets the families", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    await signIn(w, { renew: true });
    expect(w.fake.state.renewals.size).toBe(1);
    w.fake.reset();
    expect(w.fake.state.renewals.size).toBe(0);
  });
});

describe("the real SessionCredential.signOut against the fake", () => {
  it("returns serverSignedOut true on the fake's 204 and the token it held is refused after", async () => {
    const w = await world({ proofWindowSeconds: 1e9 });
    const cred = new SessionCredential({ transport: w.fake.transport as never });
    await post(w, "/base/auth/email/request-code", { email: "ann@example.test" });
    await cred.signInWithCode(O, "ann@example.test", w.fake.pendingCode("ann@example.test")!);
    const held = (await cred.authHeaders("GET", `${O}/lws/vaults`)).Authorization!.replace(/^DPoP /, "");
    expect(await cred.signOut(O)).toEqual({ serverSignedOut: true });
    expect(w.fake.calls.last("POST /base/auth/sign-out")!.status).toBe(204);
    const stale = await w.fake.fetch(`${O}/lws/vaults`, { headers: { authorization: `DPoP ${held}`, dpop: "x.y.z" } });
    expect(stale.status).toBe(401);
  });
});
