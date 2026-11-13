// @vitest-environment node
// Projects (0.3.0): a project is a direct subfolder of the code folder; a code turn may run inside one; one code turn per project.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, validProjectName } from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";

let dir, bridge, base, logFile, ws, secret0;

async function start({ fullAccess = false, platform = "darwin", bridgeOpts = {}, env = {} } = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-proj-")));
  logFile = path.join(dir, "claude.log");
  ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  ws = fs.realpathSync.native(ws);
  bridge = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir, workspace: ws,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: platform, ...(fullAccess ? { fullAccess: true } : {}),
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile, ...env }, ...bridgeOpts,
  });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  secret0 = (await res.json()).secret;
  return secret0;
}
afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});
const rows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
const runs = () => rows("run");
async function api(route, body = {}, secret = secret0) {
  const res = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-bridge-secret": secret } : {}) }, body: JSON.stringify(body) });
  const events = [];
  let json = null;
  if (res.headers.get("content-type")?.includes("event-stream")) {
    for (const blk of (await res.text()).split("\n\n")) {
      const ev = /event: (.*)/.exec(blk)?.[1];
      const data = /data: (.*)/.exec(blk)?.[1];
      if (ev) events.push([ev, JSON.parse(data)]);
    }
  } else json = await res.json().catch(() => null);
  return { status: res.status, json, events };
}
const T = (extra) => ({ system: "You are the agent.", prompt: "hello", mode: "code", ...extra });
const ev = (r, name) => r.events.filter((e) => e[0] === name).map((e) => e[1]);
const mk = (n) => fs.mkdirSync(path.join(ws, n));
const ASK = (...asks) => `ASKJSON:${JSON.stringify(asks)}`;

describe("project names", () => {
  it("validProjectName: 1 to 64 of letters digits . - _, starting with a letter or digit", () => {
    for (const ok of ["a", "hello-gilbapp", "A1._-x", "9lives", "a".repeat(64)]) expect(validProjectName(ok), ok).toBe(true);
    for (const bad of ["", ".", "..", ".hidden", "-x", "_x", "a b", "a/b", "a\\b", "é", "a".repeat(65), 5, null, undefined]) expect(validProjectName(bad), String(bad)).toBe(false);
  });
});

describe("POST /v1/projects", () => {
  it("lists real direct subfolders only, sorted; symlinks, dot folders, node_modules, files and bad names are left out", async () => {
    await start();
    for (const n of ["beta", "alpha", ".git", "node_modules", "bad name", "Zed"]) mk(n);
    fs.writeFileSync(path.join(ws, "file.txt"), "x");
    fs.symlinkSync(path.join(dir), path.join(ws, "linked"));
    const r = await api("/v1/projects");
    expect(r.status).toBe(200);
    expect(r.json.projects.map((p) => p.name)).toEqual(["Zed", "alpha", "beta"]);
    expect(typeof r.json.projects[0].modified).toBe("string");
    expect(Number.isNaN(Date.parse(r.json.projects[0].modified))).toBe(false);
  });
  it("needs the pairing; 404 without a code folder, with the /v1/workspace sentence", async () => {
    await start();
    expect((await api("/v1/projects", {}, "")).status).toBe(401);
    await bridge.close();
    dir && fs.rmSync(dir, { recursive: true, force: true });
    dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-proj-")));
    bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir, env: process.env });
    await bridge.start();
    base = `http://127.0.0.1:${bridge.port}`;
    const s = (await (await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) })).json()).secret;
    const r = await api("/v1/projects", {}, s);
    expect(r.status).toBe(404);
    expect(r.json.error).toBe("This bridge has no code folder. Start it with --workspace <folder>.");
    expect((await api("/v1/projects/create", { name: "a" }, s)).status).toBe(404);
  });
  it("is cut at 500", async () => {
    await start();
    for (let i = 0; i < 510; i++) mk(`p${String(i).padStart(4, "0")}`);
    expect((await api("/v1/projects")).json.projects).toHaveLength(500);
  });
});

