// @vitest-environment node
// The Connected AI sign-in, against a local stand-in door. No network.
// Streams are scanned for secrets. A failure says which kind leaked, not the value.
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey, randomBytes, verify as cryptoVerify } from "node:crypto";
import http from "node:http";
import { PassThrough } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_DECLARED_ORIGIN, DEFAULT_AI_PROFILE, parseCli, startConnector } from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const MJS = fileURLToPath(new URL("../connector/gilb-connector.mjs", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const TURN = "turn-ai-1104";
const HOP_A = "0123456789abcdef01234567";
const CLIENT_ID = "agent-client-fixed";
const SENTENCE = (id) =>
  `This AI is not connected to a vault yet. In GilbApp: open your vault → Connect AI → Mint AI vault (any name) → paste this Agent client id: ${id} → Bind AI. Then grant the AI vault Read and Write on the vaults it should work in. Then call any tool again.`;
const SCOPE_LINE =
  "The platform refused scope base.write, so this AI is using base.read. Writes will be refused until the platform accepts base.write.";
const COMPUTER_SENTENCE =
  "This computer is not connected to GilbPlatform yet. Run: gilb-computer add — approve it once in GilbApp — then restart Claude Code.";

const closers = [];
const dirs = [];
const opened = [];
const procs = [];
const restores = [];

afterEach(async () => {
  for (const restore of restores.splice(0)) restore();
  const boxes = opened.splice(0);
  for (const box of boxes) box.session.close();
  const stop = Promise.all(boxes.map((box) => box.session.done));
  const timed = new Promise((_, reject) => setTimeout(() => reject(new Error("session did not stop")), 8000));
  await Promise.race([stop, timed]);
  for (const box of boxes) {
    box.input.destroy();
    box.output.destroy();
  }
  for (const close of closers.splice(0)) await close();
  for (const proc of procs.splice(0)) {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGTERM");
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "gilb-ai-"));
  dirs.push(dir);
  return dir;
}

function captureStderr() {
  const chunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, encoding, cb) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    const done = typeof encoding === "function" ? encoding : cb;
    if (typeof done === "function") done();
    return true;
  };
  const restore = () => {
    process.stderr.write = orig;
  };
  restores.push(restore);
  return { text: () => chunks.join(""), restore };
}

function modeOf(file) {
  return statSync(file).mode & 0o777;
}

function decodeJwt(jwt) {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")),
      payload: JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")),
      signingInput: `${parts[0]}.${parts[1]}`,
      sig: Buffer.from(parts[2], "base64url"),
    };
  } catch {
    return null;
  }
}

function signatureOk(jwt, publicKey) {
  const decoded = decodeJwt(jwt);
  if (!decoded) return false;
  return cryptoVerify("sha256", Buffer.from(decoded.signingInput), { key: publicKey, dsaEncoding: "ieee-p1363" }, decoded.sig);
}

function athOf(token) {
  return createHash("sha256").update(token).digest("base64url");
}

function httpsPath(origin, path) {
  const url = new URL(origin);
  return `https://${url.host}${path}`;
}

function leaked(text, secret) {
  return secret.length > 0 && text.includes(secret);
}

function assertClean(text, secrets, where) {
  const pem = secrets.pem ?? "";
  for (const line of pem.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length >= 40) expect(leaked(text, trimmed), `private key appeared on ${where}`).toBe(false);
  }
  if (pem) expect(leaked(text, pem), `private key appeared on ${where}`).toBe(false);
  for (const token of secrets.tokens) expect(leaked(text, token), `access session appeared on ${where}`).toBe(false);
  for (const proof of secrets.proofs) expect(leaked(text, proof), `proof appeared on ${where}`).toBe(false);
  for (const assertion of secrets.assertions) expect(leaked(text, assertion), `client assertion appeared on ${where}`).toBe(false);
}

function listen(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const type = String(req.headers["content-type"] ?? "");
    let body = {};
    if (type.includes("application/x-www-form-urlencoded")) body = Object.fromEntries(new URLSearchParams(raw));
    else {
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { raw };
      }
    }
    const rec = {
      method: req.method,
      url: req.url ?? "",
      body,
      authorization: typeof req.headers.authorization === "string" ? req.headers.authorization : "",
      dpop: typeof req.headers.dpop === "string" ? req.headers.dpop : "",
    };
    requests.push(rec);
    try {
      const reply = (await handler(rec, requests)) ?? { status: 404, body: { error: "no such door" } };
      res.writeHead(reply.status ?? 200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body ?? {}));
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "the test platform failed" }));
    }
  });
  server.requestTimeout = 0;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      const close = () => new Promise((done) => server.close(() => done()));
      closers.push(close);
      resolve({ origin: `http://127.0.0.1:${port}`, requests, close });
    });
  });
}

