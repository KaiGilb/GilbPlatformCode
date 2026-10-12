// Tests for ./dpop. Imports the shipped module (no copy of its logic here).
import { test } from "vitest";
import assert from "node:assert/strict";
import { generateDpopKeyPair, dpopProof, dpopHeaders, htuFor } from "./core";

const dec = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
const b64u = (b: ArrayBuffer) => Buffer.from(b).toString("base64url");

test("htuFor keeps the host of the request: a vault call signs the vault's host, not the identity host", () => {
  assert.equal(htuFor("https://vault-a.example.test/lws/vault/abc/records?limit=5#x"), "https://vault-a.example.test/lws/vault/abc/records");
  assert.equal(htuFor("https://id.example.test/base/vault/create-named"), "https://id.example.test/base/vault/create-named");
});

test("htuFor forces https and keeps an explicit port, as the server rebuilds it", () => {
  assert.equal(htuFor("http://dev.example.test:8787/base/x?y=1"), "https://dev.example.test:8787/base/x");
});

test("htuFor refuses a relative URL rather than guessing a host", () => {
  assert.throws(() => htuFor("/lws/vault/abc/records"), TypeError);
});

test("the private key cannot be exported", async () => {
  const key = await generateDpopKeyPair();
  await assert.rejects(crypto.subtle.exportKey("jwk", key.privateKey));
  assert.deepEqual(Object.keys(key.publicJwk).sort(), ["crv", "kty", "x", "y"]);
});

test("a proof for a vault call names that vault's host, is signed by the key, and binds the token", async () => {
  const key = await generateDpopKeyPair();
  const url = "https://vault-b.example.test/lws/vault/v1/records?limit=1";
  const token = "header.payload.signature";
  const proof = await dpopProof(key, "get", url, token);
  const [h, p, s] = proof.split(".");
  const header = dec(h), claims = dec(p);
  assert.equal(header.typ, "dpop+jwt");
  assert.equal(header.alg, "ES256");
  assert.deepEqual(header.jwk, key.publicJwk);
  assert.equal(header.jwk.d, undefined);
  assert.equal(claims.htm, "GET");
  assert.equal(claims.htu, "https://vault-b.example.test/lws/vault/v1/records");
  assert.equal(claims.ath, b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
  assert.ok(Math.abs(claims.iat - Date.now() / 1000) < 5);
  const pub = await crypto.subtle.importKey("jwk", header.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub,
    Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${p}`));
  assert.equal(valid, true);
});

test("a proof without a token carries no ath, and every proof has a fresh jti", async () => {
  const key = await generateDpopKeyPair();
  const a = dec((await dpopProof(key, "POST", "https://id.example.test/base/oauth/token")).split(".")[1]);
  const b = dec((await dpopProof(key, "POST", "https://id.example.test/base/oauth/token")).split(".")[1]);
  assert.equal(a.ath, undefined);
  assert.notEqual(a.jti, b.jti);
});

test("dpopHeaders gives both headers, with the proof bound to the URL passed", async () => {
  const key = await generateDpopKeyPair();
  const hdrs = await dpopHeaders(key, "tok", "PATCH", "https://vault-a.example.test/lws/vault/v/x");
  assert.equal(hdrs.Authorization, "DPoP tok");
  assert.equal(dec(hdrs.DPoP.split(".")[1]).htu, "https://vault-a.example.test/lws/vault/v/x");
});

// ── A key the kit cannot hold (Secure Enclave). The app signs; the kit builds the rest. ──
// The fixture key has NO privateKey member, so a kit that ignored `sign` cannot produce a proof at all.

/** A signer key backed by a WebCrypto pair the kit never sees; records every input it is asked to sign. */
async function enclaveLikeKey(transform: (raw: Uint8Array) => Uint8Array = (r) => r) {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const inputs: Uint8Array[] = [];
  const key = {
    publicJwk: { kty: jwk.kty as string, crv: jwk.crv as string, x: jwk.x as string, y: jwk.y as string },
    sign: async (input: Uint8Array) => {
      inputs.push(input);
      return transform(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, input)));
    },
  };
  return { key, inputs };
}

/** A DER ECDSA-Sig-Value around a raw r||s, the shape SecKeyCreateSignature returns. */
function toDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const v = b.slice(i);
    return v[0] & 0x80 ? Uint8Array.of(0x02, v.length + 1, 0, ...v) : Uint8Array.of(0x02, v.length, ...v);
  };
  const body = Uint8Array.of(...int(raw.slice(0, 32)), ...int(raw.slice(32)));
  return Uint8Array.of(0x30, body.length, ...body);
}

test("a signer key: the app's sign function signs the unhashed header.payload, and the proof verifies", async () => {
  const { key, inputs } = await enclaveLikeKey();
  const url = "https://vault-c.example.test/lws/vault/v9/c?x=1";
  const proof = await dpopProof(key, "post", url, "tok");
  const [h, p, s] = proof.split(".");
  assert.equal(inputs.length, 1);
  assert.equal(new TextDecoder().decode(inputs[0]), `${h}.${p}`);
  assert.deepEqual(dec(h).jwk, key.publicJwk);
  assert.equal(dec(p).htu, "https://vault-c.example.test/lws/vault/v9/c");
  assert.equal(Buffer.from(s, "base64url").length, 64);
  const pub = await crypto.subtle.importKey("jwk", dec(h).jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.equal(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub,
    Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${p}`)), true);
});

test("a signer key works through dpopHeaders; htu still comes from the URL", async () => {
  const { key } = await enclaveLikeKey();
  const hdrs = await dpopHeaders(key, "tok", "GET", "https://vault-b.example.test/lws/vault/v1/records");
  assert.equal(hdrs.Authorization, "DPoP tok");
  assert.equal(dec(hdrs.DPoP.split(".")[1]).htu, "https://vault-b.example.test/lws/vault/v1/records");
});

test("a signer that returns DER (as iOS SecKeyCreateSignature does) is refused, naming DER", async () => {
  const { key } = await enclaveLikeKey(toDer);
  await assert.rejects(dpopProof(key, "GET", "https://vault-a.example.test/lws/vault/v/x"), /64 bytes; got (6[89]|7[0-2])\. .*DER/);
});

test("a signer that returns a signature of the wrong length is refused", async () => {
  const { key } = await enclaveLikeKey((r) => r.slice(0, 63));
  await assert.rejects(dpopProof(key, "GET", "https://vault-a.example.test/lws/vault/v/x"), /64 bytes; got 63\.$/);
});

test("a signer that returns an ArrayBuffer is accepted", async () => {
  const { key } = await enclaveLikeKey();
  const bufKey = { publicJwk: key.publicJwk, sign: async (i: Uint8Array) => (await key.sign(i)).slice().buffer as unknown as Uint8Array };
  const proof = await dpopProof(bufKey, "GET", "https://vault-a.example.test/lws/vault/v/x");
  assert.equal(Buffer.from(proof.split(".")[2], "base64url").length, 64);
});

test("a key with neither privateKey nor sign is refused rather than guessed", async () => {
  const key = { publicJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" } } as unknown as Parameters<typeof dpopProof>[0];
  await assert.rejects(dpopProof(key, "GET", "https://vault-a.example.test/x"), TypeError);
});