describe("POST /v1/projects/create", () => {
  it("makes the folder (mode 0700), refuses an existing one (409), a bad name (400), and a case-clash on macOS", async () => {
    await start({ bridgeOpts: { pathPlatform: "darwin" } }); // the case rule follows the pretend platform, so it holds on a case-sensitive disk too
    const r = await api("/v1/projects/create", { name: "alpha" });
    expect(r).toMatchObject({ status: 200, json: { name: "alpha" } });
    if (process.platform !== "win32") expect(fs.statSync(path.join(ws, "alpha")).mode & 0o777).toBe(0o700);
    expect(await api("/v1/projects/create", { name: "alpha" })).toMatchObject({ status: 409, json: { error: "A project with this name already exists." } });
    expect((await api("/v1/projects/create", { name: "ALPHA" })).status).toBe(409);
    for (const bad of ["", "..", ".x", "a/b", "a b", "node_modules", 5, undefined]) expect((await api("/v1/projects/create", { name: bad })).status, String(bad)).toBe(400);
  });
  it("is refused while the folder dialog is open (409)", async () => {
    let release;
    await start({ bridgeOpts: { chooseFolder: () => new Promise((res) => { release = res; }) } });
    const open = api("/v1/workspace/choose");
    await new Promise((r) => setTimeout(r, 100));
    expect((await api("/v1/projects/create", { name: "x1" })).status).toBe(409);
    release(null);
    await open;
    expect((await api("/v1/projects/create", { name: "x1" })).status).toBe(200);
  });
});

