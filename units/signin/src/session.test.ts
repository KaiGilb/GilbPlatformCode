// Tests for ./session. Imports the shipped module; no copy of
// its logic here. The transport is a recording fake, so no network is touched.
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  SessionCredential,
  NotSignedInError,
  RequestRefusedError,
  isRequestFault,
  platformSentenceOf,
  OriginNotAllowedError,
  readSessionVaults,
  narrowVaultModes,
  tokenExpiresAt,
  EXPIRY_GUARD_MS,
  UNKNOWN_TTL_FALLBACK_MS,
  REACHABLE_VAULTS_PATH,
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

test("the guard band is 60 s and an unreadable expiry counts as 5 min, as the README states", () => {
  assert.equal(EXPIRY_GUARD_MS, 60_000);
  assert.equal(UNKNOWN_TTL_FALLBACK_MS, 300_000);
});

test("a sign-out while the code is being verified is not undone when the answer lands", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const send: Transport = async () => {
    await gate;
    return { status: 200, json: async () => ({ token: "tok-late", principal: "https://id.example.test/i/p1" }) };
  };
  const cred = new SessionCredential({ transport: send });
  const pending = cred.signInWithCode("https://id.example.test", "person@example.test", "123456");
  await new Promise((r) => setTimeout(r, 10));
  cred.invalidate(true); // sign-out
  release();
  await assert.rejects(pending, NotSignedInError);
  assert.equal(cred.session, null);
});

test("a 2xx from the bridge that is not JSON is refused as no token, not a raw parse error", async () => {
  const send: Transport = async () => ({ status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } });
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: send });
  await assert.rejects(cred.getSession(), /no token/);
});

const LIST_ORIGIN = "https://id.example.test";
const UNREACHABLE = "Could not reach your vault list. The browser blocked the request or the network failed.";
const UNREADABLE = "The vault list answer could not be read.";
const heldVault = { entity: "https://v.example.test/base/e/v1", id: "v1", name: "sam" };

/** verify-code, then one vault-list answer. Records every call. */
function codeTransport(
  vaults: { status: number; body?: unknown; json?: () => Promise<unknown> } | "throw",
  token = jwtWithExp(Math.floor(Date.now() / 1000) + 1800),
) {
  const calls: Call[] = [];
  const send: Transport = async (url, req) => {
    calls.push({ url, req });
    if (url === `${LIST_ORIGIN}${REACHABLE_VAULTS_PATH}`) {
      if (vaults === "throw") throw new TypeError("Failed to fetch");
      return {
        status: vaults.status,
        json: vaults.json ?? (async () => vaults.body),
      };
    }
    return { status: 200, json: async () => ({ token, principal: "https://id.example.test/i/p9" }) };
  };
  return { send, calls, token };
}

function listCall(calls: Call[]) {
  const hit = calls.filter((c) => c.url === `${LIST_ORIGIN}${REACHABLE_VAULTS_PATH}`);
  assert.equal(hit.length, 1);
  return hit[0]!;
}

test("REACHABLE_VAULTS_PATH is the wire path GET /lws/vaults", () => {
  assert.equal(REACHABLE_VAULTS_PATH, "/lws/vaults");
});

