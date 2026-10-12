// The DPoP proof over a real HTTP wire, and the transport contract. Imports the shipped modules;
// expected values are literals or come from `serverHtu` below, never from a copy of the kit's logic.
import { test } from "vitest";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  requestSignInCode, verifySignInCodeHttp, checkVaultName, prepareVaultName,
  generateDpopKeyPair, dpopProof, dpopHeaders, htuFor,
  SignInRefusedError,
  type Transport,
} from "./core";

const dec = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

/**
 * The `htu` a server compares a proof against, from what the server RECEIVED (RFC 9449 §4.3):
 * `https://` + the `Host` header + the request path, query and fragment removed. Written from the
 * RFC and the request the server saw, not from the kit's `htuFor`, so the two can disagree.
 */
function serverHtu(req: http.IncomingMessage): string {
  const path = String(req.url ?? "/").split(/[?#]/)[0];
  return `https://${String(req.headers.host)}${path}`;
}

// A local server that answers the way a verifier would for the htu claim: expected = serverHtu(req).
function htuServer() {
  const srv = http.createServer((req, res) => {
    const proof = String(req.headers["dpop"] ?? "");
    const expected = serverHtu(req);
    const claims = proof ? dec(proof.split(".")[1]) : {};
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ expected, got: claims.htu, htm: claims.htm, method: req.method }));
  });
  return new Promise<{ port: number; close: () => void }>((resolve) =>
    srv.listen(0, "127.0.0.1", () =>
      resolve({ port: (srv.address() as AddressInfo).port, close: () => srv.close() })));
}

// The kit derives htu from the request URL; the server's reading of what it received is the oracle.
test("kit htu equals the server's reading for every URL shape sent over a real wire", async () => {
  const s = await htuServer();
  const host = `127.0.0.1:${s.port}`;
  try {
    const key = await generateDpopKeyPair();
    const urls = [
      `http://${host}/lws/vault/v1/records?limit=5#frag`,
      `http://${host}/lws/vault/a b/records`,          // fetch percent-encodes the space
      `http://${host}/lws/vault/v1/../v2/records`,     // dot segment resolved before sending
      `http://${host}/base/vault/create-named`,
      // the vaultId URI shape from GET /lws/vaults, percent-encoded
      `http://${host}/lws/vault/${encodeURIComponent("https://vault-a.example.test/vault")}/records`,
    ];
    for (const url of urls) {
      const h = await dpopHeaders(key, "tok", "get", url);
      const r = (await (await fetch(url, { headers: h })).json()) as Record<string, string>;
      assert.equal(r.got, r.expected, `htu mismatch for ${url}`);
      assert.equal(r.htm, r.method);
    }
  } finally { s.close(); }
});

// A proof signed for another host is refused on a vault host; the reading moves when only the host changes.
test("a proof signed for the identity host, sent to a vault host, does not match", async () => {
  const s = await htuServer();
  const host = `127.0.0.1:${s.port}`;
  try {
    const key = await generateDpopKeyPair();
    const vaultUrl = `http://${host}/lws/vault/v1/records`;
    const identityHostProof = await dpopProof(key, "GET", "https://id.example.test/lws/vault/v1/records", "tok");
    const bad = (await (await fetch(vaultUrl, { headers: { dpop: identityHostProof } })).json()) as Record<string, string>;
    assert.notEqual(bad.got, bad.expected);
    assert.equal(bad.expected, `https://${host}/lws/vault/v1/records`);
    const good = (await (await fetch(vaultUrl, { headers: { dpop: await dpopProof(key, "GET", vaultUrl, "tok") } })).json()) as Record<string, string>;
    assert.equal(good.got, good.expected);
  } finally { s.close(); }
});

