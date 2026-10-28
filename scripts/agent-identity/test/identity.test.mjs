// Tests for scripts/agent-identity/identity.mjs. No network: every call goes through a fake transport.
//
// HOW TO RUN: identity.mjs imports the units' TypeScript, so the tests need the same flags as the tool (Node >= 22.7):
//   node --experimental-transform-types --no-warnings --import ./scripts/lib/ts-resolve.mjs --test scripts/agent-identity/test/identity.test.mjs
// Plain `node --test "scripts/**/*.test.mjs"` (main's CI command) cannot parse the TypeScript, so this file then skips itself
// with a message instead of failing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let run, importError;
try { ({ run } = await import("../identity.mjs")); } catch (e) { importError = e; }
const skip = importError
  ? `skipped: identity.mjs could not load its TypeScript (${importError.code ?? importError.message}). Run with --experimental-transform-types --import ./scripts/lib/ts-resolve.mjs`
  : false;
if (skip) console.log(skip);

const TOKEN = "FAKE-ACCESS-TOKEN-zzz";
const BODY_MARKER = "BODY-MARKER-do-not-print";
const ID = "https://id.gilb.com";

function fakeTransport({ registerStatus = 200, tokenStatus = 200, created = true, getStatus = 200 } = {}) {
  const calls = [];
  const t = async (url, req) => {
    calls.push({ url, ...req });
    if (url === `${ID}/base/client/register`) {
      return { status: registerStatus, json: async () => (registerStatus === 200 ? { clientId: "client-123", created, confersAuthority: false } : { error: "boom" }) };
    }
    if (url === `${ID}/base/oauth/token`) {
      return { status: tokenStatus, json: async () => ({ access_token: TOKEN, token_type: "DPoP", expires_in: 300, scope: "base.read" }) };
    }
    return { status: getStatus, headers: new Headers({ "content-type": "application/ld+json" }), json: async () => ({ marker: BODY_MARKER }) };
  };
  t.calls = calls;
  return t;
}

function harness(extra = {}) {
  const lines = [];
  const deps = { now: () => Date.parse("2026-10-28T12:00:00Z"), git: () => false, out: (s) => lines.push(s), err: (s) => lines.push(s), ...extra };
  return { deps, text: () => lines.join("\n") };
}