describe("a code turn in a project", () => {
  it("runs with the project as its folder, its npm cache inside it, and a prompt that names it (no subfolder sentences)", async () => {
    await start();
    mk("alpha");
    const r = await api("/v1/turn", T({ project: "alpha" }));
    expect(ev(r, "message")[0]).toMatchObject({ mode: "code", project: "alpha" });
    const run = runs()[0];
    const alpha = fs.realpathSync.native(path.join(ws, "alpha"));
    expect(fs.realpathSync.native(run.cwd)).toBe(alpha);
    expect(run.npmCache).toBe(path.join(alpha, ".npm-cache"));
    const sys = run.argv[run.argv.indexOf("--append-system-prompt") + 1];
    expect(sys).toContain('You are working in the project folder "alpha" inside the code folder "MyCode"');
    expect(sys).toContain("Read, write and run commands only inside this project folder.");
    expect(sys).not.toContain("Make each new app in its own subfolder");
    expect(sys).not.toContain("Never put app files at the top level");
  });
  it("without a project it is today's behaviour: the code folder itself, no project in the message", async () => {
    await start();
    mk("alpha");
    const r = await api("/v1/turn", T());
    expect(ev(r, "message")[0]).not.toHaveProperty("project");
    expect(fs.realpathSync.native(runs()[0].cwd)).toBe(ws);
    expect(runs()[0].argv[runs()[0].argv.indexOf("--append-system-prompt") + 1]).toContain("Make each new app in its own subfolder");
  });
  it("files-only (Windows folder mode) names the project too", async () => {
    await start({ platform: "win32" });
    mk("alpha");
    await api("/v1/turn", T({ project: "alpha" }));
    const sys = runs()[0].argv[runs()[0].argv.indexOf("--append-system-prompt") + 1];
    expect(sys).toContain('project folder "alpha"');
    expect(sys).toContain("Read and write files only inside this project folder.");
    expect(sys).not.toContain("Make each new app");
  });
  it("computer mode: the project is the start folder and the paragraph names it, without the subfolder sentences", async () => {
    await start({ fullAccess: true });
    mk("alpha");
    await api("/v1/turn", T({ project: "alpha" }));
    const run = runs()[0];
    const alpha = fs.realpathSync.native(path.join(ws, "alpha"));
    expect(fs.realpathSync.native(run.cwd)).toBe(alpha);
    const sys = run.argv[run.argv.indexOf("--append-system-prompt") + 1];
    expect(sys).toContain(`Start in the project folder "alpha" (${alpha}) inside the code folder "MyCode".`);
    expect(sys).not.toContain("Make each new app");
  });
  it("an unknown, bad-named, file, dot, symlinked or non-string project is 400 No such project., and nothing is spawned", async () => {
    await start();
    fs.writeFileSync(path.join(ws, "afile"), "x");
    fs.symlinkSync(dir, path.join(ws, "linked"));
    mk(".hid");
    for (const p of ["nope", "../x", "afile", "linked", ".hid", "", 5, null, "a b"]) {
      const r = await api("/v1/turn", T({ project: p }));
      expect(r.status, String(p)).toBe(400);
      expect(r.json).toEqual({ error: "No such project." });
    }
    expect(runs()).toHaveLength(0);
  });
  it("a project swapped for a symlink after the snapshot is 409 The project folder changed on disk., no spawn", async () => {
    await start({ bridgeOpts: { afterSnapshot: () => { fs.rmSync(path.join(ws, "alpha"), { recursive: true }); fs.symlinkSync(dir, path.join(ws, "alpha")); } } });
    mk("alpha");
    const r = await api("/v1/turn", T({ project: "alpha" }));
    expect(r).toMatchObject({ status: 409, json: { error: "The project folder changed on disk." } });
    expect(runs()).toHaveLength(0);
  });
  it("a project swapped after the last check is refused by the child's own cwd", async () => {
    await start({ bridgeOpts: { beforeSpawn: () => { fs.rmSync(path.join(ws, "alpha"), { recursive: true }); fs.symlinkSync(dir, path.join(ws, "alpha")); } } });
    mk("alpha");
    const r = await api("/v1/turn", T({ project: "alpha" }));
    // beforeSpawn runs after the last check, so the child starts, and its own init cwd (the project's real path and identity) is what refuses it
    expect(ev(r, "message")).toHaveLength(0);
    expect(ev(r, "error")).toHaveLength(1);
  });
  it("confinement: in each-write a Write to ../beta, a Read of the code folder, and a Write inside the project", async () => {
    await start();
    mk("alpha");
    mk("beta");
    const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret0 }, body: JSON.stringify(T({
      project: "alpha", approval: "each-write",
      prompt: ASK({ tool_name: "Write", input: { file_path: "../beta/x.txt", content: "x" } }, { tool_name: "Write", input: { file_path: path.join(ws, "beta", "x.txt"), content: "x" } }, { tool_name: "Read", input: { file_path: path.join(ws, "beta", "y") } }, { tool_name: "Read", input: { file_path: "ok.txt" } }, { tool_name: "Glob", input: { pattern: "*.js", path: ".." } }),
    })) });
    await res.text();
    expect(rows("askjson").map((r) => r.decision.behavior)).toEqual(["deny", "deny", "deny", "allow", "deny"]);
  });
  it("a Write inside the project asks the person, and the summary is relative to the project", async () => {
    await start();
    mk("alpha");
    const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret0 }, body: JSON.stringify(T({ project: "alpha", approval: "each-write", prompt: "ASKWRITE", wait: 0 })) });
    // ASKWRITE writes to the code folder's a.txt (cwd is the project: alpha/a.txt)
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let req = null;
    let turnId = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const blk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const e = /event: (.*)/.exec(blk)?.[1];
        const d = JSON.parse(/data: (.*)/.exec(blk)?.[1] ?? "null");
        if (e === "start") turnId = d.turnId;
        if (e === "approval_request") {
          req = d;
          await fetch(`${base}/v1/approval`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret0 }, body: JSON.stringify({ turnId, id: d.id, allow: true }) });
        }
      }
    }
    expect(req).toMatchObject({ tool: "Write", summary: "a.txt" });
  });
  it("files_changed lists only the project's files", async () => {
    await start();
    mk("alpha");
    mk("beta");
    fs.writeFileSync(path.join(ws, "root.txt"), "x");
    // a stand-in cannot write files itself, so a file added during the turn comes from the test
    const r = await api("/v1/turn", T({ project: "alpha", prompt: "hello" }));
    const fc = ev(r, "files_changed")[0];
    expect(fc.added).toEqual([]);
    expect(fc.changed).toEqual([]);
  });
});

describe("one code turn per project", () => {
  const slow = (extra) => T({ prompt: "WAITFOREVER", ...extra });
  async function begin(body) {
    const ctl = new AbortController();
    const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret0 }, body: JSON.stringify(body), signal: ctl.signal });
    const reader = res.body.getReader();
    await reader.read(); // the start event
    return { res, ctl };
  }
  it("two projects run at once; the same project twice is 429; the code folder itself is its own key", async () => {
    await start();
    mk("alpha");
    mk("beta");
    const a = await begin(slow({ project: "alpha" }));
    const b = await begin(slow({ project: "beta" }));
    expect(b.res.status).toBe(200);
    expect(await api("/v1/turn", T({ project: "alpha" }))).toMatchObject({ status: 429, json: { error: "A code turn is already running in alpha." } });
    const root = await begin(slow());
    expect(root.res.status).toBe(200);
    expect((await api("/v1/turn", T())).status).toBe(429);
    for (const x of [a, b, root]) x.ctl.abort();
    await new Promise((r) => setTimeout(r, 300));
  });
});
