#!/usr/bin/env node
/**
 * Runs the REAL Windows commands from bridgeCommands() in a real PowerShell, the way a person pastes them.
 *
 *   node --experimental-strip-types scripts/windows-commands-e2e.mjs --shell powershell|pwsh [--bridge-ref origin/kaizen/claude-code-windows-1107]
 *
 * --shell powershell = Windows PowerShell 5.1 (powershell.exe); --shell pwsh = PowerShell 7. Windows only.
 * The bridge file comes from `git show <ref>:units/claude-code-bridge/bridge/bridge.mjs` and is served by a tiny local server
 * at http://127.0.0.1:<port>/app/claude-code-bridge.mjs. A stand-in claude (the bridge's own fake-claude.mjs behind a claude.cmd
 * shim written the way npm writes it) is put first on PATH, because the pasted commands cannot carry --claude.
 * Each command string is passed to the shell with -EncodedCommand (the same text, no quoting between us and PowerShell).
 * Cases: install (hello within 20 s) -> code prints a code -> --uninstall; start in the background -> hello -> code -> stop;
 * a 404 download (with an old bridge file already in place) must NOT run node. Exit code 0 when all pass.
 */
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bridgeCommands } from "../src/commands.ts";

if (process.platform !== "win32") {
  console.log("Not Windows: nothing to do.");
  process.exit(0);
}
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : d;
};
const SHELL = arg("--shell");
const REF = arg("--bridge-ref", "origin/kaizen/claude-code-windows-1107");
if (SHELL !== "powershell" && SHELL !== "pwsh") throw new Error("--shell must be powershell or pwsh");
const EXE = SHELL === "powershell" ? "powershell.exe" : "pwsh";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures += 1;
};
const show = (p) => execFileSync("git", ["show", `${REF}:${p}`], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });

// the bridge file and the stand-in claude, from the Windows bridge branch
const work = fs.mkdtempSync(path.join(os.tmpdir(), "wincmd-"));
const bridgeText = show("units/claude-code-bridge/bridge/bridge.mjs");
fs.writeFileSync(path.join(work, "bridge.mjs"), bridgeText);
const fakeBin = path.join(work, "fakebin");
const pkg = path.join(fakeBin, "node_modules", "@anthropic-ai", "claude-code");
fs.mkdirSync(pkg, { recursive: true });
fs.writeFileSync(path.join(pkg, "cli.js"), show("units/claude-code-bridge/src/fake-claude.mjs"));
fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ type: "module" }));
fs.writeFileSync(
  path.join(fakeBin, "claude.cmd"),
  [
    "@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL", "CALL :find_dp0", "",
    'IF EXIST "%dp0%\\node.exe" (', '  SET "_prog=%dp0%\\node.exe"', ") ELSE (", '  SET "_prog=node"', "  SET PATHEXT=%PATHEXT:;.JS;=;%", ")", "",
    'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*', "",
  ].join("\r\n"),
);
const env = { ...process.env, PATH: `${fakeBin};${process.env.PATH}` };

