// @vitest-environment node
// publish: a fake fetch and a temp HOME. No network.
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISH_MAX_BYTES, PUBLISH_MAX_FILES, publishCommand } from "../connector/gilb-connector.mjs";

const MJS = fileURLToPath(new URL("../connector/gilb-connector.mjs", import.meta.url));
const NAME = "my-app";
const ORIGIN = "https://door.example";
const WORKER = "https://ingest.example.workers.dev";
const ACCESS = "access-token-pub-SECRET-value";
const TICKET = "ticket-secret-value-xyz";
const CLIENT = "client-pub-1";
const HTML = "<!doctype html><p>hi</p>";
const NO_WORKER = "This platform did not say where to upload. Pass --worker-url.";

const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempEnv(extra = {}) {
  const home = mkdtempSync(join(tmpdir(), "gilb-pub-home-"));
  dirs.push(home);
  return {
    home,
    env: {
      PATH: process.env.PATH,
      HOME: home,
      GILB_HOME: home,
      GILB_CONNECTOR_HOME: join(home, ".gilb-connector"),
      ...extra,
    },
  };
}

function siteDir(files = { "index.html": HTML }) {
  const dir = mkdtempSync(join(tmpdir(), "gilb-pub-site-"));
  dirs.push(dir);
  for (const [name, data] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  }
  return dir;
}

function keyPath(home) {
  return join(home, ".gilb-connector", "publish", `${NAME}.jwk`);
}

function jsonResponse(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}

function headerRecord(init) {
  const out = {};
  const headers = init?.headers;
  if (!headers) return out;
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  for (const [key, value] of Object.entries(headers)) out[key.toLowerCase()] = String(value);
  return out;
}

function scriptedFetch(handlers = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const raw = typeof init.body === "string" ? init.body : "";
    let json = null;
    if (raw) {
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }
    }
    const rec = { url: String(url), method: String(init.method ?? "GET"), headers: headerRecord(init), json, raw };
    calls.push(rec);
    const path = new URL(rec.url).pathname;
    if (path === "/base/client/register") return jsonResponse(200, { clientId: CLIENT });
    if (path === "/base/oauth/token") return jsonResponse(200, { access_token: ACCESS, expires_in: 3600, scope: "base.write" });
    if (path === "/base/e/first-use") return new Response(null, { status: 204 });
    if (path === "/base/publish/ticket") return (handlers.ticket ?? (() => jsonResponse(500, { error: "missing" })))(rec);
    if (path === "/publish") return (handlers.upload ?? (() => jsonResponse(500, { error: "missing" })))(rec);
    return jsonResponse(404, { error: "no such door", message: "no such door" });
  };
  return { calls, fetchImpl };
}

function ticketOf(fields = {}) {
  return {
    ticket: TICKET,
    expiresAt: "2030-01-01T00:00:00.000Z",
    kind: "app",
    siteName: NAME,
    maxFiles: PUBLISH_MAX_FILES,
    maxBytes: PUBLISH_MAX_BYTES,
    workerUrl: WORKER,
    ...fields,
  };
}

function liveUpload() {
  return jsonResponse(200, {
    url: `https://${NAME}.pages.dev`,
    admittedOrigin: "https://admitted.example",
    siteState: "t:SiteStateLive",
    ticket: TICKET,
  });
}

function captureProcess() {
  const chunks = [];
  const origErr = process.stderr.write.bind(process.stderr);
  const origOut = process.stdout.write.bind(process.stdout);
  const wrap = (chunk, enc, cb) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    const done = typeof enc === "function" ? enc : cb;
    if (typeof done === "function") done();
    return true;
  };
  process.stderr.write = wrap;
  process.stdout.write = wrap;
  return {
    text: () => chunks.join(""),
    restore() {
      process.stderr.write = origErr;
      process.stdout.write = origOut;
    },
  };
}

async function run(argv, env, fetchImpl) {
  const stdout = [];
  const stderr = [];
  const cap = captureProcess();
  try {
    const code = await publishCommand(argv, {
      env,
      fetchImpl,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });
    return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n"), processText: cap.text() };
  } finally {
    cap.restore();
  }
}

function args(dir, extra = []) {
  return ["--dir", dir, "--name", NAME, "--origin", ORIGIN, ...extra];
}

function uploads(calls) {
  return calls.filter((call) => new URL(call.url).pathname === "/publish");
}