function connect(opts) {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  const pending = new Map();
  let buf = "";
  let raw = "";
  output.setEncoding("utf8");
  output.on("data", (chunk) => {
    raw += chunk;
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      lines.push(msg);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  const session = startConnector({
    input,
    output,
    turnId: TURN,
    claudeBin: FAKE_CLAUDE,
    as: "ai",
    ...opts,
  });
  opened.push({ session, input, output });
  let nextId = 1;
  function request(method, params, id = nextId++) {
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer for ${method} #${id}`)), 8000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
    input.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return result;
  }
  return { session, request, lines, stdout: () => raw };
}

function toolText(msg) {
  return msg.result.content[0].text;
}

function door(opts = {}) {
  const secrets = { pem: "", tokens: [], proofs: [], assertions: [] };
  let writeRefused = false;
  let context401s = opts.context401s ?? 0;
  const seenFirstUse = { ok: false };
  const handler = async (rec) => {
    if (rec.authorization) secrets.tokens.push(rec.authorization.replace(/^DPoP\s+/i, ""));
    if (rec.dpop) secrets.proofs.push(rec.dpop);
    if (typeof rec.body.client_assertion === "string") secrets.assertions.push(rec.body.client_assertion);
    if (rec.url.endsWith("/base/client/register")) {
      expect(Object.keys(rec.body).sort()).toEqual(["clientDisplayName", "clientPublicKey", "declaredOrigin"]);
      expect(rec.body.declaredOrigin).toBe(AI_DECLARED_ORIGIN);
      expect(rec.body.clientPublicKey.d).toBeUndefined();
      expect(JSON.stringify(rec.body)).not.toMatch(/"d"\s*:/);
      return { status: 200, body: { clientId: CLIENT_ID, created: true, confersAuthority: false } };
    }
    if (rec.url.endsWith("/base/oauth/token")) {
      if (opts.refuseWrite && rec.body.scope === "base.write" && !writeRefused) {
        writeRefused = true;
        return { status: 400, body: { error: "invalid_scope", error_description: "write is not admitted" } };
      }
      const access = `atk-${secrets.tokens.length}-${randomBytes(16).toString("hex")}`;
      secrets.tokens.push(access);
      return {
        status: 200,
        body: { access_token: access, token_type: "DPoP", expires_in: opts.expiresIn ?? 300, scope: rec.body.scope },
      };
    }
    if (rec.url.endsWith("/base/e/first-use")) {
      seenFirstUse.ok = true;
      return { status: 404, body: { error: "not_found" } };
    }
    if (rec.url.endsWith("/context")) {
      expect(seenFirstUse.ok, "first-use must happen before the door is asked").toBe(true);
      if (context401s > 0) {
        context401s -= 1;
        return { status: 401, body: { error: "invalid_token" } };
      }
      if ((opts.contextStatus ?? 200) === 404) return { status: 404, body: { error: "not_found" } };
      const principal = opts.principal ?? "https://example.test/base";
      return {
        body: {
          system: `STANDING-KAI That person is identified as: ${principal}. Tools follow.`,
          tools: [{ name: "list_vaults", description: "List.", inputSchema: { type: "object", properties: {} } }],
        },
      };
    }
    if (rec.url.endsWith("/tool")) {
      if ((opts.toolStatus ?? 200) === 404) return { status: 404, body: { error: "not_found" } };
      if (opts.onTool) return opts.onTool(rec);
      return { body: { result: "tool-ok" } };
    }
    return { status: 404, body: { error: "no such door" } };
  };
  return { handler, secrets, seenFirstUse };
}

function publicKeyFrom(requests) {
  const reg = requests.find((rec) => rec.url.endsWith("/base/client/register"));
  expect(reg, "registration did not happen").toBeTruthy();
  return createPublicKey({ key: reg.body.clientPublicKey, format: "jwk" });
}

function expectProof(proof, publicKey, method, htu, accessToken) {
  const decoded = decodeJwt(proof);
  expect(decoded, "proof did not decode").toBeTruthy();
  expect(signatureOk(proof, publicKey), "proof signature failed").toBe(true);
  expect(decoded.header.alg).toBe("ES256");
  expect(decoded.header.typ).toBe("dpop+jwt");
  expect(decoded.header.jwk.d).toBeUndefined();
  expect(decoded.payload.htm).toBe(method);
  expect(decoded.payload.htu).toBe(htu);
  expect(typeof decoded.payload.jti).toBe("string");
  expect(decoded.payload.jti.length).toBeGreaterThan(0);
  if (accessToken === undefined) expect(decoded.payload.ath).toBeUndefined();
  else expect(decoded.payload.ath).toBe(athOf(accessToken));
  return decoded;
}

describe("parseCli AI default", () => {
  it("defaults to the AI and does not take the computer profile", () => {
    const home = scratch();
    mkdirSync(join(home, "computer"));
    writeFileSync(join(home, "computer", "profile"), "from-disk\n");
    const cli = parseCli([], { GILB_HOME: home, GILB_COMPUTER_PROFILE: "from-env" });
    expect(cli.as).toBe("ai");
    expect(cli.profile).toBe(DEFAULT_AI_PROFILE);
    expect(cli.profile).toBe("default");
    const mine = parseCli(["--as", "me"], { GILB_HOME: home });
    expect(mine.as).toBe("me");
    expect(mine.profile).toBe("from-disk");
    const named = parseCli(["--name", "Desk AI", "--profile", "desk"], {});
    expect(named.name).toBe("Desk AI");
    expect(named.profile).toBe("desk");
    expect(named.as).toBe("ai");
  });
});

describe("Connected AI", () => {
  it("creates a private key once, registers once, and reuses both on the next run", async () => {
    const home = scratch();
    const stderr = captureStderr();
    const { handler, secrets } = door();
    const platform = await listen(handler);
    const env = { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home };
    const first = connect({ origin: platform.origin, env, name: "Desk AI", profile: "desk" });
    const who = await first.request("tools/call", { name: "gilb_whoami", arguments: {} });
    expect(who.result.isError).toBe(false);
    expect(toolText(who)).toBe(`mode: ai\nclient id: ${CLIENT_ID}`);
    const dir = join(home, "desk");
    const pemFile = join(dir, "private.pem");
    const idFile = join(dir, "client-id");
    expect(modeOf(home)).toBe(0o700);
    expect(modeOf(dir)).toBe(0o700);
    expect(modeOf(pemFile)).toBe(0o600);
    expect(modeOf(idFile)).toBe(0o600);
    const pem = readFileSync(pemFile, "utf8");
    secrets.pem = pem;
    expect(pem).toMatch(/-----BEGIN PRIVATE KEY-----/);
    expect(readFileSync(idFile, "utf8").trim()).toBe(CLIENT_ID);
    expect(createPrivateKey(pem).asymmetricKeyType).toBe("ec");
    const registers = platform.requests.filter((rec) => rec.url.endsWith("/base/client/register"));
    expect(registers).toHaveLength(1);
    expect(registers[0].body.clientDisplayName).toBe("Desk AI");
    expect(registers[0].body.clientPublicKey).toMatchObject({ kty: "EC", crv: "P-256" });
    expect(stderr.text()).toContain(`Agent client id: ${CLIENT_ID}`);
    assertClean(stderr.text(), secrets, "stderr");
    assertClean(first.stdout(), secrets, "stdout");

    const second = connect({ origin: platform.origin, env, name: "Desk AI", profile: "desk" });
    const again = await second.request("tools/call", { name: "gilb_whoami", arguments: {} });
    expect(toolText(again)).toContain(`client id: ${CLIENT_ID}`);
    expect(platform.requests.filter((rec) => rec.url.endsWith("/base/client/register"))).toHaveLength(1);
    expect(readFileSync(pemFile, "utf8")).toBe(pem);
    assertClean(stderr.text(), secrets, "stderr");
    assertClean(second.stdout(), secrets, "stdout");
  });

  it("sends client_credentials, a signed assertion, and a DPoP proof, and renews a short session", async () => {
    const home = scratch();
    const stderr = captureStderr();
    const { handler, secrets } = door({ expiresIn: 30 });
    const platform = await listen(handler);
    const env = { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home };
    const box = connect({ origin: platform.origin, env, profile: "default" });
    const listed = await box.request("tools/list", {});
    expect(listed.result.tools.map((tool) => tool.name)).toEqual(["list_vaults", "gilb_whoami", "gilb_agent", "gilb_task"]);
    const key = publicKeyFrom(platform.requests);
    secrets.pem = readFileSync(join(home, "default", "private.pem"), "utf8");
    const tokenPosts = platform.requests.filter((rec) => rec.url.endsWith("/base/oauth/token"));
    expect(tokenPosts.length).toBeGreaterThanOrEqual(2);
    const htu = httpsPath(platform.origin, "/base/oauth/token");
    for (const post of tokenPosts) {
      expect(post.body.grant_type).toBe("client_credentials");
      expect(post.body.client_assertion_type).toBe("urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
      expect(post.body.scope).toBe("base.write");
      expect(signatureOk(post.body.client_assertion, key), "client assertion signature failed").toBe(true);
      const assertion = decodeJwt(post.body.client_assertion);
      expect(assertion.payload.iss).toBe(CLIENT_ID);
      expect(assertion.payload.sub).toBe(CLIENT_ID);
      expect(assertion.payload.aud).toBe(htu);
      expect(assertion.header.alg).toBe("ES256");
      expectProof(post.dpop, key, "POST", htu, undefined);
    }
    const assertionJtis = tokenPosts.map((post) => decodeJwt(post.body.client_assertion).payload.jti);
    expect(new Set(assertionJtis).size).toBe(assertionJtis.length);
    const proofJtis = tokenPosts.map((post) => decodeJwt(post.dpop).payload.jti);
    expect(new Set(proofJtis).size).toBe(proofJtis.length);

    const firstUse = platform.requests.find((rec) => rec.url.endsWith("/base/e/first-use"));
    const context = platform.requests.find((rec) => rec.url.endsWith("/context"));
    expect(firstUse.method).toBe("GET");
    expect(platform.requests.indexOf(firstUse)).toBeLessThan(platform.requests.indexOf(context));
    const firstUseToken = firstUse.authorization.replace(/^DPoP\s+/, "");
    const contextToken = context.authorization.replace(/^DPoP\s+/, "");
    expect(contextToken).not.toBe(firstUseToken);
    expectProof(firstUse.dpop, key, "GET", httpsPath(platform.origin, "/base/e/first-use"), firstUseToken);
    expectProof(context.dpop, key, "POST", httpsPath(platform.origin, "/base/ai/claude-code/context"), contextToken);
    expect(decodeJwt(firstUse.dpop).payload.jti).not.toBe(decodeJwt(context.dpop).payload.jti);
    assertClean(stderr.text(), secrets, "stderr");
    assertClean(box.stdout(), secrets, "stdout");
  });

  it("retries a refused door once with a new session", async () => {
    const home = scratch();
    const stderr = captureStderr();
    const { handler, secrets } = door({ context401s: 1, expiresIn: 300 });
    const platform = await listen(handler);
    const env = { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home };
    const box = connect({ origin: platform.origin, env });
    const listed = await box.request("tools/list", {});
    expect(listed.result.tools.map((tool) => tool.name)[0]).toBe("list_vaults");
    const contexts = platform.requests.filter((rec) => rec.url.endsWith("/context"));
    const tokens = platform.requests.filter((rec) => rec.url.endsWith("/base/oauth/token"));
    expect(contexts).toHaveLength(2);
    expect(tokens).toHaveLength(2);
    const first = contexts[0].authorization.replace(/^DPoP\s+/, "");
    const second = contexts[1].authorization.replace(/^DPoP\s+/, "");
    expect(second).not.toBe(first);
    expect(contexts[1].dpop).not.toBe(contexts[0].dpop);
    secrets.pem = readFileSync(join(home, "default", "private.pem"), "utf8");
    assertClean(stderr.text(), secrets, "stderr");
    assertClean(box.stdout(), secrets, "stdout");
  });

  it("falls back to base.read when write scope is refused, and says so", async () => {
    const home = scratch();
    const stderr = captureStderr();
    const { handler, secrets } = door({ refuseWrite: true });
    const platform = await listen(handler);
    const env = { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home };
    const box = connect({ origin: platform.origin, env });
    const listed = await box.request("tools/list", {});
    expect(listed.result.tools[0].name).toBe("list_vaults");
    const scopes = platform.requests.filter((rec) => rec.url.endsWith("/base/oauth/token")).map((rec) => rec.body.scope);
    expect(scopes[0]).toBe("base.write");
    expect(scopes).toContain("base.read");
    expect(stderr.text()).toContain(SCOPE_LINE);
    secrets.pem = readFileSync(join(home, "default", "private.pem"), "utf8");
    assertClean(stderr.text(), secrets, "stderr");
    assertClean(box.stdout(), secrets, "stdout");
  });

  it("answers a not-bound door with the exact sentence and the client id", async () => {
    const home = scratch();
    const stderr = captureStderr();
    const { handler, secrets } = door({ contextStatus: 404 });
    const platform = await listen(handler);
    const env = { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home };
    const box = connect({ origin: platform.origin, env });
    const sentence = SENTENCE(CLIENT_ID);
    for (const name of ["gilb_task", "gilb_agent", "list_vaults"]) {
      const msg = await box.request("tools/call", { name, arguments: { text: "hi", agent: "Kai-Zen" } });
      expect(msg.result.isError).toBe(true);
      expect(toolText(msg)).toBe(sentence);
    }
    const who = await box.request("tools/call", { name: "gilb_whoami", arguments: {} });
    expect(who.result.isError).toBe(false);
    expect(toolText(who)).toBe(`mode: ai\nclient id: ${CLIENT_ID}`);
    expect(stderr.text()).toContain(sentence);
    expect(stderr.text().split(sentence).length - 1).toBe(1);
    const firstUseAt = platform.requests.findIndex((rec) => rec.url.endsWith("/base/e/first-use"));
    const contextAt = platform.requests.findIndex((rec) => rec.url.endsWith("/context"));
    expect(firstUseAt).toBeGreaterThanOrEqual(0);
    expect(firstUseAt).toBeLessThan(contextAt);
    secrets.pem = readFileSync(join(home, "default", "private.pem"), "utf8");
    assertClean(stderr.text(), secrets, "stderr");
    assertClean(box.stdout(), secrets, "stdout");
  });

  it("answers a granted-then-refused tool with the same sentence", async () => {
    const home = scratch();
    const stderr = captureStderr();
    const { handler, secrets } = door({ toolStatus: 404, principal: "https://example.test/base" });
    const platform = await listen(handler);
    const env = { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home };
    const box = connect({ origin: platform.origin, env });
    await box.request("tools/list", {});
    const call = await box.request("tools/call", { name: "list_vaults", arguments: {} });
    expect(call.result.isError).toBe(true);
    expect(toolText(call)).toBe(SENTENCE(CLIENT_ID));
    const who = await box.request("tools/call", { name: "gilb_whoami", arguments: {} });
    expect(toolText(who)).toBe(`mode: ai\nclient id: ${CLIENT_ID}\nprincipal: https://example.test/base`);
    secrets.pem = readFileSync(join(home, "default", "private.pem"), "utf8");
    assertClean(stderr.text(), secrets, "stderr");
    assertClean(box.stdout(), secrets, "stdout");
  });

  it("a hop child is the same AI: --as and --profile, and no second registration", async () => {
    const home = scratch();
    const logFile = join(home, "claude.log");
    const markerMod = join(home, "computer-mod.mjs");
    const markerFile = join(home, "computer-imported");
    writeFileSync(markerMod, `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(markerFile)}, "imported\\n");\nexport async function openComputerCredential(){ throw new Error("computer path"); }\n`);
    const stderr = captureStderr();
    const { handler, secrets } = door({
      onTool: (rec) => {
        if (rec.body.name === "run_named_role" && !rec.body.hop) {
          return {
            body: {
              hop: {
                id: HOP_A,
                system: "You are Jackfruit.",
                task: "Do the records.",
                tools: [{ name: "list_records", description: "List", inputSchema: { type: "object", properties: {} } }],
                role: "Agent.Jackfruit",
                answer: { summary: "handed" },
              },
            },
          };
        }
        if (rec.body.hop && rec.body.name === "list_records") return { body: { result: "two records" } };
        if (rec.body.name === "hop_done") return { body: { result: "closed" } };
        return { status: 404, body: { error: "unexpected tool" } };
      },
    });
    const platform = await listen(handler);
    const env = {
      PATH: process.env.PATH,
      HOME: home,
      GILB_HOME: home,
      GILB_CONNECTOR_HOME: home,
      GILB_CONNECTOR_COMPUTER_MODULE: markerMod,
      FAKE_CLAUDE_LOG: logFile,
    };
    const box = connect({ origin: platform.origin, env, profile: "hopai" });
    const call = await box.request("tools/call", { name: "run_named_role", arguments: {} });
    expect(call.result.isError).toBe(false);
    expect(JSON.parse(toolText(call)).content).toBe("two records");
    const log = readFileSync(logFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const mcp = JSON.parse(log[0].argv[log[0].argv.indexOf("--mcp-config") + 1]);
    expect(mcp.mcpServers.gilb.args).toEqual(expect.arrayContaining(["--as", "ai", "--profile", "hopai"]));
    expect(platform.requests.filter((rec) => rec.url.endsWith("/base/client/register"))).toHaveLength(1);
    expect(existsSync(markerFile)).toBe(false);
    secrets.pem = readFileSync(join(home, "hopai", "private.pem"), "utf8");
    assertClean(stderr.text(), secrets, "stderr");
    assertClean(box.stdout(), secrets, "stdout");
    assertClean(JSON.stringify(mcp.mcpServers.gilb.args), secrets, "hop args");
  }, 15000);

  it("does not import the computer module or use the computer profile when --as is omitted", async () => {
    const home = scratch();
    mkdirSync(join(home, "computer"));
    writeFileSync(join(home, "computer", "profile"), "from-disk\n");
    const markerMod = join(home, "computer-mod.mjs");
    const markerFile = join(home, "computer-imported");
    writeFileSync(markerMod, `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(markerFile)}, "imported\\n");\nexport async function openComputerCredential(){ throw new Error("computer path"); }\n`);
    const { handler } = door({ contextStatus: 404 });
    const platform = await listen(handler);
    const stderrChunks = [];
    const stdoutChunks = [];
    const child = spawn(process.execPath, [MJS, "--origin", platform.origin], {
      env: {
        PATH: process.env.PATH,
        HOME: home,
        GILB_HOME: home,
        GILB_CONNECTOR_HOME: home,
        GILB_CONNECTOR_COMPUTER_MODULE: markerMod,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    procs.push(child);
    child.stdout.on("data", (chunk) => stdoutChunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(String(chunk)));
    const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } });
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_vaults", arguments: {} } });
    const started = Date.now();
    while (!stdoutChunks.join("").includes('"id":2')) {
      if (Date.now() - started > 8000) throw new Error("spawned connector did not answer");
      await delay(20);
    }
    child.stdin.end();
    await delay(50);
    const stdout = stdoutChunks.join("");
    const stderr = stderrChunks.join("");
    expect(existsSync(markerFile)).toBe(false);
    expect(existsSync(join(home, "from-disk", "private.pem"))).toBe(false);
    expect(existsSync(join(home, "default", "private.pem"))).toBe(true);
    expect(stdout).toContain(SENTENCE(CLIENT_ID));
    expect(stderr).toContain(SENTENCE(CLIENT_ID));
    expect(stderr).toContain("Agent client id: " + CLIENT_ID);
    const pem = readFileSync(join(home, "default", "private.pem"), "utf8");
    const secrets = {
      pem,
      tokens: platform.requests.map((rec) => rec.authorization.replace(/^DPoP\s+/i, "")).filter(Boolean),
      proofs: platform.requests.map((rec) => rec.dpop).filter(Boolean),
      assertions: platform.requests.map((rec) => rec.body.client_assertion).filter((value) => typeof value === "string"),
    };
    assertClean(stdout, secrets, "stdout");
    assertClean(stderr, secrets, "stderr");
    const reg = platform.requests.find((rec) => rec.url.endsWith("/base/client/register"));
    expect(reg.body.clientDisplayName.startsWith("Claude Code on ")).toBe(true);
  }, 15000);

  it("leaves --as me on the computer path and does not create an AI key", async () => {
    const home = scratch();
    const missing = join(home, "missing-computer.mjs");
    writeFileSync(
      missing,
      `export async function openComputerCredential() {\n  const err = new Error("not found");\n  err.name = "ComputerKeyError";\n  err.code = "not_found";\n  throw err;\n}\n`,
    );
    const platform = await listen(async () => {
      throw new Error("the platform must not be called");
    });
    const box = connect({
      as: "me",
      origin: platform.origin,
      env: {
        PATH: process.env.PATH,
        HOME: home,
        GILB_HOME: home,
        GILB_CONNECTOR_HOME: home,
        GILB_CONNECTOR_COMPUTER_MODULE: missing,
      },
      profile: undefined,
    });
    const msg = await box.request("tools/call", { name: "list_vaults", arguments: {} });
    expect(msg.result.isError).toBe(true);
    expect(toolText(msg)).toBe(COMPUTER_SENTENCE);
    expect(existsSync(join(home, "default", "private.pem"))).toBe(false);
    expect(platform.requests).toHaveLength(0);
  });
});