test("signInWithCode reads GET /lws/vaults with a DPoP proof and cookies omitted, and keeps the narrowed list", async () => {
  const wire = {
    "@context": "https://example.test/ctx",
    total: 2,
    vaults: [
      { vaultId: "https://a.example.test/vault", modes: ["read", "append"], name: "A", isLandingVault: true },
      { vaultId: "", modes: ["read"] },
      { "@id": "https://b.example.test/base/e/1", vaultId: "https://b.example.test/vault", modes: ["write", "read", "write"] },
    ],
    complete: true,
    incompletePeers: 0,
  };
  const t = codeTransport({ status: 200, body: wire });
  const cred = new SessionCredential({ transport: t.send });
  const body = await cred.signInWithCode(LIST_ORIGIN, "a@example.test", "123456");
  assert.equal(body.principal, "https://id.example.test/i/p9");
  const req = listCall(t.calls).req;
  assert.equal(req.method, "GET");
  assert.equal(req.credentials, "omit");
  assert.equal(req.timeoutMs, 15000);
  assert.equal(req.headers.Authorization, `DPoP ${t.token}`);
  assert.equal(req.headers.Accept, "application/ld+json, application/json");
  assert.equal(typeof req.headers.DPoP, "string");
  const claims = dec(req.headers.DPoP.split(".")[1]);
  assert.equal(claims.htm, "GET");
  assert.equal(claims.htu, `${LIST_ORIGIN}/lws/vaults`);
  assert.equal(cred.session?.principal, "https://id.example.test/i/p9");
  assert.equal(cred.session?.vault, null);
  assert.deepEqual(cred.session?.vaults, [
    { vaultId: "https://a.example.test/vault", modes: ["read"] },
    { vaultId: "https://b.example.test/vault", modes: ["write", "read"] },
  ]);
  assert.equal(cred.session?.vaultsProblem, undefined);
});

test("signInWithCode still resolves when the vault list request throws, and the vaults stay as they were", async () => {
  const t = codeTransport("throw");
  const cred = new SessionCredential({ transport: t.send });
  const body = await cred.signInWithCode(LIST_ORIGIN, "a@example.test", "123456");
  assert.equal(body.principal, "https://id.example.test/i/p9");
  assert.equal(cred.session?.principal, "https://id.example.test/i/p9");
  assert.deepEqual(cred.session?.vaults, []);
  assert.equal(cred.session?.vaultsProblem, UNREACHABLE);
  assert.equal(listCall(t.calls).req.credentials, "omit");
});

test("a non-2xx vault list leaves the held vaults and names the HTTP status", async () => {
  const before = [{ vaultId: "keep", modes: ["write" as const] }];
  const t = fakeTransport([{ status: 503 }]);
  const cred = new SessionCredential({ transport: t.send });
  cred.adopt("tok", { principal: "p", vault: heldVault, vaults: before }, Date.now() + 3_600_000);
  const session = await cred.loadReachableVaults(LIST_ORIGIN);
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0]!.url, `${LIST_ORIGIN}${REACHABLE_VAULTS_PATH}`);
  assert.equal(session.vaults, before);
  assert.equal(session.vault, heldVault);
  assert.equal(session.principal, "p");
  assert.equal(session.vaultsProblem, "Could not read your vault list (HTTP 503).");
});

test("a vault list that is not JSON, or whose vaults is not an array, cannot be read", async () => {
  const before = [{ vaultId: "keep", modes: ["read" as const] }];
  const send: Transport = async () => ({ status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } });
  const a = new SessionCredential({ transport: send });
  const kept = before.map((v) => ({ ...v, modes: [...v.modes] }));
  a.adopt("tok", { principal: "p", vault: heldVault, vaults: kept }, Date.now() + 3_600_000);
  const session = await a.loadReachableVaults(LIST_ORIGIN);
  assert.equal(session.vaults, kept);
  assert.equal(session.vault, heldVault);
  assert.equal(session.vaultsProblem, UNREADABLE);

  const b = new SessionCredential({
    transport: fakeTransport([{ status: 200, body: { complete: true, vaults: { not: "a list" } } }]).send,
  });
  const keptB = [{ vaultId: "keep", modes: ["read" as const] }];
  b.adopt("tok", { principal: "p", vault: heldVault, vaults: keptB }, Date.now() + 3_600_000);
  const second = await b.loadReachableVaults(LIST_ORIGIN);
  assert.equal(second.vaults, keptB);
  assert.equal(second.vaultsProblem, UNREADABLE);
});

