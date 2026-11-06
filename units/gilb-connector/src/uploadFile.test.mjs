// @vitest-environment node
// gilbplatform_upload_file: a bound AI sends one local file to a vault the person selected.
// Two local doors stand in: the identity door (register, token, context, tool) and the vault's own door (the upload).
import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { aiNotBound, startConnector } from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const FAKE_COMPUTER = join(HERE, "fake-computer.mjs");
const CLIENT_ID = "agent-client-upload";
const TURN = "turn-upload-file-b";
const HOP_A = "0123456789abcdef01234567";
const PERSON = "https://id.example.test/base/p/abc";
const AI_VAULT = "https://ai.example.test/base";
const OTHER = "https://other.example.test/base";
const UPLOAD = "gilbplatform_upload_file";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);

const closers = [];
const dirs = [];
const opened = [];

afterEach(async () => {
  const boxes = opened.splice(0);
  for (const box of boxes) box.session.close();
  await Promise.race([
    Promise.all(boxes.map((box) => box.session.done)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("session did not stop")), 8000)),
  ]);
  for (const box of boxes) {
    box.input.destroy();
    box.output.destroy();
  }
  for (const close of closers.splice(0)) await close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "gilb-upload-"));
  dirs.push(dir);
  return dir;
}

function listen(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const type = String(req.headers["content-type"] ?? "");
    let body = {};
    if (type.includes("application/x-www-form-urlencoded")) body = Object.fromEntries(new URLSearchParams(raw.toString("utf8")));
    else if (type.includes("json")) {
      try {
        body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
      } catch {
        body = { raw: raw.toString("utf8") };
      }
    }
    const rec = { method: req.method, url: req.url ?? "", headers: req.headers, body, raw };
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
      closers.push(() => new Promise((done) => server.close(() => done())));
      resolve({ origin: `http://127.0.0.1:${port}`, host: `127.0.0.1:${port}`, requests });
    });
  });
}

function connect(opts) {
  const input = new PassThrough();
  const output = new PassThrough();
  const pending = new Map();
  let buf = "";
  output.setEncoding("utf8");
  output.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  const session = startConnector({ input, output, turnId: TURN, claudeBin: FAKE_CLAUDE, as: "ai", ...opts });
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
  return { session, request };
}

const toolText = (msg) => msg.result.content[0].text;
const aiEnv = (home) => ({ PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home });

function door(state) {
  return async (rec) => {
    if (rec.url.endsWith("/base/client/register")) return { status: 200, body: { clientId: CLIENT_ID, created: true, confersAuthority: false } };
    if (rec.url.endsWith("/base/oauth/token")) {
      return { status: 200, body: { access_token: `atk-${randomBytes(8).toString("hex")}`, token_type: "DPoP", expires_in: 300, scope: rec.body.scope } };
    }
    if (rec.url.endsWith("/base/e/first-use")) return { status: 404, body: { error: "not_found" } };
    if (rec.url.endsWith("/context")) {
      return { body: { system: `STANDING-KAI That person is identified as: ${state.principal}. Tools follow.`, tools: [{ name: "list_vaults", description: "List.", inputSchema: { type: "object", properties: {} } }] } };
    }
    if (rec.url.endsWith("/tool")) return { body: { result: JSON.stringify({ vaults: state.vaults ?? [] }) } };
    return { status: 404, body: { error: "no such door" } };
  };
}

const created = (n = "01abc") => ({ status: 201, body: { entity: `https://files.example.test/base/e/${n}`, contentHash: "sha256:x", byteSize: PNG.length, created: true } });

/** A bound AI, one selected vault that is the fake vault door, and a working folder with files in it. */
async function setup(vaultHandler = () => created(), { principal = AI_VAULT, select = true, extraVaults = [], boxOpts = {} } = {}) {
  const home = scratch();
  const cwd = scratch();
  const identity = await listen(door({ principal }));
  const vault = await listen(vaultHandler);
  const base = `${vault.origin}/base`;
  const box = connect({
    origin: identity.origin,
    env: aiEnv(home),
    cwd,
    vaults: select ? [base, ...extraVaults] : extraVaults,
    ...boxOpts,
  });
  return { box, cwd, identity, vault, base };
}

