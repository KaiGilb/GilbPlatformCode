// @vitest-environment node
// Pairing secrets that survive a bridge restart: kept hashed, bound to the origin, sliding expiry, capped, revocable.
import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBridge, parseCli, unpairAll, PAIRING_TTL_MS } from "../bridge/bridge.mjs";

const A = "http://localhost:5197";
const B = "https://app.example.test";
const EVIL = "https://evil.example";
const DAY = 24 * 60 * 60 * 1000;

let dir;
const open = [];
let clock;

function mk(extra = {}) {
  dir ??= fs.mkdtempSync(path.join(os.tmpdir(), "pair-persist-"));
  const b = createBridge({
    port: 0,
    claudeBin: "unused",
    allowedOrigins: [A, B, EVIL],
    workDir: path.join(dir, "work"),
    pairingsFile: path.join(dir, "state", "pairings.json"),
    now: () => clock,
    controlToken: "c".repeat(64),
    ...extra,
  });
  open.push(b);
  return b;
}
const url = (b, p) => `http://127.0.0.1:${b.port}${p}`;
async function pair(b, origin, extra = {}) {
  const res = await fetch(url(b, "/v1/pair"), {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify({ code: b.pairingCode, ...extra }),
  });
  return { res, body: await res.json() };
}
const check = (b, secret, origin) =>
  fetch(url(b, "/v1/check"), { method: "POST", headers: { "x-bridge-secret": secret, ...(origin ? { origin } : {}) } }).then((r) => r.status);
const file = () => path.join(dir, "state", "pairings.json");