test("a partial vault list is kept and names how many stores did not answer", async () => {
  const partial = { vaults: [{ vaultId: "v9", modes: ["read", "append"] }, { modes: ["read"] }], complete: false, incompletePeers: 2 };
  const t = fakeTransport([{ status: 200, body: partial }]);
  const cred = new SessionCredential({ transport: t.send });
  cred.adopt("tok", { principal: "p", vault: heldVault, vaults: [{ vaultId: "old", modes: ["write"] }] }, Date.now() + 3_600_000);
  const session = await cred.loadReachableVaults(LIST_ORIGIN);
  assert.deepEqual(session.vaults, [{ vaultId: "v9", modes: ["read"] }]);
  assert.equal(session.vault, heldVault);
  assert.equal(session.principal, "p");
  assert.equal(session.vaultsProblem, "Your vault list may be incomplete: 2 store(s) did not answer.");

  const zero = new SessionCredential({
    transport: fakeTransport([{ status: 200, body: { vaults: [], complete: false, incompletePeers: 0 } }]).send,
  });
  zero.adopt("tok", { principal: "p", vault: null, vaults: [] }, Date.now() + 3_600_000);
  assert.equal(
    (await zero.loadReachableVaults(LIST_ORIGIN)).vaultsProblem,
    "Your vault list may be incomplete: 0 store(s) did not answer.",
  );

  const unnamed = new SessionCredential({
    transport: fakeTransport([{ status: 200, body: { vaults: [{ vaultId: "v", modes: ["read"] }], complete: false } }]).send,
  });
  unnamed.adopt("tok", { principal: "p", vault: null, vaults: [] }, Date.now() + 3_600_000);
  const named = await unnamed.loadReachableVaults(LIST_ORIGIN);
  assert.deepEqual(named.vaults, [{ vaultId: "v", modes: ["read"] }]);
  assert.equal(named.vaultsProblem, "Your vault list may be incomplete: some store(s) did not answer.");
});

test("a whole vault list replaces vaults and clears a previous vaultsProblem", async () => {
  const answers = [
    { status: 502 },
    { status: 200, body: { vaults: [{ vaultId: "v1", modes: ["read", "write", "control"] }], complete: true, incompletePeers: 0 } },
  ];
  const t = fakeTransport(answers);
  const cred = new SessionCredential({ transport: t.send });
  cred.adopt("tok", { principal: "p", vault: heldVault, vaults: [{ vaultId: "old", modes: ["read"] }] }, Date.now() + 3_600_000);
  const failed = await cred.loadReachableVaults(LIST_ORIGIN);
  assert.equal(failed.vaultsProblem, "Could not read your vault list (HTTP 502).");
  const whole = await cred.loadReachableVaults(LIST_ORIGIN);
  assert.deepEqual(whole.vaults, [{ vaultId: "v1", modes: ["read", "write"] }]);
  assert.equal(whole.vault, heldVault);
  assert.equal(whole.vaultsProblem, undefined);
  assert.equal(Object.hasOwn(whole, "vaultsProblem"), false);
});

test("loadReachableVaults with no token throws NotSignedInError and sends nothing", async () => {
  let sent = 0;
  const send: Transport = async () => {
    sent++;
    return { status: 200, json: async () => ({ vaults: [], complete: true }) };
  };
  const cred = new SessionCredential({ transport: send });
  await assert.rejects(cred.loadReachableVaults(LIST_ORIGIN), NotSignedInError);
  assert.equal(sent, 0);
  assert.equal(cred.session, null);
});

const RUNS_OUT = "Could not read your vault list: your sign-in runs out too soon. Sign in again.";

test("a token inside the expiry guard keeps the vaults and names the short sign-in, and sends no list request", async () => {
  let now = 1_000_000;
  let sent = 0;
  const send: Transport = async () => {
    sent++;
    return { status: 200, json: async () => ({ vaults: [], complete: true }) };
  };
  const before = [{ vaultId: "keep", modes: ["write" as const] }];
  const cred = new SessionCredential({ transport: send, now: () => now });
  cred.adopt("tok", { principal: "p", vault: heldVault, vaults: before }, now + 30_000);
  const session = await cred.loadReachableVaults(LIST_ORIGIN);
  assert.equal(sent, 0);
  assert.equal(session.vaults, before);
  assert.equal(session.vault, heldVault);
  assert.equal(session.principal, "p");
  assert.equal(session.vaultsProblem, RUNS_OUT);
  assert.equal(cred.session, session);
});