// With no global fetch, a sign-in completes through an injected transport. Here the transport is
// node:http (not fetch, not a stub object) against a
// real local server, and the flow continues to one DPoP-authenticated call the server checks.
test("no global fetch, a node:http transport completes request-code, verify-code and one DPoP call", async () => {
  let registeredJwk: Record<string, string> | undefined;
  const srv = http.createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    res.setHeader("content-type", "application/json");
    if (req.url === "/base/auth/email/request-code") return res.end(JSON.stringify({ requested: true }));
    if (req.url === "/base/auth/email/verify-code") {
      const b = JSON.parse(body);
      if (b.code !== "123456") { res.statusCode = 401; return res.end("{}"); }
      registeredJwk = b.dpopJwk;
      return res.end(JSON.stringify({ token: "t0k", principal: "https://vault-a.example.test/vault", needsVaultName: false }));
    }
    // A DPoP-authenticated vault call: verify the proof's signature with the registered key and
    // its htu with the server's own reconstruction.
    const proof = String(req.headers["dpop"] ?? "");
    const [h, p, sig] = proof.split(".");
    const pub = await crypto.subtle.importKey("jwk", registeredJwk!, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const sigOk = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub,
      Buffer.from(sig, "base64url"), new TextEncoder().encode(`${h}.${p}`));
    const expected = serverHtu(req);
    const ok = sigOk && dec(p).htu === expected && req.headers.authorization === "DPoP t0k";
    res.statusCode = ok ? 200 : 401;
    res.end(JSON.stringify({ records: ok ? [1] : [] }));
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const origin = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const nodeTransport: Transport = (url, req) => new Promise((resolve, reject) => {
    const r = http.request(url, { method: req.method, headers: req.headers, timeout: req.timeoutMs }, (res) => {
      let data = ""; res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, json: async () => JSON.parse(data) }));
    });
    r.on("error", reject); r.end(req.body);
  });
  const saved = globalThis.fetch;
  // @ts-expect-error: removing fetch on purpose
  delete globalThis.fetch;
  try {
    assert.equal(typeof globalThis.fetch, "undefined");
    const key = await generateDpopKeyPair();
    await requestSignInCode(origin, "person@example.test", undefined, "PLAN", { transport: nodeTransport });
    const out = await verifySignInCodeHttp(origin, "person@example.test", "123456", key.publicJwk, undefined, "PLAN", { transport: nodeTransport });
    assert.equal(out.token, "t0k");
    const url = `${origin}/lws/vault/v1/records?limit=1`;
    const res = await nodeTransport(url, { method: "GET", headers: await dpopHeaders(key, out.token!, "GET", url), timeoutMs: 5000 });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { records: [1] });
  } finally {
    globalThis.fetch = saved;
    srv.close();
  }
});

// The default transport must forward the whole request, or every caller that passes none breaks silently.
test("the default transport forwards method, headers, body, credentials and a timeout signal to fetch", async () => {
  const saved = globalThis.fetch;
  const seen: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ token: "x" }), { status: 200 });
  }) as typeof fetch;
  try {
    await verifySignInCodeHttp("https://id.example.test", " person@example.test ", " 42 ", { kty: "EC" });
    const { url, init } = seen[0];
    assert.equal(url, "https://id.example.test/base/auth/email/verify-code");
    assert.equal(init.method, "POST");
    assert.deepEqual(init.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(String(init.body)), { email: "person@example.test", code: "42", dpopJwk: { kty: "EC" } });
    assert.equal(init.credentials, "include");
    assert.ok(init.signal instanceof AbortSignal);
  } finally { globalThis.fetch = saved; }
});

test("a 3xx is a refusal, exactly as res.ok treats it", async () => {
  const t = (status: number): Transport => async () => ({ status, json: async () => ({}) });
  await assert.rejects(requestSignInCode("https://id.example.test", "person@example.test", undefined, undefined, { transport: t(302) }),
    (e: unknown) => e instanceof SignInRefusedError && e.status === 302);
  await assert.rejects(verifySignInCodeHttp("https://id.example.test", "person@example.test", "1", {}, undefined, undefined, { transport: t(399) }),
    (e: unknown) => e instanceof SignInRefusedError && e.status === 399);
  await requestSignInCode("https://id.example.test", "person@example.test", undefined, undefined, { transport: t(204) });
  assert.equal((await checkVaultName("https://id.example.test", "n", { transport: t(302) })).message, "Name check failed (HTTP 302).");
  assert.equal((await prepareVaultName("https://id.example.test", "person@example.test", { transport: t(302) })).isReturning, false);
});

// ath with an INDEPENDENT literal (openssl sha256 | base64url of "header.payload.signature"),
// not recomputed with the same WebCrypto call.
test("ath is base64url(SHA-256(token)) — checked against an openssl literal", async () => {
  const key = await generateDpopKeyPair();
  const claims = dec((await dpopProof(key, "GET", "https://vault-a.example.test/x", "header.payload.signature")).split(".")[1]);
  assert.equal(claims.ath, "JW0E205eSsMIdR7QiFtyK3WGMFZ8U6cSXtn70Gjlw_Y");
  assert.equal(htuFor("https://VAULT-A.example.test:443/x?y"), "https://vault-a.example.test/x");
});

// dpopHeaders' proof must carry the token binding (ath, RFC 9449 §4.3) and the method passed, not only the htu.
// Found by mutation: dropping the token from dpopHeaders' proof survived every shipped test.
test("dpopHeaders' proof binds the token (ath literal) and names the method passed", async () => {
  const key = await generateDpopKeyPair();
  const h = await dpopHeaders(key, "header.payload.signature", "patch", "https://vault-a.example.test/lws/vault/v/x?q=1");
  const claims = dec(h.DPoP.split(".")[1]);
  assert.equal(claims.ath, "JW0E205eSsMIdR7QiFtyK3WGMFZ8U6cSXtn70Gjlw_Y");
  assert.equal(claims.htm, "PATCH");
  assert.equal(claims.htu, "https://vault-a.example.test/lws/vault/v/x");
});