function scratch() {
  const dir = path.join(here, `.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  return dir;
}
const mode = (p) => fs.statSync(p).mode & 0o777;
const INIT = (kf, ...more) => ["init", "--name", "Test publisher", "--declared-origin", "https://github.com/KaiGilb/GilbPlatformCode", "--key-file", kf, ...more];

test("dry run sends nothing and writes nothing", { skip }, async () => {
  const dir = scratch();
  try {
    const kf = path.join(dir, "k.jwk");
    const transport = fakeTransport();
    const h = harness({ transport });
    assert.equal(await run(INIT(kf), h.deps), 0);
    assert.equal(transport.calls.length, 0);
    assert.deepEqual(fs.readdirSync(dir), []);
    assert.match(h.text(), /"x": "<x>"/);
    assert.match(h.text(), /does not exist/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("--write with no key: creates key, registers, writes sidecar, mints one token", { skip }, async () => {
  const dir = scratch();
  try {
    const kf = path.join(dir, "k.jwk");
    const transport = fakeTransport();
    const h = harness({ transport });
    assert.equal(await run(INIT(kf, "--write"), h.deps), 0);
    assert.equal(mode(kf), 0o600);
    const jwk = JSON.parse(fs.readFileSync(kf, "utf8"));
    assert.deepEqual(Object.keys(jwk).sort(), ["crv", "d", "kty", "x", "y"]);
    assert.equal(transport.calls.length, 3); // register, token, verified GET (was 2)
    const reg = transport.calls[0];
    assert.equal(reg.method, "POST");
    const body = JSON.parse(reg.body);
    assert.deepEqual(Object.keys(body).sort(), ["clientDisplayName", "clientPublicKey", "declaredOrigin"]);
    assert.deepEqual(body.clientPublicKey, { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y });
    assert.equal(body.declaredOrigin, "https://github.com/KaiGilb/GilbPlatformCode");
    assert.equal(body.clientDisplayName, "Test publisher");
    assert.equal(mode(`${kf}.client.json`), 0o600);
    const side = JSON.parse(fs.readFileSync(`${kf}.client.json`, "utf8"));
    assert.equal(side.clientId, "client-123");
    assert.equal(side.created, true);
    assert.equal(side.idOrigin, ID);
    assert.equal(side.registeredAt, "2026-10-28T12:00:00.000Z");
    const tok = transport.calls[1];
    assert.equal(tok.url, `${ID}/base/oauth/token`);
    const form = new URLSearchParams(tok.body);
    assert.equal(form.get("grant_type"), "client_credentials");
    assert.equal(form.get("client_assertion_type"), "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    assert.equal(form.get("scope"), "base.read");
    assert.ok(form.get("client_assertion"));
    assert.ok(tok.headers.DPoP);
    const out = h.text();
    assert.match(out, /clientId: client-123/);
    assert.match(out, /first token: ok \(scope base.read, expires_in 300\)/);
    assert.ok(!out.includes(jwk.d));
    assert.ok(!out.includes(TOKEN));
    assert.ok(!out.includes(form.get("client_assertion")));
    assert.match(out, /principal: made \(verified GET → 200\)/);
    const ver = transport.calls[2];
    assert.equal(ver.url, `${ID}/base/connect/skill-claims`);
    assert.equal(ver.method, "GET");
    assert.equal(ver.headers.Authorization, `DPoP ${TOKEN}`);
    assert.ok(ver.headers.DPoP);
    assert.ok(!out.includes(BODY_MARKER));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("--write with an existing key reuses it", { skip }, async () => {
  const dir = scratch();
  try {
    const kf = path.join(dir, "k.jwk");
    assert.equal(await run(INIT(kf, "--write"), harness({ transport: fakeTransport() }).deps), 0);
    const before = fs.readFileSync(kf);
    const jwk = JSON.parse(before.toString());
    const transport = fakeTransport({ created: false });
    const h = harness({ transport });
    assert.equal(await run(INIT(kf, "--write"), h.deps), 0);
    assert.deepEqual(fs.readFileSync(kf), before);
    assert.deepEqual(JSON.parse(transport.calls[0].body).clientPublicKey, { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y });
    assert.match(h.text(), /registered: created false/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("refusals send nothing", { skip }, async () => {
  const dir = scratch();
  try {
    // parent dir mode 0755
    const loose = path.join(dir, "loose"); fs.mkdirSync(loose); fs.chmodSync(loose, 0o755);
    let t = fakeTransport();
    assert.equal(await run(INIT(path.join(loose, "k.jwk"), "--write"), harness({ transport: t }).deps), 2);
    assert.equal(t.calls.length, 0);
    assert.deepEqual(fs.readdirSync(loose), []);
    // inside a git work tree
    t = fakeTransport();
    assert.equal(await run(INIT(path.join(dir, "k.jwk"), "--write"), harness({ transport: t, git: () => true }).deps), 2);
    assert.equal(t.calls.length, 0);
    assert.ok(!fs.existsSync(path.join(dir, "k.jwk")));
    // parent missing
    t = fakeTransport();
    assert.equal(await run(INIT(path.join(dir, "nope", "k.jwk"), "--write"), harness({ transport: t }).deps), 2);
    // existing key with mode 0644
    const kf = path.join(dir, "e.jwk");
    await run(INIT(kf, "--write"), harness({ transport: fakeTransport() }).deps);
    fs.chmodSync(kf, 0o644);
    t = fakeTransport();
    assert.equal(await run(INIT(kf, "--write"), harness({ transport: t }).deps), 2);
    assert.equal(t.calls.length, 0);
    // http id origin, and a path on the origin
    t = fakeTransport();
    assert.equal(await run(INIT(kf, "--write", "--id-origin", "http://id.gilb.com"), harness({ transport: t }).deps), 2);
    assert.equal(await run(INIT(kf, "--id-origin", "https://id.gilb.com/base"), harness({ transport: t }).deps), 2);
    assert.equal(t.calls.length, 0);
    // missing --key-file is a wrong call
    assert.equal(await run(["init", "--name", "x", "--declared-origin", "https://x.example"], harness({ transport: t }).deps), 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("apex id origin warns", { skip }, async () => {
  const dir = scratch();
  try {
    const h = harness({ transport: fakeTransport() });
    assert.equal(await run(INIT(path.join(dir, "k.jwk"), "--id-origin", "https://gilb.com"), h.deps), 0);
    assert.match(h.text(), /apex/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("register 500 and token 401 are exit 4 with honest messages", { skip }, async () => {
  const dir = scratch();
  try {
    const kf = path.join(dir, "k.jwk");
    let h = harness({ transport: fakeTransport({ registerStatus: 500 }) });
    assert.equal(await run(INIT(kf, "--write"), h.deps), 4);
    assert.ok(fs.existsSync(kf));
    assert.ok(!fs.existsSync(`${kf}.client.json`));
    assert.match(h.text(), /key file .* exists; the register did not succeed/);
    h = harness({ transport: fakeTransport({ tokenStatus: 401 }) });
    assert.equal(await run(INIT(kf, "--write"), h.deps), 4);
    assert.match(h.text(), /registered .*first token failed \(HTTP 401\)/);
    assert.ok(fs.existsSync(`${kf}.client.json`));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a 401 on the verified request is exit 4 with the message, body never printed", { skip }, async () => {
  const dir = scratch();
  try {
    const kf = path.join(dir, "k.jwk");
    const h = harness({ transport: fakeTransport({ getStatus: 401 }) });
    assert.equal(await run(INIT(kf, "--write"), h.deps), 4);
    assert.match(h.text(), /registered, first token ok, but the verified request that makes the principal failed \(HTTP 401\); re-running init --write is safe/);
    assert.ok(!h.text().includes("principal: made"));
    assert.ok(!h.text().includes(BODY_MARKER));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("check prints scope and expires_in, never the token; refusal is exit 4", { skip }, async () => {
  const dir = scratch();
  try {
    const kf = path.join(dir, "k.jwk");
    await run(INIT(kf, "--write"), harness({ transport: fakeTransport() }).deps);
    const t = fakeTransport();
    const h = harness({ transport: t });
    assert.equal(await run(["check", "--key-file", kf], h.deps), 0);
    assert.match(h.text(), /token: ok \(scope base.write, expires_in 300\)/);
    assert.equal(new URLSearchParams(t.calls[0].body).get("scope"), "base.write");
    assert.ok(!h.text().includes(TOKEN));
    const h2 = harness({ transport: fakeTransport({ tokenStatus: 401 }) });
    assert.equal(await run(["check", "--key-file", kf, "--scope", "base.read"], h2.deps), 4);
    assert.match(h2.text(), /HTTP 401/);
    assert.equal(await run(["check", "--key-file", kf], harness({ transport: t }).deps), 0);
    assert.equal(await run(["check", "--key-file", path.join(dir, "none.jwk")], harness({ transport: t }).deps), 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("get prints status and content-type, never the body or token", { skip }, async () => {
  const dir = scratch();
  try {
    const kf = path.join(dir, "k.jwk");
    await run(INIT(kf, "--write"), harness({ transport: fakeTransport() }).deps);
    const t = fakeTransport({ getStatus: 404 });
    const h = harness({ transport: t });
    const url = "https://example.gilb.com/base/e/abc";
    assert.equal(await run(["get", "--key-file", kf, "--url", url], h.deps), 0);
    assert.equal(h.text(), `GET ${url} → 404 application/ld+json`);
    assert.ok(!h.text().includes(BODY_MARKER));
    const req = t.calls.at(-1);
    assert.equal(req.method, "GET");
    assert.equal(req.headers.Accept, "application/ld+json");
    assert.equal(req.headers.Authorization, `DPoP ${TOKEN}`);
    assert.ok(req.headers.DPoP);
    assert.equal(await run(["get", "--key-file", kf, "--url", "http://x.example/"], harness({ transport: t }).deps), 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
