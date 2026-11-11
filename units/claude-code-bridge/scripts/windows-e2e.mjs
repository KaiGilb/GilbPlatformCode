#!/usr/bin/env node
/**
 * End to end, no browser: the REAL built bridge (bridge/bridge.mjs) as its own process, a stand-in claude, over HTTP.
 * Pair, run one full turn, then Stop a second turn and check that the stand-in's whole process tree is gone.
 *
 *   node scripts/windows-e2e.mjs
 *
 * On Windows it runs three ways of naming claude: (a) --claude <path to a claude.cmd written the way npm's cmd-shim writes it,
 * which runs the stand-in with node>, (b) --claude claude, found on PATH by the bridge (PATHEXT), (c) --claude <the stand-in .mjs>.
 * Elsewhere only (c). Exit code 0 when all pass.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(HERE, "..", "bridge", "bridge.mjs");
const FAKE = path.join(HERE, "..", "src", "fake-claude.mjs");
const WIN = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(m);
let failures = 0;
const check = (ok, what) => {
  say(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures += 1;
};

const alive = (pid) => {
  if (WIN) {
    const out = execFileSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tasklist.exe"), ["/FI", `PID eq ${pid}`, "/NH", "/FO", "CSV"], { encoding: "utf8" });
    return out.includes(`"${pid}"`);
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The shim a real `npm i -g` writes (cmd-shim 8.0.0), for a package whose cli.js starts with a node shebang. */
function writeNpmStyleShim(dir) {
  const pkg = path.join(dir, "node_modules", "@anthropic-ai", "claude-code");
  fs.mkdirSync(pkg, { recursive: true });
  fs.copyFileSync(FAKE, path.join(pkg, "cli.js"));
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ type: "module" }));
  const shim = [
    "@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL", "CALL :find_dp0", "",
    'IF EXIST "%dp0%\\node.exe" (', '  SET "_prog=%dp0%\\node.exe"', ") ELSE (", '  SET "_prog=node"', "  SET PATHEXT=%PATHEXT:;.JS;=;%", ")", "",
    'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*', "",
  ].join("\r\n");
  fs.writeFileSync(path.join(dir, "claude.cmd"), shim);
  return path.join(dir, "claude.cmd");
}

async function scenario(label, claudeArg, extraEnv = {}) {
  say(`\n== ${label}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-e2e-"));
  const state = path.join(dir, "state");
  const logFile = path.join(dir, "fake.log");
  const env = { ...process.env, FAKE_CLAUDE_LOG: logFile, ...extraEnv };
  const bridge = spawn(process.execPath, [BRIDGE, "--claude", claudeArg, "--port", "0", "--state-dir", state, "--allow-origin", "http://localhost:5197"], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let out = "";
  bridge.stdout.on("data", (d) => (out += d));
  bridge.stderr.on("data", (d) => (out += d));
  try {
    await waitFor(() => /Pairing code: [A-Z0-9]{3}-[A-Z0-9]{3}/.test(out) || /did not start/.test(out), 30000, "the bridge banner");
    if (/did not start/.test(out)) throw new Error(`the bridge did not start:\n${out}`);
    const port = Number(/http:\/\/127\.0\.0\.1:(\d+)/.exec(out)[1]);
    const code = /Pairing code: ([A-Z0-9]{3}-[A-Z0-9]{3})/.exec(out)[1];
    const base = `http://127.0.0.1:${port}`;
    check(/Claude Code:  your own/.test(out), "banner printed");
    if (WIN) check(/node "\$HOME\\\.gilb-claude-code-bridge\.mjs" --code|node '.*' --code|node "\$HOME\\.*" --code/.test(out), "banner shows a PowerShell command for --code");

    // --code over the control door (reads token + status files under the state dir)
    const codeOut = execFileSync(process.execPath, [BRIDGE, "--code", "--state-dir", state], { encoding: "utf8", env });
    check(codeOut.includes(`Pairing code: ${code}`), `--code prints the same code (${code})`);

    const hello = await (await fetch(`${base}/v1/hello`)).json();
    check(hello.bridge === "gilb-claude-code-bridge" && hello.build === "0.1.9", "hello answers, build 0.1.9");
    const pair = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    const { secret } = await pair.json();
    check(pair.status === 200 && typeof secret === "string", "paired");
    const H = { "content-type": "application/json", "x-bridge-secret": secret };

    // one full turn
    const turn = await fetch(`${base}/v1/turn`, { method: "POST", headers: H, body: JSON.stringify({ prompt: "hello windows", system: "be brief", tools: [] }) });
    const body = await turn.text();
    check(turn.status === 200 && /event: message/.test(body) && body.includes("echo: hello windows") && /"payer":"person-claude-code"/.test(body), "one full turn answered through claude");
    check(/event: status/.test(body) && body.includes('"apiKeySource":"none"'), "the subscription proof (init apiKeySource none) was seen");

    // Stop: start a turn that never ends, with a child process, then go away (what the page's Stop does)
    const ac = new AbortController();
    const stop = fetch(`${base}/v1/turn`, { method: "POST", headers: H, body: JSON.stringify({ prompt: "SPAWNCHILD WAITFOREVER", system: "x", tools: [] }), signal: ac.signal }).then((r) => r.text()).catch(() => "aborted");
    const rows = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
    const kid = await waitFor(() => rows().find((r) => r.event === "child"), 30000, "the stand-in's child");
    const run = rows().filter((r) => r.event === "run").pop();
    check(alive(run.pid) && alive(kid.pid), `before Stop: claude (pid ${run.pid}) and its child (pid ${kid.pid}) are running`);
    ac.abort();
    await stop;
    await waitFor(() => !alive(run.pid), 15000, "claude to end");
    check(!alive(run.pid), "after Stop: claude is gone");
    if (WIN) {
      await waitFor(() => !alive(kid.pid), 15000, "its child to end").catch(() => {});
      check(!alive(kid.pid), "after Stop: the child of claude is gone too (whole tree ended with taskkill)");
    } else {
      say(`NOTE  off Windows the bridge sends SIGTERM to claude only; the stand-in's child is ${alive(kid.pid) ? "still running (unchanged behaviour)" : "gone"}`);
      if (alive(kid.pid)) process.kill(kid.pid, "SIGKILL");
    }
  } catch (e) {
    check(false, `${label}: ${e.message}\n--- bridge output ---\n${out}`);
  } finally {
    bridge.kill();
    await sleep(300);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (WIN) {
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), "npm-bin-"));
  const shim = writeNpmStyleShim(shimDir);
  // The fixture really is a working shim (cmd.exe itself runs it), so the bridge is tested against the real format.
  const viaCmd = execFileSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe"), ["/d", "/c", shim, "auth", "status"], { encoding: "utf8" });
  check(JSON.parse(viaCmd).loggedIn === true, "the shim fixture runs under cmd.exe (it is a real npm-style shim)");
  await scenario("(a) --claude <path to claude.cmd, an npm shim>", shim);
  await scenario("(b) --claude claude, found on PATH through PATHEXT", "claude", { PATH: `${shimDir};${process.env.PATH ?? process.env.Path}` });
  await scenario("(c) --claude <the stand-in .mjs>, started by node", FAKE);
  fs.rmSync(shimDir, { recursive: true, force: true });
} else {
  await scenario("(c) --claude <the stand-in .mjs> (not Windows: no .cmd cases)", FAKE);
}
say(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
