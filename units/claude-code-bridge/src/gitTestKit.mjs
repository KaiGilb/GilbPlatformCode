// Test kit for the bridge's git save (GitHubSync Step 1): a bridge over real HTTP with the stand-in claude, and plain git
// readers that run with no config of the person, so a test never depends on the machine's git setup.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createBridge } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FAKE = path.join(HERE, "fake-claude.mjs");
export const APP = "http://localhost:5197";

// Git for Windows cannot open os.devNull (\\.\nul) as a config file: an empty file stands in for it there.
const EMPTY = process.platform === "win32" ? path.join(fs.mkdtempSync(path.join(os.tmpdir(), "git-empty-")), "empty") : "/dev/null";
if (process.platform === "win32") fs.writeFileSync(EMPTY, "");
const NO_HOOKS = process.platform === "win32" ? fs.mkdtempSync(path.join(os.tmpdir(), "git-nohooks-")) : "/dev/null";

/** A git that reads no system or global config and runs no hooks: used only to READ what the bridge wrote. */
export function plainGit(cwd, args, extraEnv = {}) {
  // No automatic gc or background maintenance: a test's own git must not change a repo after it returns.
  return execFileSync("git", ["-c", `core.hooksPath=${NO_HOOKS}`, "-c", "core.fsmonitor=false", "-c", "gc.auto=0", "-c", "maintenance.auto=false", ...args], {
    cwd,
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: os.tmpdir(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: EMPTY, LC_ALL: "C", ...extraEnv },
  });
}
export const commitCount = (repo) => {
  try {
    return Number(plainGit(repo, ["rev-list", "--count", "HEAD"]).trim());
  } catch {
    return 0; // no HEAD yet
  }
};
export const committedFiles = (repo, rev = "HEAD") => plainGit(repo, ["ls-tree", "-r", "--name-only", "-z", rev]).split("\0").filter(Boolean);
export const lastMessage = (repo) => plainGit(repo, ["log", "-1", "--format=%B"]);
export const fsckOk = (repo) => {
  try {
    plainGit(repo, ["fsck", "--strict", "--no-progress"]);
    return true;
  } catch {
    return false;
  }
};

/** A WRITEFILES line for the stand-in claude (see fake-claude.mjs). */
export const writes = (list) => `WRITEFILES:${Buffer.from(JSON.stringify(list)).toString("base64")}`;

/** Starts a bridge with a code folder `ws` (and optionally a project folder in it), paired. */
export async function startGitBridge({ project = "app", stateDir = true, bridgeOpts = {}, env = {} } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-git-")));
  const logFile = path.join(dir, "claude.log");
  const ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  if (project) fs.mkdirSync(path.join(ws, project));
  const bridge = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir, workspace: ws,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: process.platform === "win32" ? "win32" : "darwin",
    ...(stateDir ? { stateDir: path.join(dir, "state") } : {}),
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile, ...env }, ...bridgeOpts,
  });
  await bridge.start();
  const base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  const secret = (await res.json()).secret;
  const api = async (route, body = {}) => {
    const r = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify(body) });
    const events = [];
    let json = null;
    if (r.headers.get("content-type")?.includes("event-stream")) {
      for (const blk of (await r.text()).split("\n\n")) {
        const ev = /event: (.*)/.exec(blk)?.[1];
        const data = /data: (.*)/.exec(blk)?.[1];
        if (ev) events.push([ev, JSON.parse(data)]);
      }
    } else json = await r.json().catch(() => null);
    return { status: r.status, json, events };
  };
  const projPath = project ? path.join(ws, project) : ws;
  /** One code turn: `lines` are prompt lines; the stand-in answers "echo: <last line>", which becomes the commit's first line. */
  const turn = (lines, extra = {}) => api("/v1/turn", { system: "You are the agent.", prompt: lines.join("\n"), mode: "code", ...(project ? { project } : {}), ...extra });
  const close = async () => {
    await bridge.close();
    await removeTestDir(dir);
  };
  return { dir, ws, projPath, bridge, base, secret, api, turn, close };
}
export const ev = (r, name) => r.events.filter((e) => e[0] === name).map((e) => e[1]);
