// Tests for ./machine. Imports the shipped module; the platform is a fake
// transport that VERIFIES what it receives (assertion signature and claims, DPoP proof), as the server would.
import { test } from "vitest";
import assert from "node:assert/strict";
import { MachineCredential, MachineTokenError, clientAssertion, importMachineKey, ASSERTION_LIFETIME_S } from "./machine";
import { signJws, dpopProof } from "./dpop";
import type { Transport, TransportRequest } from "./transport";

const dec = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
async function newJwkText() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey));
}
async function verify(jws: string, jwk: object) {
  const [h, p, s] = jws.split(".");
  const pub = await crypto.subtle.importKey("jwk", { ...jwk, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, Buffer.from(s!, "base64url"), new TextEncoder().encode(`${h}.${p}`));
}

test("importMachineKey takes a P-256 private JWK, refuses anything else, and the private key cannot be exported", async () => {
  const key = await importMachineKey(await newJwkText());
  assert.ok(key && "privateKey" in key);
  await assert.rejects(crypto.subtle.exportKey("jwk", (key as { privateKey: CryptoKey }).privateKey));
  assert.deepEqual(Object.keys(key!.publicJwk).sort(), ["crv", "kty", "x", "y"]);
  assert.equal(await importMachineKey("{}"), null);
  assert.equal(await importMachineKey("not json"), null);
  assert.equal(await importMachineKey(JSON.stringify({ kty: "EC", crv: "P-384", x: "a", y: "b", d: "c" })), null);
});

test("the client assertion carries iss = sub = clientId, aud = the token URL's htu, a short exp, a jti, and verifies", async () => {
  const key = (await importMachineKey(await newJwkText()))!;
  const a = await clientAssertion(key, "client-1", "http://id.example.test:4100/base/oauth/token?x=1", 1_000_000_000);
  const [h, p] = a.split(".");
  assert.deepEqual(dec(h!), { alg: "ES256", typ: "JWT" });
  const c = dec(p!);
  assert.equal(c.iss, "client-1"); assert.equal(c.sub, "client-1");
  assert.equal(c.aud, "https://id.example.test:4100/base/oauth/token");
  assert.equal(c.exp - c.iat, ASSERTION_LIFETIME_S);
  assert.ok(c.jti);
  assert.equal(await verify(a, key.publicJwk), true);
});

test("dpopProof is unchanged by the signJws refactor: same header shape, verifies", async () => {
  const key = (await importMachineKey(await newJwkText()))!;
  const proof = await dpopProof(key, "get", "https://v.example.test/lws/r/1?a=b");
  assert.equal(dec(proof.split(".")[0]!).typ, "dpop+jwt");
  assert.equal(dec(proof.split(".")[1]!).htu, "https://v.example.test/lws/r/1");
  assert.equal(await verify(proof, key.publicJwk), true);
  await assert.rejects(signJws(key, { alg: "HS256" }, {}), TypeError);
});

function fakeTokenEndpoint(answer: { status: number; body?: unknown }) {
  const calls: Array<{ url: string; req: TransportRequest }> = [];
  const send: Transport = async (url, req) => { calls.push({ url, req }); return { status: answer.status, json: async () => answer.body }; };
  return { send, calls };
}

test("MachineCredential mints with client_credentials + the assertion + a DPoP proof bound to the same key", async () => {
  const key = (await importMachineKey(await newJwkText()))!;
  const t = fakeTokenEndpoint({ status: 200, body: { access_token: "mtok", token_type: "DPoP", expires_in: 300, scope: "base.write" } });
  const cred = new MachineCredential({ idOrigin: "http://id.example.test:4100", clientId: "client-1", key, transport: t.send });
  const h = await cred.authHeaders("POST", "https://team.example.test:4100/lws/vault/x/c");
  assert.equal(h.Authorization, "DPoP mtok");
  assert.equal(t.calls.length, 1);
  const { url, req } = t.calls[0]!;
  assert.equal(url, "http://id.example.test:4100/base/oauth/token");
  const form = new URLSearchParams(req.body!);
  assert.equal(form.get("grant_type"), "client_credentials");
  assert.equal(form.get("client_assertion_type"), "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
  assert.equal(form.get("scope"), "base.write");
  assert.equal(await verify(form.get("client_assertion")!, key.publicJwk), true);
  const proof = req.headers.DPoP!;
  assert.deepEqual(dec(proof.split(".")[0]!).jwk, key.publicJwk);
  assert.equal(dec(proof.split(".")[1]!).htu, "https://id.example.test:4100/base/oauth/token");
  assert.equal(dec(proof.split(".")[1]!).ath, undefined);
  // The request's proof binds the token (ath) and the request URL.
  assert.ok(dec(h.DPoP.split(".")[1]!).ath);
  assert.equal(dec(h.DPoP.split(".")[1]!).htu, "https://team.example.test:4100/lws/vault/x/c");
});

test("the token is reused until it nears expiry, then minted again; concurrent callers share one mint", async () => {
  const key = (await importMachineKey(await newJwkText()))!;
  let now = 0;
  const t = fakeTokenEndpoint({ status: 200, body: { access_token: "mtok", expires_in: 300 } });
  const cred = new MachineCredential({ idOrigin: "http://id.example.test:4100", clientId: "c", key, transport: t.send, now: () => now });
  await Promise.all([cred.authHeaders("GET", "https://a.test/"), cred.authHeaders("GET", "https://a.test/")]);
  assert.equal(t.calls.length, 1);
  now = 300_000 - 30_001;
  await cred.authHeaders("GET", "https://a.test/");
  assert.equal(t.calls.length, 1);
  now = 300_000 - 29_999;
  await cred.authHeaders("GET", "https://a.test/");
  assert.equal(t.calls.length, 2);
});

test("a refusal, an unreachable endpoint, and a 2xx with no token are MachineTokenError", async () => {
  const key = (await importMachineKey(await newJwkText()))!;
  await assert.rejects(new MachineCredential({ idOrigin: "http://x", clientId: "c", key, transport: fakeTokenEndpoint({ status: 401 }).send }).authHeaders("GET", "https://a.test/"), MachineTokenError);
  await assert.rejects(new MachineCredential({ idOrigin: "http://x", clientId: "c", key, transport: async () => { throw new Error("down"); } }).authHeaders("GET", "https://a.test/"), (e: unknown) => e instanceof MachineTokenError && e.status === 0);
  await assert.rejects(new MachineCredential({ idOrigin: "http://x", clientId: "c", key, transport: fakeTokenEndpoint({ status: 200, body: {} }).send }).authHeaders("GET", "https://a.test/"), /no token/);
});

test("the assertion lives 60 s; the token call is form-encoded with a 15 s timeout; a trailing slash on idOrigin is dropped", async () => {
  const key = (await importMachineKey(await newJwkText()))!;
  const c = dec((await clientAssertion(key, "c", "https://id.example.test/base/oauth/token", 1_000_000_000)).split(".")[1]!);
  assert.equal(c.exp - c.iat, 60);
  const t = fakeTokenEndpoint({ status: 200, body: { access_token: "mtok", expires_in: 300 } });
  await new MachineCredential({ idOrigin: "https://id.example.test/", clientId: "c", key, transport: t.send }).authHeaders("GET", "https://a.test/");
  const { url, req } = t.calls[0]!;
  assert.equal(url, "https://id.example.test/base/oauth/token");
  assert.equal(req.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(req.timeoutMs, 15000);
});

test("a 2xx that is not JSON is MachineTokenError, not a raw parse error", async () => {
  const key = (await importMachineKey(await newJwkText()))!;
  const send: Transport = async () => ({ status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } });
  await assert.rejects(
    new MachineCredential({ idOrigin: "https://id.example.test", clientId: "c", key, transport: send }).authHeaders("GET", "https://a.test/"),
    (e: unknown) => e instanceof MachineTokenError && e.status === 200,
  );
});