test("signInWithCode still resolves when the new token is already inside the expiry guard", async () => {
  let now = 1_000_000;
  const token = jwtWithExp(Math.floor((now + 30_000) / 1000));
  const t = codeTransport({ status: 200, body: { vaults: [{ vaultId: "v", modes: ["read"] }], complete: true } }, token);
  const cred = new SessionCredential({ transport: t.send, now: () => now });
  const body = await cred.signInWithCode(LIST_ORIGIN, "a@example.test", "123456");
  assert.equal(body.principal, "https://id.example.test/i/p9");
  assert.equal(cred.session?.principal, body.principal);
  assert.deepEqual(cred.session?.vaults, []);
  assert.equal(cred.session?.vaultsProblem, RUNS_OUT);
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0]!.url, `${LIST_ORIGIN}/base/auth/email/verify-code`);
});

test("a sign-out while the vault-list proof is being built stores nothing", async () => {
  let now = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let minting = false;
  const send: Transport = async (url) => {
    if (url === MINT_URL) {
      minting = true;
      await gate;
      return { status: 200, json: async () => okBody("tok-new", 1800) };
    }
    return { status: 200, json: async () => ({ vaults: [{ vaultId: "v", modes: ["read"] }], complete: true }) };
  };
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: send, now: () => now });
  cred.adopt("tok-old", { principal: "p", vault: null, vaults: [{ vaultId: "keep", modes: ["read"] }] }, 30_000);
  const pending = cred.loadReachableVaults(LIST_ORIGIN);
  for (let i = 0; i < 50 && !minting; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(minting, true, "the proof's re-mint was on the wire");
  cred.invalidate(true);
  release();
  await assert.rejects(pending, NotSignedInError);
  assert.equal(cred.session, null);
});

test("a re-mint inside the guard stores the vault list on the new token", async () => {
  let now = 0;
  const t = fakeTransport([
    { status: 200, body: okBody("tok-fresh", 1800) },
    { status: 200, body: { vaults: [{ vaultId: "v-list", modes: ["read", "write"] }], complete: true } },
  ]);
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: t.send, now: () => now });
  cred.adopt("tok-old", { principal: "p", vault: null, vaults: [] }, 30_000);
  const session = await cred.loadReachableVaults(LIST_ORIGIN);
  assert.equal(t.calls[0]!.url, MINT_URL);
  assert.equal(t.calls[1]!.url, `${LIST_ORIGIN}${REACHABLE_VAULTS_PATH}`);
  assert.equal(t.calls[1]!.req.headers.Authorization, "DPoP tok-fresh");
  assert.equal(session.principal, "https://id.example.test/i/p1");
  assert.deepEqual(session.vaults, [{ vaultId: "v-list", modes: ["read", "write"] }]);
  assert.equal(cred.session, session);
});

test("a vault list is stored only on the token it was read with", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let listed = false;
  const send: Transport = async () => {
    listed = true;
    await gate;
    return { status: 200, json: async () => ({ vaults: [{ vaultId: "from-first", modes: ["read"] }], complete: true }) };
  };
  const cred = new SessionCredential({ transport: send, now: () => 0 });
  const expiry = 3_600_000;
  cred.adopt("tok-1", { principal: "p1", vault: heldVault, vaults: [{ vaultId: "old", modes: ["write"] }] }, expiry);
  const pending = cred.loadReachableVaults(LIST_ORIGIN);
  for (let i = 0; i < 50 && !listed; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(listed, true, "the list request was on the wire");
  cred.adopt("tok-2", { principal: "p2", vault: null, vaults: [{ vaultId: "kept", modes: ["write"] }] }, expiry);
  release();
  const returned = await pending;
  assert.equal(cred.session?.principal, "p2");
  assert.deepEqual(cred.session?.vaults, [{ vaultId: "kept", modes: ["write"] }]);
  assert.equal(cred.session?.vaultsProblem, undefined);
  assert.equal(returned.principal, "p1");
  assert.equal(returned.vault, heldVault);
  assert.deepEqual(returned.vaults, [{ vaultId: "from-first", modes: ["read"] }]);
  assert.equal(returned.vaultsProblem, undefined);
});