const call = (box, args) => box.request("tools/call", { name: UPLOAD, arguments: args });
const unreadable = (file) => chmodSync(file, 0o000);

/** A refusal: an error answer with this wording, and nothing was sent to the vault. */
async function expectRefused(ctx, args, wording) {
  const res = await call(ctx.box, args);
  expect(res.result.isError).toBe(true);
  expect(toolText(res)).toMatch(wording);
  expect(toolText(res)).not.toMatch(/could not be read/);
  expect(ctx.vault.requests).toHaveLength(0);
  return res;
}

describe("gilbplatform_upload_file", () => {
  it("b1 is in the tool list, with its four inputs", async () => {
    const ctx = await setup();
    const listed = await ctx.box.request("tools/list", {});
    const tool = listed.result.tools.find((t) => t.name === UPLOAD);
    expect(tool).toBeTruthy();
    expect(Object.keys(tool.inputSchema.properties)).toEqual(["path", "vault", "folder", "name"]);
    expect(tool.inputSchema.required).toEqual(["path"]);
  });

  it("b2 sends the bytes once to the vault's own host, signed for that host, and answers address, sha256 and size", async () => {
    const ctx = await setup();
    writeFileSync(join(ctx.cwd, "pic.png"), PNG);
    const res = await call(ctx.box, { path: "pic.png", folder: "type-pictures" });
    expect(res.result.isError).toBe(false);
    expect(ctx.vault.requests).toHaveLength(1);
    const sent = ctx.vault.requests[0];
    const encoded = encodeURIComponent(ctx.base);
    expect(sent.method).toBe("POST");
    expect(sent.url).toBe(`/lws/vault/${encoded}/files?name=pic.png&folder=type-pictures`);
    expect(sent.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(sent.raw, PNG)).toBe(0);
    expect(sent.headers.authorization).toMatch(/^DPoP atk-/);
    const proof = JSON.parse(Buffer.from(String(sent.headers.dpop).split(".")[1], "base64url").toString("utf8"));
    expect(proof.htm).toBe("POST");
    expect(proof.htu).toBe(`https://${ctx.vault.host}/lws/vault/${encoded}/files`);
    // Nothing for the vault went to the identity door.
    expect(ctx.identity.requests.some((r) => r.url.includes("/lws/vault"))).toBe(false);
    const text = toolText(res);
    expect(text).toContain("address: https://files.example.test/base/e/01abc");
    expect(text).toContain(`sha256: ${createHash("sha256").update(PNG).digest("hex")}`);
    expect(text).toContain(`size: ${PNG.length} bytes`);
    expect(text).not.toMatch(/atk-|DPoP|authorization/i);
  });

  it("b2 a name, an upper-case extension and an upload folder given with --upload-root are accepted", async () => {
    const ctx = await setup(() => created(), { boxOpts: {} });
    const other = scratch();
    ctx.box.session.close();
    const box = connect({ origin: ctx.identity.origin, env: aiEnv(scratch()), cwd: ctx.cwd, vaults: [ctx.base], uploadRoots: [other] });
    writeFileSync(join(other, "Shot.PNG"), PNG);
    const res = await call(box, { path: join(other, "Shot.PNG"), name: "renamed.png" });
    expect(res.result.isError).toBe(false);
    expect(ctx.vault.requests[0].url).toContain("name=renamed.png");
    expect(ctx.vault.requests[0].headers["content-type"]).toBe("image/png");
  });

  it("b2 a repeat the door answers 200 is said so", async () => {
    const ctx = await setup(() => ({ status: 200, body: { entity: "https://files.example.test/base/e/01abc", byteSize: PNG.length, created: false } }));
    writeFileSync(join(ctx.cwd, "pic.png"), PNG);
    const res = await call(ctx.box, { path: "pic.png" });
    expect(res.result.isError).toBe(false);
    expect(toolText(res)).toContain("the same file was already there");
  });

  it("b3 a vault given by name works when it is selected", async () => {
    const ctx = await setup();
    writeFileSync(join(ctx.cwd, "pic.png"), PNG);
    const res = await call(ctx.box, { path: "pic.png", vault: ctx.vault.host });
    expect(res.result.isError).toBe(false);
    expect(ctx.vault.requests).toHaveLength(1);
  });

  it("r1 not bound: the not-bound sentence, nothing sent, the file not read", async () => {
    const ctx = await setup(() => created(), { principal: PERSON });
    const file = join(ctx.cwd, "pic.png");
    writeFileSync(file, PNG);
    unreadable(file);
    const res = await call(ctx.box, { path: "pic.png" });
    expect(res.result.isError).toBe(true);
    expect(toolText(res)).toBe(aiNotBound(CLIENT_ID));
    expect(ctx.vault.requests).toHaveLength(0);
  });

  it("r1 hop mode does not offer it and does not run it", async () => {
    const identity = await listen(async () => ({ status: 404, body: { error: "no such door" } }));
    const vault = await listen(() => created());
    const cwd = scratch();
    writeFileSync(join(cwd, "pic.png"), PNG);
    const box = connect({
      origin: identity.origin,
      as: "me",
      hopId: HOP_A,
      cwd,
      vaults: [`${vault.origin}/base`],
      hopTools: [{ name: "read_record", description: "Read.", inputSchema: { type: "object", properties: {} } }],
      env: { PATH: process.env.PATH, HOME: scratch(), GILB_CONNECTOR_COMPUTER_MODULE: FAKE_COMPUTER },
    });
    const listed = await box.request("tools/list", {});
    expect(listed.result.tools.map((t) => t.name)).toEqual(["read_record"]);
    const res = await call(box, { path: "pic.png" });
    expect(res.result.isError).toBe(true);
    expect(toolText(res)).toContain("Unknown tool");
    expect(vault.requests).toHaveLength(0);
  });

  it("r2 a vault that is not selected is refused, and the model is sent to gilbplatform_use_vault", async () => {
    const ctx = await setup();
    const file = join(ctx.cwd, "pic.png");
    writeFileSync(file, PNG);
    unreadable(file);
    await expectRefused(ctx, { path: "pic.png", vault: "other" }, /not a vault selected.*gilbplatform_use_vault/);
    await expectRefused(ctx, { path: "pic.png", vault: OTHER }, /gilbplatform_use_vault/);
  });

  it("r2 nothing selected is refused the same way", async () => {
    const ctx = await setup(() => created(), { select: false });
    const file = join(ctx.cwd, "pic.png");
    writeFileSync(file, PNG);
    unreadable(file);
    await expectRefused(ctx, { path: "pic.png" }, /No vault is selected.*gilbplatform_use_vault/);
  });

  it("r2 two selected and no vault named: refused, and both are listed", async () => {
    const ctx = await setup(() => created(), { extraVaults: [OTHER] });
    const file = join(ctx.cwd, "pic.png");
    writeFileSync(file, PNG);
    unreadable(file);
    const res = await expectRefused(ctx, { path: "pic.png" }, /More than one vault is selected/);
    expect(toolText(res)).toContain(ctx.base);
    expect(toolText(res)).toContain(OTHER);
  });

  it("r3 a file outside the folder is refused, unread", async () => {
    const ctx = await setup();
    const outside = scratch();
    const file = join(outside, "pic.png");
    writeFileSync(file, PNG);
    unreadable(file);
    await expectRefused(ctx, { path: file }, /outside the folder/);
    await expectRefused(ctx, { path: "../" + file.split("/").slice(-2).join("/") }, /outside the folder/);
  });

  it("r3 a link inside the folder that leads out is refused, unread", async () => {
    const ctx = await setup();
    const outside = scratch();
    const target = join(outside, "pic.png");
    writeFileSync(target, PNG);
    unreadable(target);
    symlinkSync(target, join(ctx.cwd, "link.png"));
    symlinkSync(outside, join(ctx.cwd, "dir"));
    await expectRefused(ctx, { path: "link.png" }, /outside the folder/);
    await expectRefused(ctx, { path: "dir/pic.png" }, /outside the folder/);
  });

  it("r3 a hidden folder or file is refused, unread, also through a link", async () => {
    const ctx = await setup();
    mkdirSync(join(ctx.cwd, ".ssh"));
    writeFileSync(join(ctx.cwd, ".ssh", "pic.png"), PNG);
    writeFileSync(join(ctx.cwd, ".env.txt"), "x");
    mkdirSync(join(ctx.cwd, "inner"));
    unreadable(join(ctx.cwd, ".ssh", "pic.png"));
    unreadable(join(ctx.cwd, ".env.txt"));
    symlinkSync(join(ctx.cwd, ".ssh", "pic.png"), join(ctx.cwd, "inner", "innocent.png"));
    await expectRefused(ctx, { path: ".ssh/pic.png" }, /hidden/);
    await expectRefused(ctx, { path: ".env.txt" }, /hidden/);
    await expectRefused(ctx, { path: "inner/innocent.png" }, /hidden/);
  });

  it("r2 a vault name that fits two selected vaults is refused, both listed", async () => {
    const ctx = await setup(() => created(), { extraVaults: ["http://127.0.0.1:9/base"] });
    const file = join(ctx.cwd, "pic.png");
    writeFileSync(file, PNG);
    unreadable(file);
    const res = await expectRefused(ctx, { path: "pic.png", vault: "127" }, /More than one selected vault matches 127/);
    expect(toolText(res)).toContain("127.0.0.1:9");
  });

  it("r3 a link whose own name is hidden or key-like is refused even when it leads to a fine file", async () => {
    const ctx = await setup();
    const real = join(ctx.cwd, "pic.png");
    writeFileSync(real, PNG);
    symlinkSync(real, join(ctx.cwd, ".alias.png"));
    await expectRefused(ctx, { path: ".alias.png" }, /hidden/);
    symlinkSync(real, join(ctx.cwd, "my-token.png"));
    await expectRefused(ctx, { path: "my-token.png" }, /key, a login or a secret/);
  });

  it("r3 a Confidential folder, in any case, is refused unread, also through a link and by a link's own name", async () => {
    const ctx = await setup();
    mkdirSync(join(ctx.cwd, "Confidential"));
    writeFileSync(join(ctx.cwd, "Confidential", "pic.png"), PNG);
    unreadable(join(ctx.cwd, "Confidential", "pic.png"));
    for (const [i, dir] of ["Confidential", "confidential", "CONFIDENTIAL"].entries()) {
      // Same folder on a case-insensitive disk; the spelling given is what is checked.
      const given = `${dir}/pic.png`;
      await expectRefused(ctx, { path: given }, /Confidential/);
      expect(i).toBeGreaterThanOrEqual(0);
    }
    mkdirSync(join(ctx.cwd, "x1", "confidential"), { recursive: true });
    writeFileSync(join(ctx.cwd, "x1", "confidential", "p.png"), PNG);
    unreadable(join(ctx.cwd, "x1", "confidential", "p.png"));
    await expectRefused(ctx, { path: "x1/confidential/p.png" }, /Confidential/);
    mkdirSync(join(ctx.cwd, "x2", "CONFIDENTIAL"), { recursive: true });
    writeFileSync(join(ctx.cwd, "x2", "CONFIDENTIAL", "p.png"), PNG);
    unreadable(join(ctx.cwd, "x2", "CONFIDENTIAL", "p.png"));
    await expectRefused(ctx, { path: "x2/CONFIDENTIAL/p.png" }, /Confidential/);
    mkdirSync(join(ctx.cwd, "a", "Confidential"), { recursive: true });
    const deep = join(ctx.cwd, "a", "Confidential", "x.png");
    writeFileSync(deep, PNG);
    unreadable(deep);
    await expectRefused(ctx, { path: "a/Confidential/x.png" }, /Confidential/);
    // A link with a fine name into the folder (the real path has the segment).
    mkdirSync(join(ctx.cwd, "pub"));
    symlinkSync(join(ctx.cwd, "Confidential", "pic.png"), join(ctx.cwd, "pub", "innocent.png"));
    symlinkSync(join(ctx.cwd, "Confidential"), join(ctx.cwd, "pub", "dirlink"));
    await expectRefused(ctx, { path: "pub/innocent.png" }, /Confidential/);
    await expectRefused(ctx, { path: "pub/dirlink/pic.png" }, /Confidential/);
    // A link named Confidential that leads to a fine file (the path as given has the segment).
    const fine = join(ctx.cwd, "pic.png");
    writeFileSync(fine, PNG);
    symlinkSync(fine, join(ctx.cwd, "Confidential.png"));
    mkdirSync(join(ctx.cwd, "pub2"));
    mkdirSync(join(ctx.cwd, "fine"));
    writeFileSync(join(ctx.cwd, "fine", "q.png"), PNG);
    symlinkSync(join(ctx.cwd, "fine"), join(ctx.cwd, "pub2", "Confidential"));
    await expectRefused(ctx, { path: "pub2/Confidential/q.png" }, /Confidential/);
    // Only the whole segment counts: a name that merely contains the word is not this rule.
    const ok = await call(ctx.box, { path: "Confidential.png" });
    expect(ok.result.isError).toBe(false);
  });

  it("r3 a name that looks like a key or a secret is refused, unread", async () => {
    const ctx = await setup();
    const names = ["server.pem", "deploy.key", "id_rsa.txt", "id_ed25519.md", "my-credentials.json", "api-token.txt", "client_secret.csv", "TOKEN.png"];
    for (const name of names) {
      const file = join(ctx.cwd, name);
      writeFileSync(file, "x");
      unreadable(file);
      await expectRefused(ctx, { path: name }, /key, a login or a secret/);
    }
    mkdirSync(join(ctx.cwd, "secrets"));
    writeFileSync(join(ctx.cwd, "secrets", "pic.png"), PNG);
    unreadable(join(ctx.cwd, "secrets", "pic.png"));
    await expectRefused(ctx, { path: "secrets/pic.png" }, /key, a login or a secret/);
  });

  it("r4 an extension that is not allowed, an empty file, a directory and a missing file are refused", async () => {
    const ctx = await setup();
    const exe = join(ctx.cwd, "run.exe");
    writeFileSync(exe, "x");
    unreadable(exe);
    await expectRefused(ctx, { path: "run.exe" }, /Only png, jpg/);
    await expectRefused(ctx, { path: "noext" }, /not there/);
    const empty = join(ctx.cwd, "empty.png");
    writeFileSync(empty, "");
    unreadable(empty);
    await expectRefused(ctx, { path: "empty.png" }, /empty/);
    mkdirSync(join(ctx.cwd, "folder.png"));
    await expectRefused(ctx, { path: "folder.png" }, /not a file/);
    await expectRefused(ctx, { path: "gone.png" }, /not there/);
  });

  it("r4 a file over 25 MB is refused from its size alone, unread", async () => {
    const ctx = await setup();
    const big = join(ctx.cwd, "big.png");
    writeFileSync(big, "");
    truncateSync(big, 25 * 1024 * 1024 + 1);
    unreadable(big);
    await expectRefused(ctx, { path: "big.png" }, /26214401 bytes.*25 MB/);
    const ok = join(ctx.cwd, "edge.png");
    writeFileSync(ok, "");
    truncateSync(ok, 25 * 1024 * 1024);
    const res = await call(ctx.box, { path: "edge.png" });
    expect(res.result.isError).toBe(false);
    expect(ctx.vault.requests[0].raw.length).toBe(25 * 1024 * 1024);
  });

  it("r4 a stored name must be plain and keep the extension", async () => {
    const ctx = await setup();
    writeFileSync(join(ctx.cwd, "pic.png"), PNG);
    await expectRefused(ctx, { path: "pic.png", name: "a/b.png" }, /plain file name/);
    await expectRefused(ctx, { path: "pic.png", name: ".hidden.png" }, /plain file name/);
    await expectRefused(ctx, { path: "pic.png", name: "pic.pdf" }, /keep the file's extension/);
    await expectRefused(ctx, { path: "pic.png", name: "id_rsa.png" }, /key, a login or a secret/);
  });

  it("s1 a 401 is retried once with a fresh session, and the file is sent twice at most", async () => {
    let n = 0;
    const ctx = await setup(() => (++n === 1 ? { status: 401, body: { error: "invalid_token" } } : created()));
    writeFileSync(join(ctx.cwd, "pic.png"), PNG);
    const tokensBefore = ctx.identity.requests.filter((r) => r.url.endsWith("/oauth/token")).length;
    const res = await call(ctx.box, { path: "pic.png" });
    expect(res.result.isError).toBe(false);
    expect(ctx.vault.requests).toHaveLength(2);
    expect(ctx.vault.requests[0].headers.authorization).not.toBe(ctx.vault.requests[1].headers.authorization);
    expect(ctx.identity.requests.filter((r) => r.url.endsWith("/oauth/token")).length).toBeGreaterThan(tokensBefore);
  });

  it("s1 a 401 twice stops after two sends", async () => {
    const ctx = await setup(() => ({ status: 401, body: { error: "invalid_token" } }));
    writeFileSync(join(ctx.cwd, "pic.png"), PNG);
    const res = await call(ctx.box, { path: "pic.png" });
    expect(res.result.isError).toBe(true);
    expect(ctx.vault.requests).toHaveLength(2);
    expect(toolText(res)).not.toMatch(/atk-|DPoP/);
  });

  it("s2 a 500 is NOT retried", async () => {
    const ctx = await setup(() => ({ status: 500, body: { error: "InternalError", message: "boom" } }));
    writeFileSync(join(ctx.cwd, "pic.png"), PNG);
    const res = await call(ctx.box, { path: "pic.png" });
    expect(res.result.isError).toBe(true);
    expect(toolText(res)).toContain("(500)");
    expect(toolText(res)).toContain("InternalError: boom");
    expect(ctx.vault.requests).toHaveLength(1);
  });

  it("s2 a 403 is said plainly, with what the person does, and is not retried", async () => {
    const ctx = await setup(() => ({ status: 403, body: { error: "Forbidden", message: "no write grant" } }));
    writeFileSync(join(ctx.cwd, "pic.png"), PNG);
    const res = await call(ctx.box, { path: "pic.png" });
    expect(res.result.isError).toBe(true);
    expect(toolText(res)).toContain("grants Write");
    expect(ctx.vault.requests).toHaveLength(1);
  });

  it("s3 an error body that is a token is not quoted back", async () => {
    const jwt = `${"a".repeat(12)}.${"b".repeat(12)}.${"c".repeat(12)}`;
    const ctx = await setup(() => ({ status: 400, body: { error: "BadRequest", message: jwt } }));
    writeFileSync(join(ctx.cwd, "pic.png"), PNG);
    const res = await call(ctx.box, { path: "pic.png" });
    expect(toolText(res)).not.toContain(jwt);
  });
});
