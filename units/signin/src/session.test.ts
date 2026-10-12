// Tests for ./session. Imports the shipped module; no copy of
// its logic here. The transport is a recording fake, so no network is touched.
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  SessionCredential,
  NotSignedInError,
  OriginNotAllowedError,
  readSessionVaults,
  narrowVaultModes,
  tokenExpiresAt,
  EXPIRY_GUARD_MS,
  UNKNOWN_TTL_FALLBACK_MS,
} from "./session";
import { generateDpopKeyPair } from "./core";
import type { Transport, TransportRequest } from "./transport";

const dec = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
const jwtWithExp = (exp: unknown) =>
  `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;

interface Call { url: string; req: TransportRequest }

/** A transport that answers from a queue and records every call. */
function fakeTransport(answers: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const send: Transport = async (url, req) => {
    calls.push({ url, req });
    const a = answers.shift() ?? { status: 500 };
    return { status: a.status, json: async () => a.body };
  };
  return { send, calls };
}

const MINT_URL = "https://id.example.test/base/auth/session/dpop-token";
const okBody = (token = "tok-1", expires_in: number | undefined = 1800) => ({
  access_token: token,
  token_type: "DPoP",
  expires_in,
  cnf: { jkt: "jkt-1" },
  principal: "https://id.example.test/i/p1",
  vault: { entity: "https://v.example.test/base/e/v1", id: "v1", name: "sam" },
  vaults: [{ vaultId: "v1", modes: ["read", "write", "control"] }, { vaultId: "", modes: ["read"] }],
});

test("narrowVaultModes keeps read and write once each and drops other modes", () => {
  assert.deepEqual(narrowVaultModes(["read", "append", "write", "read", "control"]), ["read", "write"]);
  assert.deepEqual(narrowVaultModes(undefined), []);
});

test("readSessionVaults drops an entry with no id", () => {
  assert.deepEqual(readSessionVaults([{ vaultId: "a", modes: ["read"] }, { vaultId: "" }]), [{ vaultId: "a", modes: ["read"] }]);
  assert.deepEqual(readSessionVaults(undefined), []);
});

test("tokenExpiresAt reads exp, and falls back to a short window when it cannot", () => {
  assert.equal(tokenExpiresAt(jwtWithExp(2_000_000_000), 0), 2_000_000_000_000);
  assert.equal(tokenExpiresAt(jwtWithExp("soon"), 1000), 1000 + UNKNOWN_TTL_FALLBACK_MS);
  assert.equal(tokenExpiresAt("not-a-jwt", 1000), 1000 + UNKNOWN_TTL_FALLBACK_MS);
  assert.ok(UNKNOWN_TTL_FALLBACK_MS > EXPIRY_GUARD_MS);
});

test("the bridge mint sends this credential's public key, the CSRF header and the cookie hint", async () => {
  const t = fakeTransport([{ status: 200, body: okBody() }]);
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: t.send });
  const s = await cred.getSession();
  assert.equal(t.calls.length, 1);
  const { url, req } = t.calls[0];
  assert.equal(url, MINT_URL);
  assert.equal(req.method, "POST");
  assert.equal(req.credentials, "include");
  assert.equal(req.headers["X-Base-Csrf"], "1");
  assert.deepEqual(JSON.parse(req.body!).dpopJwk, await cred.ensurePublicJwk());
  assert.equal(s.principal, "https://id.example.test/i/p1");
  assert.deepEqual(s.vaults, [{ vaultId: "v1", modes: ["read", "write"] }]);
  assert.equal(await cred.jkt(), "jkt-1");
});

test("authHeaders signs with the credential's own key, binds the token, and names the request's host", async () => {
  const t = fakeTransport([{ status: 200, body: okBody("tok-abc") }]);
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: t.send });
  const url = "https://sam.example.test/lws/vault/v1/records?limit=1";
  const h = await cred.authHeaders("get", url);
  assert.equal(h.Authorization, "DPoP tok-abc");
  const [hh, pp, ss] = h.DPoP.split(".");
  const header = dec(hh), claims = dec(pp);
  assert.deepEqual(header.jwk, await cred.ensurePublicJwk());
  assert.equal(claims.htu, "https://sam.example.test/lws/vault/v1/records");
  assert.equal(claims.htm, "GET");
  assert.ok(claims.ath);
  const pub = await crypto.subtle.importKey("jwk", header.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.equal(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, Buffer.from(ss, "base64url"), new TextEncoder().encode(`${hh}.${pp}`)), true);
});

test("every call gets a fresh proof, while the token is minted once", async () => {
  const t = fakeTransport([{ status: 200, body: okBody() }]);
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: t.send });
  const a = await cred.authHeaders("GET", "https://x.example.test/a");
  const b = await cred.authHeaders("GET", "https://x.example.test/a");
  assert.notEqual(dec(a.DPoP.split(".")[1]).jti, dec(b.DPoP.split(".")[1]).jti);
  assert.equal(t.calls.length, 1);
});

test("concurrent callers share one mint request", async () => {
  const t = fakeTransport([{ status: 200, body: okBody() }, { status: 200, body: okBody("tok-2") }]);
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: t.send });
  const [a, b, c] = await Promise.all([cred.getSession(), cred.getSession(), cred.authHeaders("GET", "https://x.example.test/")]);
  assert.equal(t.calls.length, 1);
  assert.equal(a, b);
  assert.equal(c.Authorization, "DPoP tok-1");
});

test("inside the guard band it re-mints; outside it does not", async () => {
  let now = 1_000_000;
  const t = fakeTransport([{ status: 200, body: okBody("tok-1", 1800) }, { status: 200, body: okBody("tok-2", 1800) }]);
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: t.send, now: () => now });
  await cred.getSession();
  now += 1800_000 - EXPIRY_GUARD_MS - 1;
  assert.equal((await cred.authHeaders("GET", "https://x.example.test/")).Authorization, "DPoP tok-1");
  now += 2;
  assert.equal((await cred.authHeaders("GET", "https://x.example.test/")).Authorization, "DPoP tok-2");
  assert.equal(t.calls.length, 2);
});

test("freshForMs re-mints a token that would run out during a long turn", async () => {
  let now = 0;
  const t = fakeTransport([{ status: 200, body: okBody("tok-1", 1800) }, { status: 200, body: okBody("tok-2", 1800) }]);
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: t.send, now: () => now });
  await cred.getSession();
  now = 15 * 60_000; // 15 min left
  assert.equal((await cred.authHeaders("POST", "https://x.example.test/", 20 * 60_000)).Authorization, "DPoP tok-2");
});

test("401 from the bridge is NotSignedInError; 403 is OriginNotAllowedError; other errors throw", async () => {
  await assert.rejects(new SessionCredential({ dpopMintUrl: MINT_URL, transport: fakeTransport([{ status: 401 }]).send }).getSession(), NotSignedInError);
  await assert.rejects(new SessionCredential({ dpopMintUrl: MINT_URL, transport: fakeTransport([{ status: 403 }]).send }).getSession(), OriginNotAllowedError);
  await assert.rejects(new SessionCredential({ dpopMintUrl: MINT_URL, transport: fakeTransport([{ status: 502 }]).send }).getSession(), /HTTP 502/);
});

test("a 2xx with no token is refused, so no caller ever sends `DPoP undefined`", async () => {
  const t = fakeTransport([{ status: 200, body: { principal: "p" } }]);
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: t.send });
  await assert.rejects(cred.authHeaders("GET", "https://x.example.test/"), /no token/);
});

test("a missing expires_in falls back to the token's exp claim", async () => {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const t = fakeTransport([{ status: 200, body: okBody(jwtWithExp(exp), undefined) }]);
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: t.send });
  await cred.getSession();
  await cred.getSession();
  assert.equal(t.calls.length, 1, "a token with a readable exp is not re-minted on every call");
});

test("with no bridge and no token there is no sign-in", async () => {
  await assert.rejects(new SessionCredential().getSession(), NotSignedInError);
});

test("an adopted token is used until it nears expiry, then there is no sign-in without a bridge", async () => {
  let now = 0;
  const cred = new SessionCredential({ now: () => now });
  cred.adopt("adopted", { principal: "p", vault: null, vaults: [] }, 600_000);
  assert.equal((await cred.authHeaders("GET", "https://x.example.test/")).Authorization, "DPoP adopted");
  now = 600_000 - EXPIRY_GUARD_MS + 1;
  await assert.rejects(cred.authHeaders("GET", "https://x.example.test/"), NotSignedInError);
});

test("signInWithCode sends this credential's key to verify-code and holds the token it returns", async () => {
  const token = jwtWithExp(Math.floor(Date.now() / 1000) + 1800);
  const t = fakeTransport([{ status: 200, body: { token, principal: "https://id.example.test/i/p9" } }]);
  const cred = new SessionCredential({ transport: t.send });
  const body = await cred.signInWithCode("https://id.example.test", " a@example.test ", " 123456 ");
  assert.equal(body.principal, "https://id.example.test/i/p9");
  assert.equal(t.calls[0].url, "https://id.example.test/base/auth/email/verify-code");
  assert.deepEqual(JSON.parse(t.calls[0].req.body!).dpopJwk, await cred.ensurePublicJwk());
  assert.equal(cred.session?.principal, "https://id.example.test/i/p9");
  assert.equal((await cred.authHeaders("GET", "https://x.example.test/")).Authorization, `DPoP ${token}`);
});

test("signInWithCode returns needsVaultName without a token, and throws when neither came back", async () => {
  const a = new SessionCredential({ transport: fakeTransport([{ status: 200, body: { needsVaultName: true, suggestedName: "sam" } }]).send });
  assert.equal((await a.signInWithCode("https://id.example.test", "a@example.test", "1")).needsVaultName, true);
  assert.equal(a.session, null);
  const b = new SessionCredential({ transport: fakeTransport([{ status: 200, body: {} }]).send });
  await assert.rejects(b.signInWithCode("https://id.example.test", "a@example.test", "1"), NotSignedInError);
});

test("invalidate(true) drops a kit-made key; invalidate() keeps it", async () => {
  const t = fakeTransport([{ status: 200, body: okBody() }, { status: 200, body: okBody() }, { status: 200, body: okBody() }]);
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: t.send });
  const k1 = await cred.ensurePublicJwk();
  await cred.getSession();
  cred.invalidate();
  assert.deepEqual(await cred.ensurePublicJwk(), k1);
  await cred.getSession();
  assert.equal(t.calls.length, 2);
  cred.invalidate(true);
  assert.notDeepEqual(await cred.ensurePublicJwk(), k1);
});

test("a host-held key (e.g. Secure Enclave signer) is used for proofs and never dropped", async () => {
  const inner = await generateDpopKeyPair();
  let signs = 0;
  const hostKey = {
    publicJwk: inner.publicJwk,
    sign: async (input: Uint8Array) => {
      signs++;
      return new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, inner.privateKey, input as Uint8Array<ArrayBuffer>));
    },
  };
  const cred = new SessionCredential({ key: hostKey });
  cred.adopt("t", { principal: "p", vault: null, vaults: [] }, Date.now() + 3600_000);
  await cred.authHeaders("GET", "https://x.example.test/");
  assert.equal(signs, 1);
  cred.invalidate(true);
  assert.deepEqual(await cred.ensurePublicJwk(), inner.publicJwk);
});