test("a failed vault list does not record its problem on a token it was not read with", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let listed = false;
  const before = [{ vaultId: "old", modes: ["write" as const] }];
  const send: Transport = async () => {
    listed = true;
    await gate;
    return { status: 503, json: async () => ({}) };
  };
  const cred = new SessionCredential({ transport: send, now: () => 0 });
  cred.adopt("tok-1", { principal: "p1", vault: heldVault, vaults: before }, 3_600_000);
  const pending = cred.loadReachableVaults(LIST_ORIGIN);
  for (let i = 0; i < 50 && !listed; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(listed, true, "the list request was on the wire");
  cred.adopt("tok-2", { principal: "p2", vault: null, vaults: [{ vaultId: "kept", modes: ["write"] }] }, 3_600_000);
  release();
  const returned = await pending;
  assert.equal(cred.session?.principal, "p2");
  assert.deepEqual(cred.session?.vaults, [{ vaultId: "kept", modes: ["write"] }]);
  assert.equal(cred.session?.vaultsProblem, undefined);
  assert.equal(returned.principal, "p1");
  assert.equal(returned.vaults, before);
  assert.equal(returned.vaultsProblem, "Could not read your vault list (HTTP 503).");
});

test("a plain invalidate() while the vault list is on the wire does not reject and stores nothing", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let listed = false;
  const send: Transport = async () => {
    listed = true;
    await gate;
    return { status: 200, json: async () => ({ vaults: [{ vaultId: "v-read", modes: ["read", "write"] }], complete: true }) };
  };
  const cred = new SessionCredential({ transport: send, now: () => 0 });
  cred.adopt("tok", { principal: "p", vault: heldVault, vaults: [{ vaultId: "old", modes: ["read"] }] }, 3_600_000);
  const pending = cred.loadReachableVaults(LIST_ORIGIN);
  for (let i = 0; i < 50 && !listed; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(listed, true, "the list request was on the wire");
  cred.invalidate();
  release();
  const returned = await pending;
  assert.equal(cred.session, null);
  assert.equal(returned.principal, "p");
  assert.equal(returned.vault, heldVault);
  assert.deepEqual(returned.vaults, [{ vaultId: "v-read", modes: ["read", "write"] }]);
  assert.equal(returned.vaultsProblem, undefined);
});

test("loadReachableVaults strips trailing slashes from the origin", async () => {
  const body = { vaults: [{ vaultId: "v", modes: ["read"] }], complete: true };
  const one = fakeTransport([{ status: 200, body }]);
  const cred = new SessionCredential({ transport: one.send, now: () => 0 });
  cred.adopt("tok", { principal: "p", vault: null, vaults: [] }, 3_600_000);
  const session = await cred.loadReachableVaults("https://x.test/");
  assert.equal(one.calls.length, 1);
  assert.equal(one.calls[0]!.url, "https://x.test/lws/vaults");
  assert.equal(one.calls[0]!.req.credentials, "omit");
  assert.equal(dec(one.calls[0]!.req.headers.DPoP.split(".")[1]).htu, "https://x.test/lws/vaults");
  assert.deepEqual(session.vaults, [{ vaultId: "v", modes: ["read"] }]);

  const two = fakeTransport([{ status: 200, body }]);
  const again = new SessionCredential({ transport: two.send, now: () => 0 });
  again.adopt("tok", { principal: "p", vault: null, vaults: [] }, 3_600_000);
  await again.loadReachableVaults("https://x.test//");
  assert.equal(two.calls[0]!.url, "https://x.test/lws/vaults");
});