afterEach(async () => {
  for (const b of open.splice(0)) await b.close().catch(() => {});
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("persisted pairings", () => {
  it("a secret survives a simulated bridge restart", async () => {
    clock = 1_000_000;
    const b1 = mk();
    await b1.start();
    const { body } = await pair(b1, A);
    expect(await check(b1, body.secret, A)).toBe(200);
    await b1.close();
    const b2 = mk();
    await b2.start();
    expect(b2.pairingCount).toBe(1);
    expect(await check(b2, body.secret, A)).toBe(200);
  });

  it("the file holds only a hash (never the secret), with mode 0600 in a 0700 folder", async () => {
    clock = 1_000_000;
    const b = mk();
    await b.start();
    const { body } = await pair(b, A, { principalHash: "a".repeat(64) });
    const text = fs.readFileSync(file(), "utf8");
    expect(text).not.toContain(body.secret);
    const row = JSON.parse(text).pairings[0];
    expect(row.hash).toBe(crypto.createHash("sha256").update(body.secret).digest("hex"));
    expect(row).toMatchObject({ origin: A, principalHash: "a".repeat(64), issued: clock });
    expect(fs.statSync(file()).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(file())).mode & 0o777).toBe(0o700);
    expect(fs.readdirSync(path.dirname(file()))).toEqual(["pairings.json"]); // no temp file left behind
  });

  it("a bad principalHash is dropped, not stored", async () => {
    clock = 1;
    const b = mk();
    await b.start();
    await pair(b, A, { principalHash: "not-a-hash" });
    expect(JSON.parse(fs.readFileSync(file(), "utf8")).pairings[0].principalHash).toBeNull();
  });

  it("a secret is refused from any origin but the one it was issued to (also after a restart)", async () => {
    clock = 1_000_000;
    const b1 = mk();
    await b1.start();
    const { body } = await pair(b1, A);
    await b1.close();
    const b2 = mk();
    await b2.start();
    expect(await check(b2, body.secret, EVIL)).toBe(401);
    expect(await check(b2, body.secret, B)).toBe(401);
    expect(await check(b2, body.secret, undefined)).toBe(401); // no Origin: not a page of A
    expect(await check(b2, body.secret, A)).toBe(200);
  });

  it("an expired pairing is refused, and not loaded after a restart", async () => {
    clock = 1_000_000;
    const b1 = mk();
    await b1.start();
    const { body } = await pair(b1, A);
    clock += PAIRING_TTL_MS + 1;
    expect(await check(b1, body.secret, A)).toBe(401);
    await b1.close();
    const b2 = mk();
    await b2.start();
    expect(b2.pairingCount).toBe(0);
    expect(await check(b2, body.secret, A)).toBe(401);
  });

  it("expiry slides: use inside the window keeps it alive past 30 days since issue", async () => {
    clock = 1_000_000;
    const b = mk();
    await b.start();
    const { body } = await pair(b, A);
    for (let i = 0; i < 4; i++) {
      clock += 20 * DAY;
      expect(await check(b, body.secret, A)).toBe(200);
    }
    clock += 31 * DAY;
    expect(await check(b, body.secret, A)).toBe(401);
  });

  it("the last use is written to disk (at most once a minute) so a restart keeps the slide", async () => {
    clock = 1_000_000;
    const b1 = mk();
    await b1.start();
    const { body } = await pair(b1, A);
    clock += 20 * DAY;
    await check(b1, body.secret, A);
    expect(JSON.parse(fs.readFileSync(file(), "utf8")).pairings[0].lastUsed).toBe(clock);
    await b1.close();
    clock += 20 * DAY; // 40 days since issue, 20 since last use
    const b2 = mk();
    await b2.start();
    expect(await check(b2, body.secret, A)).toBe(200);
  });

  it("revoke (/v1/unpair) kills the secret now and after a restart; other pairings stay", async () => {
    clock = 1_000_000;
    const b1 = mk();
    await b1.start();
    const one = (await pair(b1, A)).body.secret;
    const two = (await pair(b1, B)).body.secret;
    const r = await fetch(url(b1, "/v1/unpair"), { method: "POST", headers: { "x-bridge-secret": one, origin: A } });
    expect(r.status).toBe(200);
    expect(await check(b1, one, A)).toBe(401);
    await b1.close();
    const b2 = mk();
    await b2.start();
    expect(await check(b2, one, A)).toBe(401);
    expect(await check(b2, two, B)).toBe(200);
  });

  it("another origin cannot revoke a secret it does not own", async () => {
    clock = 1;
    const b = mk();
    await b.start();
    const s = (await pair(b, A)).body.secret;
    const r = await fetch(url(b, "/v1/unpair"), { method: "POST", headers: { "x-bridge-secret": s, origin: EVIL } });
    expect(r.status).toBe(401);
    expect(await check(b, s, A)).toBe(200);
  });

  it("the number of stored pairings is capped: the least recently used go first", async () => {
    clock = 1_000;
    const b = mk({ maxPairings: 3 });
    await b.start();
    const secrets = [];
    for (let i = 0; i < 4; i++) {
      clock += 1000;
      secrets.push((await pair(b, A)).body.secret);
    }
    expect(b.pairingCount).toBe(3);
    expect(await check(b, secrets[0], A)).toBe(401);
    expect(await check(b, secrets[3], A)).toBe(200);
    expect(JSON.parse(fs.readFileSync(file(), "utf8")).pairings).toHaveLength(3);
  });

  it("a damaged or hostile file loads as nobody paired; the bridge still starts and pairs", async () => {
    clock = 1;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pair-persist-"));
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    for (const junk of ["{{{", "[]", '{"pairings":"x"}', '{"pairings":[{"hash":"zz","issued":1,"lastUsed":1},null,5]}']) {
      fs.writeFileSync(file(), junk);
      const b = mk();
      await b.start();
      expect(b.pairingCount).toBe(0);
      expect((await pair(b, A)).res.status).toBe(200);
      await b.close();
    }
  });

  it("a lastUsed in the future (or not finite) cannot make a pairing immortal; an oversized file loads as nobody", async () => {
    clock = 1_000_000;
    const b1 = mk();
    await b1.start();
    const { body } = await pair(b1, A);
    await b1.close();
    const f = JSON.parse(fs.readFileSync(file(), "utf8"));
    f.pairings[0].lastUsed = clock + 400 * DAY;
    fs.writeFileSync(file(), JSON.stringify(f));
    const b2 = mk();
    await b2.start();
    expect(await check(b2, body.secret, A)).toBe(200);
    clock += PAIRING_TTL_MS + 1000; // clamped to the load time, so it still expires 30 days later
    expect(await check(b2, body.secret, A)).toBe(401);
    await b2.close();
    fs.writeFileSync(file(), " ".repeat(2 * 1024 * 1024));
    const b4 = mk();
    await b4.start();
    expect(b4.pairingCount).toBe(0);
  });

  it("pairing code stays single use and five wrong guesses still burn it", async () => {
    clock = 1;
    const b = mk();
    await b.start();
    const code = b.pairingCode;
    expect((await pair(b, A)).res.status).toBe(200);
    expect(b.pairingCode).not.toBe(code);
    const burnable = b.pairingCode;
    for (let i = 0; i < 5; i++) {
      await fetch(url(b, "/v1/pair"), { method: "POST", headers: { "content-type": "application/json", origin: A }, body: JSON.stringify({ code: "ZZZ-ZZZ" }) });
    }
    expect(b.pairingCode).not.toBe(burnable);
  });

  it("without a file the bridge keeps pairings in memory only (as before)", async () => {
    clock = 1;
    const b = mk({ pairingsFile: undefined });
    await b.start();
    const s = (await pair(b, A)).body.secret;
    expect(await check(b, s, A)).toBe(200);
    expect(fs.existsSync(file())).toBe(false);
  });
});

describe("--unpair-all", () => {
  const T = "c".repeat(64);
  it("is a CLI mode", () => {
    expect(parseCli(["--unpair-all"]).mode).toBe("unpairAll");
  });

  it("a running bridge is told over the control door (token required, never a browser)", async () => {
    clock = 1;
    const b = mk();
    await b.start();
    const s = (await pair(b, A)).body.secret;
    const post = (h) => fetch(url(b, "/control/unpair-all"), { method: "POST", headers: h });
    expect((await post({})).status).toBe(401);
    expect((await post({ "x-bridge-control": T, origin: A })).status).toBe(403);
    expect((await fetch(url(b, "/control/unpair-all"), { headers: { "x-bridge-control": T } })).status).toBe(403);
    expect(await check(b, s, A)).toBe(200);
    const ok = await post({ "x-bridge-control": T });
    expect(await ok.json()).toEqual({ removed: 1 });
    expect(await check(b, s, A)).toBe(401);
    expect(JSON.parse(fs.readFileSync(file(), "utf8")).pairings).toEqual([]);
  });

  it("with no bridge running, the file is emptied", async () => {
    clock = 1;
    const b = mk();
    await b.start();
    const s = (await pair(b, A)).body.secret;
    await b.close();
    const out = await unpairAll({ stateDir: path.join(dir, "state"), label: "x" }, { home: dir });
    expect(out).toMatchObject({ ok: true, message: expect.stringContaining("Removed 1 pairing") });
    const b2 = mk();
    await b2.start();
    expect(await check(b2, s, A)).toBe(401);
  });
});