// the tiny static server: the bridge under /app/, everything else 404
const server = http.createServer((req, res) => {
  if (req.url === "/app/claude-code-bridge.mjs") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(bridgeText);
  } else {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const good = bridgeCommands({ origin, basePath: "/app/", allowOrigin: origin }).windows;
const missing = bridgeCommands({ origin, basePath: "/missing/", allowOrigin: origin }).windows;
console.log(`shell: ${EXE}   server: ${origin}\ninstall: ${good.install}\nstart:   ${good.start}\ncode:    ${good.code}`);

const encoded = (cmd) => Buffer.from(cmd, "utf16le").toString("base64");
const shellArgs = (cmd) => ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded(cmd)];
// Asynchronous on purpose: the download is answered by the server in THIS process, which a blocking spawnSync would freeze.
const run = (cmd) =>
  new Promise((resolve) => {
    const c = spawn(EXE, shellArgs(cmd), { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    c.stdout.on("data", (d) => (stdout += d));
    c.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      killTree(c.pid);
    }, 120000);
    c.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
const hello = async () => {
  try {
    const r = await fetch("http://127.0.0.1:47821/v1/hello", { signal: AbortSignal.timeout(2000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};
async function helloWithin(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const h = await hello();
    if (h) return h;
    await sleep(250);
  }
  return null;
}
async function noHelloFor(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await hello()) return false;
    await sleep(250);
  }
  return true;
}
const bridgePath = path.join(os.homedir(), ".gilb-claude-code-bridge.mjs");
function killTree(pid) {
  return spawnSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"), ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
}
const out = (r) => `${r.stdout ?? ""}${r.stderr ?? ""}`;

try {
  // which shell are we really in
  const ver = await run("$PSVersionTable.PSVersion.Major");
  check(ver.status === 0 && Number(ver.stdout.trim()) === (SHELL === "powershell" ? 5 : 7), `the shell is PowerShell ${SHELL === "powershell" ? 5 : 7} (major version printed: ${ver.stdout.trim()})`);

  // 1. Always On: the exact install string, hello within 20 s, the exact code string, then uninstall
  fs.rmSync(bridgePath, { force: true });
  const t0 = Date.now();
  const inst = await run(good.install);
  console.log(`--- install, exit ${inst.status}, ${((Date.now() - t0) / 1000).toFixed(1)} s\n${out(inst)}`);
  check(inst.status === 0, "the install string exits 0");
  check(fs.existsSync(bridgePath), "the download wrote the bridge file under $HOME");
  const h = await helloWithin(20000);
  check(h?.bridge === "gilb-claude-code-bridge", `/v1/hello answers within 20 s of the install string (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const code = await run(good.code);
  console.log(`--- code, exit ${code.status}\n${out(code)}`);
  check(code.status === 0 && /Pairing code: [A-Z0-9]{3}-[A-Z0-9]{3}/.test(code.stdout), "the code string prints a pairing code");
  const un = await run('node "$HOME\\.gilb-claude-code-bridge.mjs" --uninstall');
  console.log(`--- uninstall, exit ${un.status}\n${out(un)}`);
  check(un.status === 0, "--uninstall exits 0");
  check(await noHelloFor(3000), "after --uninstall the bridge no longer answers");

  // 2. One session: the exact start string in a background shell
  fs.rmSync(bridgePath, { force: true });
  let log = "";
  const child = spawn(EXE, shellArgs(good.start), { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const h2 = await helloWithin(30000);
  check(h2?.bridge === "gilb-claude-code-bridge", "start string: /v1/hello answers while the session runs");
  check(/Pairing code: [A-Z0-9]{3}-[A-Z0-9]{3}/.test(log), "start string: the window shows a pairing code");
  const code2 = await run(good.code);
  check(code2.status === 0 && /Pairing code: [A-Z0-9]{3}-[A-Z0-9]{3}/.test(code2.stdout), "start string: the code string prints the same running bridge's code");
  killTree(child.pid);
  check(await noHelloFor(3000), "start string: after stopping the session the bridge no longer answers");
  console.log(`--- start session log\n${log}`);

  // 3. A failed download must not run node: an OLD bridge file is in place, the URL is a 404
  fs.writeFileSync(bridgePath, bridgeText);
  const t404 = await run(missing.start);
  console.log(`--- 404 start, exit ${t404.status}\n${out(t404)}`);
  check(await noHelloFor(5000), "404 download: node did not run (no bridge answers although an old bridge file is in place)");
  check(/404/.test(out(t404)), `404 download: curl.exe reports the 404 (shell exit ${t404.status})`);
  const t404i = await run(missing.install);
  check(await noHelloFor(3000), "404 download: the install string did not run node either");
  console.log(`--- 404 install, exit ${t404i.status}\n${out(t404i)}`);
} finally {
  await run('node "$HOME\\.gilb-claude-code-bridge.mjs" --uninstall');
  server.close();
}
console.log(failures ? `\nFAILED: ${failures} check(s)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