test("a sign-out while the vault list is on the wire leaves no session", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let listed = false;
  const send: Transport = async (url) => {
    if (url === `${LIST_ORIGIN}${REACHABLE_VAULTS_PATH}`) {
      listed = true;
      await gate;
      return { status: 200, json: async () => ({ vaults: [{ vaultId: "v", modes: ["read", "write"] }], complete: true }) };
    }
    return { status: 200, json: async () => ({ token: "tok-late", principal: "https://id.example.test/i/p1" }) };
  };
  const cred = new SessionCredential({ transport: send });
  const pending = cred.signInWithCode(LIST_ORIGIN, "person@example.test", "123456");
  for (let i = 0; i < 50 && !listed; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(listed, true, "the list request was on the wire");
  cred.invalidate(true);
  release();
  await assert.rejects(pending, NotSignedInError);
  assert.equal(cred.session, null);
});

// --- 401 is not always "your sign-in ran out" (platformRefusal.ts) ---

test("a 401 that says the token is bad keeps NotSignedInError, with the platform's sentence on it", async () => {
  const sentence = "Invalid access token: \"exp\" claim timestamp check failed";
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: fakeTransport([{ status: 401, body: { error: "Unauthorized", message: sentence } }]).send });
  await assert.rejects(cred.getSession(), (e: unknown) => {
    assert.ok(e instanceof NotSignedInError);
    assert.equal(e.platformSentence, sentence);
    assert.match(e.message, /^Your sign-in needs refreshing/);
    return true;
  });
});

test("a 401 with no body keeps today's NotSignedInError and has no platformSentence", async () => {
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: fakeTransport([{ status: 401 }]).send });
  await assert.rejects(cred.getSession(), (e: unknown) => e instanceof NotSignedInError && e.platformSentence === undefined);
});

test("a 401 that names the DPoP proof is RequestRefusedError with the platform's sentence, not NotSignedInError", async () => {
  const sentence = "DPoP proof htu does not match the request URI";
  const cred = new SessionCredential({ dpopMintUrl: MINT_URL, transport: fakeTransport([{ status: 401, body: { error: "Unauthorized", message: sentence } }]).send });
  await assert.rejects(cred.getSession(), (e: unknown) => {
    assert.ok(e instanceof RequestRefusedError);
    assert.ok(!(e instanceof NotSignedInError));
    assert.equal(e.platformSentence, sentence);
    assert.equal(e.message, `The platform refused this request: ${sentence}`);
    return true;
  });
});

test("isRequestFault: every verify.ts proof sentence is a request fault except the bound-key one", () => {
  for (const s of [
    "Invalid DPoP proof: DPoP proof typ must be dpop+jwt",
    "DPoP proof htm does not match the request method",
    "DPoP proof htu does not match the request URI",
    "DPoP proof has no iat",
    "DPoP proof iat is outside the freshness window",
    "DPoP proof ath claim is malformed",
    "DPoP proof ath does not match the presented access token",
    "DPoP proof has no jti (replay protection requires it)",
    "DPoP proof has already been used (replay rejected)",
    "Unsupported Authorization scheme (expected Bearer or DPoP)",
  ]) assert.equal(isRequestFault(s), true, s);
  for (const s of [
    "DPoP proof key does not match the token's bound key (cnf.jkt)",
    "Malformed access token: x",
    "Untrusted token issuer: x is not in the trusted-issuer allow-list",
    "Invalid access token: x",
    "Access token is not DPoP-bound (no cnf.jkt)",
    "Access token has no subject (sub) principal",
    undefined,
  ]) assert.equal(isRequestFault(s), false, String(s));
});

test("platformSentenceOf reads message from a parsed body or its text, and nothing else", () => {
  assert.equal(platformSentenceOf({ error: "Unauthorized", message: " hi " }), "hi");
  assert.equal(platformSentenceOf('{"message":"hi"}'), "hi");
  for (const b of [undefined, null, "not json", [], {}, { message: "" }, { message: 4 }]) assert.equal(platformSentenceOf(b), undefined);
});