function tickets(calls) {
  return calls.filter((call) => new URL(call.url).pathname === "/base/publish/ticket");
}

function jwtPayload(jwt) {
  const parts = jwt.split(".");
  expect(parts).toHaveLength(3);
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

function assertClean(text, secrets) {
  for (const [label, secret] of Object.entries(secrets)) {
    if (typeof secret === "string" && secret !== "") expect(text.includes(secret), label).toBe(false);
  }
}

describe("publish", () => {
  it("dry-run lists the folder and makes no request", async () => {
    const { home, env } = tempEnv();
    const dir = siteDir({ "index.html": HTML, "app.js": "console.log(1)", "assets/.DS_Store": "junk" });
    const { calls, fetchImpl } = scriptedFetch({ ticket: () => liveUpload(), upload: () => liveUpload() });
    const result = await run(["--dir", dir, "--name", NAME, "--dry-run"], env, fetchImpl);
    expect(result.code).toBe(0);
    expect(calls).toHaveLength(0);
    expect(result.stdout).toContain("dry-run (no network call)");
    expect(result.stdout).toContain("site: my-app");
    expect(result.stdout).toContain(`address: https://${NAME}.pages.dev`);
    expect(result.stdout).toContain("kind: app");
    expect(result.stdout).toContain("files: 2");
    expect(result.stdout).toContain(`bytes: ${HTML.length + "console.log(1)".length}`);
    expect(result.stdout).toContain("skipped: assets/.DS_Store");
    expect(existsSync(keyPath(home))).toBe(false);
    expect(result.stdout).not.toContain(TICKET);
  });

  it("publish asks for a ticket with DPoP and uploads to the ticket workerUrl", async () => {
    const { home, env } = tempEnv();
    const dir = siteDir();
    const { calls, fetchImpl } = scriptedFetch({
      ticket: () => jsonResponse(200, ticketOf({ workerUrl: WORKER })),
      upload: () => liveUpload(),
    });
    const result = await run(args(dir, ["--worker-url", "https://other.example.workers.dev"]), env, fetchImpl);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`https://${NAME}.pages.dev\nt:SiteStateLive`);
    expect(result.stdout).not.toContain("admitted.example");
    const ticket = tickets(calls);
    expect(ticket).toHaveLength(1);
    expect(ticket[0].url).toBe(`${ORIGIN}/base/publish/ticket`);
    expect(ticket[0].method).toBe("POST");
    expect(ticket[0].json).toEqual({ kind: "app", siteName: NAME });
    expect(ticket[0].headers.authorization).toBe(`DPoP ${ACCESS}`);
    expect(ticket[0].headers["content-type"]).toContain("application/json");
    const proof = jwtPayload(ticket[0].headers.dpop);
    expect(proof.htm).toBe("POST");
    expect(proof.htu).toBe(`${ORIGIN}/base/publish/ticket`);
    expect(proof.ath).toBe(createHash("sha256").update(ACCESS).digest("base64url"));
    const upload = uploads(calls);
    expect(upload).toHaveLength(1);
    expect(calls.indexOf(upload[0])).toBeGreaterThan(calls.indexOf(ticket[0]));
    expect(upload[0].url).toBe(`${WORKER}/publish`);
    expect(upload[0].headers.authorization).toBeUndefined();
    expect(upload[0].headers.dpop).toBeUndefined();
    expect(upload[0].json.ticket).toBe(TICKET);
    expect(upload[0].json.files).toEqual([{ path: "index.html", contentBase64: Buffer.from(HTML).toString("base64") }]);
    const jwk = JSON.parse(readFileSync(keyPath(home), "utf8"));
    expect(upload[0].json.clientPublicKey).toEqual({ kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y });
    expect(upload[0].json.clientPublicKey).not.toHaveProperty("d");
    expect(upload[0].raw.includes(jwk.d)).toBe(false);
    assertClean(`${result.stdout}\n${result.stderr}\n${result.processText}`, {
      ticket: TICKET,
      access: ACCESS,
      dpop: ticket[0].headers.dpop,
      authorization: ticket[0].headers.authorization,
      d: jwk.d,
      x: jwk.x,
      y: jwk.y,
    });
  });

  it("a ticket without workerUrl and no flag says to pass --worker-url and does not upload", async () => {
    const { env } = tempEnv();
    const dir = siteDir();
    const body = ticketOf();
    delete body.workerUrl;
    const { calls, fetchImpl } = scriptedFetch({
      ticket: () => jsonResponse(200, body),
      upload: () => liveUpload(),
    });
    const result = await run(args(dir), env, fetchImpl);
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(NO_WORKER);
    expect(tickets(calls)).toHaveLength(1);
    expect(uploads(calls)).toHaveLength(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(TICKET);
  });

  it("uses --worker-url when the ticket does not name one", async () => {
    const { env } = tempEnv();
    const dir = siteDir();
    const body = ticketOf();
    delete body.workerUrl;
    const flag = "https://from-flag.example.workers.dev";
    const { calls, fetchImpl } = scriptedFetch({
      ticket: () => jsonResponse(200, body),
      upload: () => liveUpload(),
    });
    const result = await run(args(dir, ["--worker-url", flag]), env, fetchImpl);
    expect(result.code).toBe(0);
    expect(uploads(calls)).toHaveLength(1);
    expect(uploads(calls)[0].url).toBe(`${flag}/publish`);
  });

  it.each([
    ["https://upload.example.net"],
    ["https://workers.dev"],
    ["https://notworkers.dev"],
    ["https://evil.workers.dev.example.net"],
    ["http://127.0.0.1:9"],
    ["http://localhost:9"],
  ])("refuses the worker URL %s before any request", async (worker) => {
    const { env } = tempEnv();
    const dir = siteDir();
    const { calls, fetchImpl } = scriptedFetch({
      ticket: () => jsonResponse(200, ticketOf()),
      upload: () => liveUpload(),
    });
    const result = await run(args(dir, ["--worker-url", worker]), env, fetchImpl);
    expect(result.code).toBe(2);
    expect(calls).toHaveLength(0);
    expect(result.stderr).toContain("workers.dev");
  });

  it("a ticket worker URL that is not a workers.dev host is refused and not uploaded", async () => {
    const { env } = tempEnv();
    const dir = siteDir();
    const { calls, fetchImpl } = scriptedFetch({
      ticket: () => jsonResponse(200, ticketOf({ workerUrl: "https://upload.example.net" })),
      upload: () => liveUpload(),
    });
    const result = await run(args(dir), env, fetchImpl);
    expect(result.code).toBe(2);
    expect(tickets(calls)).toHaveLength(1);
    expect(uploads(calls)).toHaveLength(0);
    expect(result.stderr).toContain("workers.dev");
    expect(result.stderr).not.toContain(TICKET);
  });

  it("allows an http loopback worker only when GILB_PUBLISH_ALLOW_LOCAL=1", async () => {
    const blocked = tempEnv();
    const dir = siteDir();
    const local = "http://127.0.0.1:8765";
    const blockedFetch = scriptedFetch({ ticket: () => jsonResponse(200, ticketOf()), upload: () => liveUpload() });
    const refused = await run(args(dir, ["--worker-url", local]), blocked.env, blockedFetch.fetchImpl);
    expect(refused.code).toBe(2);
    expect(blockedFetch.calls).toHaveLength(0);

    const allowed = tempEnv({ GILB_PUBLISH_ALLOW_LOCAL: "1" });
    const body = ticketOf();
    delete body.workerUrl;
    const { calls, fetchImpl } = scriptedFetch({
      ticket: () => jsonResponse(200, body),
      upload: () => liveUpload(),
    });
    const result = await run(args(dir, ["--worker-url", local]), allowed.env, fetchImpl);
    expect(result.code).toBe(0);
    expect(uploads(calls)[0].url).toBe(`${local}/publish`);
  });

  it("the app key is created mode 0600 once and reused after a refused ticket", async () => {
    const { home, env } = tempEnv();
    const dir = siteDir();
    const first = scriptedFetch({
      ticket: (rec) => jsonResponse(403, { error: "not_entitled", message: `Publishing is for paying builders. ${rec.headers.authorization}` }),
      upload: () => liveUpload(),
    });
    const refused = await run(args(dir), env, first.fetchImpl);
    expect(refused.code).toBe(3);
    expect(uploads(first.calls)).toHaveLength(0);
    const file = keyPath(home);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, ".gilb-connector", "publish")).mode & 0o777).toBe(0o700);
    const before = readFileSync(file);
    const stamp = statSync(file).mtimeMs;
    const saved = JSON.parse(before.toString("utf8"));
    expect(saved.d).toEqual(expect.any(String));
    expect(refused.stderr).toContain("not_entitled");
    expect(refused.stderr).toContain("Publishing is for paying builders.");
    assertClean(`${refused.stdout}\n${refused.stderr}\n${refused.processText}`, {
      access: ACCESS,
      authorization: first.calls.find((call) => call.url.endsWith("/ticket"))?.headers.authorization,
      d: saved.d,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const second = scriptedFetch({
      ticket: () => jsonResponse(200, ticketOf()),
      upload: () => liveUpload(),
    });
    const again = await run(args(dir), env, second.fetchImpl);
    expect(again.code).toBe(0);
    expect(readFileSync(file).equals(before)).toBe(true);
    expect(statSync(file).mtimeMs).toBe(stamp);
    expect(uploads(second.calls)[0].json.clientPublicKey).toEqual({ kty: "EC", crv: "P-256", x: saved.x, y: saved.y });
    expect(uploads(second.calls)[0].raw.includes(saved.d)).toBe(false);
  });

  it.each([
    [403, "not_entitled", "Publishing is for paying builders, and this account has no active subscription on record."],
    [409, "site_name_unavailable", "This site name is not held by this account."],
    [429, "too_many_tickets", "You have asked for 6 publish tickets in the last 10 minutes. Wait a few minutes and try again."],
  ])("shows the platform refusal %s %s", async (status, error, message) => {
    const { env } = tempEnv();
    const dir = siteDir();
    const { calls, fetchImpl } = scriptedFetch({
      ticket: (rec) => jsonResponse(status, { error, message: `${message} ${rec.headers.dpop}` }),
      upload: () => liveUpload(),
    });
    const result = await run(args(dir), env, fetchImpl);
    expect(result.code).toBe(3);
    expect(result.stderr).toContain(`${error}: ${message}`);
    expect(uploads(calls)).toHaveLength(0);
    const proof = tickets(calls)[0]?.headers.dpop ?? "";
    assertClean(`${result.stdout}\n${result.stderr}\n${result.processText}`, { dpop: proof, access: ACCESS });
  });

  it("a worker refusal does not print the ticket", async () => {
    const { env } = tempEnv();
    const dir = siteDir();
    const { calls, fetchImpl } = scriptedFetch({
      ticket: () => jsonResponse(200, ticketOf()),
      upload: () => jsonResponse(422, { error: "files_refused", message: `The file is not allowed. ${TICKET}` }),
    });
    const result = await run(args(dir), env, fetchImpl);
    expect(result.code).toBe(4);
    expect(result.stderr).toContain("files_refused: The file is not allowed.");
    expect(uploads(calls)).toHaveLength(1);
    assertClean(`${result.stdout}\n${result.stderr}\n${result.processText}`, { ticket: TICKET, access: ACCESS });
  });

  it("a worker 500 says nothing was admitted and does not print the ticket", async () => {
    const { env } = tempEnv();
    const dir = siteDir();
    const { fetchImpl } = scriptedFetch({
      ticket: () => jsonResponse(200, ticketOf()),
      upload: () => jsonResponse(502, { error: "hosting_failed", message: `The host failed. ${TICKET}` }),
    });
    const result = await run(args(dir), env, fetchImpl);
    expect(result.code).toBe(4);
    expect(result.stderr).toContain("Nothing was admitted unless the message says so; ask for a new ticket (re-run)");
    assertClean(`${result.stdout}\n${result.stderr}\n${result.processText}`, { ticket: TICKET });
  });

  it("a folder over the byte limit or the file limit is refused before any request", async () => {
    const { env } = tempEnv();
    const big = siteDir({ "index.html": Buffer.alloc(PUBLISH_MAX_BYTES + 1) });
    const bigFetch = scriptedFetch({ ticket: () => jsonResponse(200, ticketOf()), upload: () => liveUpload() });
    const overBytes = await run(args(big), env, bigFetch.fetchImpl);
    expect(overBytes.code).toBe(2);
    expect(bigFetch.calls).toHaveLength(0);
    expect(overBytes.stderr).toContain("bytes");

    const many = siteDir();
    for (let i = 0; i < PUBLISH_MAX_FILES; i++) writeFileSync(join(many, `f${i}.txt`), "x");
    const manyFetch = scriptedFetch({ ticket: () => jsonResponse(200, ticketOf()), upload: () => liveUpload() });
    const overFiles = await run(args(many), env, manyFetch.fetchImpl);
    expect(overFiles.code).toBe(2);
    expect(manyFetch.calls).toHaveLength(0);
    expect(overFiles.stderr).toContain("files");
  });

  it("a file at the byte limit is not a local refusal", async () => {
    const { env } = tempEnv();
    const dir = siteDir({ "index.html": Buffer.alloc(PUBLISH_MAX_BYTES) });
    const { calls, fetchImpl } = scriptedFetch();
    const result = await run(["--dir", dir, "--name", NAME, "--dry-run"], env, fetchImpl);
    expect(result.code).toBe(0);
    expect(calls).toHaveLength(0);
    expect(result.stdout).toContain(`bytes: ${PUBLISH_MAX_BYTES}`);
  });

  it("a symlink that escapes the folder is refused before any request", async () => {
    const { env } = tempEnv();
    const dir = siteDir();
    const outside = mkdtempSync(join(tmpdir(), "gilb-pub-outside-"));
    dirs.push(outside);
    writeFileSync(join(outside, "secret.txt"), "CANARY-OUTSIDE-FILE");
    symlinkSync(join(outside, "secret.txt"), join(dir, "leak.txt"));
    const { calls, fetchImpl } = scriptedFetch({ ticket: () => jsonResponse(200, ticketOf()), upload: () => liveUpload() });
    const result = await run(args(dir), env, fetchImpl);
    expect(result.code).toBe(2);
    expect(calls).toHaveLength(0);
    expect(result.stderr).toMatch(/symlink/);
    expect(result.stderr).not.toContain("CANARY-OUTSIDE-FILE");
  });

  it("a folder that is itself a symlink is refused before any request", async () => {
    const { env } = tempEnv();
    const real = siteDir();
    const linkParent = mkdtempSync(join(tmpdir(), "gilb-pub-link-"));
    dirs.push(linkParent);
    const link = join(linkParent, "linked");
    symlinkSync(real, link);
    const { calls, fetchImpl } = scriptedFetch({ ticket: () => jsonResponse(200, ticketOf()), upload: () => liveUpload() });
    const result = await run(args(link), env, fetchImpl);
    expect(result.code).toBe(2);
    expect(calls).toHaveLength(0);
    expect(result.stderr).toMatch(/symlink/);
  });

  it("a tighter ticket limit does not upload", async () => {
    const { env } = tempEnv();
    const dir = siteDir();
    const { calls, fetchImpl } = scriptedFetch({
      ticket: () => jsonResponse(200, ticketOf({ maxBytes: 1 })),
      upload: () => liveUpload(),
    });
    const result = await run(args(dir), env, fetchImpl);
    expect(result.code).toBe(2);
    expect(tickets(calls)).toHaveLength(1);
    expect(uploads(calls)).toHaveLength(0);
    expect(result.stderr).toContain("a new ticket is needed");
  });

  it("--kind website sends no app key", async () => {
    const { home, env } = tempEnv();
    const dir = siteDir();
    const { calls, fetchImpl } = scriptedFetch({
      ticket: () => jsonResponse(200, ticketOf({ kind: "website" })),
      upload: () => liveUpload(),
    });
    const result = await run(args(dir, ["--kind", "website"]), env, fetchImpl);
    expect(result.code).toBe(0);
    expect(tickets(calls)[0].json).toEqual({ kind: "website", siteName: NAME });
    expect(uploads(calls)[0].json.clientPublicKey).toBeUndefined();
    expect(existsSync(keyPath(home))).toBe(false);
    expect(result.stdout).toBe(`https://${NAME}.pages.dev\nt:SiteStateLive`);
  });

  it("publish --help prints the command and does not call the network", async () => {
    const { env } = tempEnv();
    const { calls, fetchImpl } = scriptedFetch();
    const result = await run(["--help"], env, fetchImpl);
    expect(result.code).toBe(0);
    expect(calls).toHaveLength(0);
    expect(result.stdout).toContain("publish --dir");
    expect(result.stdout).toContain("pages.dev");
    expect(result.stdout).toContain("signed in once");
  });

  it("the built file runs publish --help", () => {
    const r = spawnSync(process.execPath, [realpathOr(MJS), "publish", "--help"], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("publish --dir");
    expect(r.stdout).toContain("pages.dev");
  });
});

function realpathOr(file) {
  // macOS tmp is a symlink; the connector runs main only when argv[1] matches its own URL.
  return realpathSync(file);
}
