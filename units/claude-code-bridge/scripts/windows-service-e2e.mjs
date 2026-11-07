#!/usr/bin/env node
/**
 * Windows Always On, end to end, on a real Windows machine (the GitHub windows-latest runner in CI). No browser.
 *
 *   node scripts/windows-service-e2e.mjs [--expect-standard-user] [--profile C:\Users\someone]
 * --profile: run as if this were the user's profile folder (Start-Process -Credential keeps the caller's environment, so the CI job
 * that starts this as a new standard user names that user's folder here).
 *
 * The REAL built bridge is installed with `--install` (a stand-in claude by path), then:
 *   hello answers within 20 s with no logout; --status says installed / running / build; the start-up entry holds exactly the
 *   expected command; the log is not open to Everyone or to BUILTIN\Users; --code prints a code; pair + one turn works;
 *   taskkill of the bridge -> it is back within 15 s; taskkill of only the supervisor -> the bridge ends by itself; the
 *   start-up command read BACK FROM THE REGISTRY and run as Windows runs it brings the bridge up again (a simulated login);
 *   --uninstall stops it (hello fails) and leaves no registry value, launcher, log, supervisor file or process.
 * Two runs: the default label on the real home folder, and a label + a home folder with a space in the user name
 * (USERPROFILE and LOCALAPPDATA point at "...\Anna Maria"). Not a person logging in: a real login is not simulated beyond the above.
 * Exit code 0 when all pass. Off Windows it does nothing.
 */
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("Not Windows: nothing to do.");
  process.exit(0);
}
const profileAt = process.argv.indexOf("--profile");
if (profileAt > 0) {
  const prof = process.argv[profileAt + 1];
  const tmp = path.join(prof, "AppData", "Local", "Temp");
  fs.mkdirSync(tmp, { recursive: true });
  Object.assign(process.env, { USERPROFILE: prof, HOME: prof, LOCALAPPDATA: path.join(prof, "AppData", "Local"), APPDATA: path.join(prof, "AppData", "Roaming"), TEMP: tmp, TMP: tmp });
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(HERE, "..", "bridge", "bridge.mjs");
const FAKE = path.join(HERE, "..", "src", "fake-claude.mjs");
const SYS32 = path.win32.join(process.env.SystemRoot ?? "C:\\Windows", "System32");
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(m);
let failures = 0;
const check = (ok, what) => {
  say(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures += 1;
};
const tool = (name, args) => spawnSync(path.join(SYS32, name), args, { encoding: "utf8", windowsHide: true });
const alive = (pid) => tool("tasklist.exe", ["/FI", `PID eq ${pid}`, "/NH", "/FO", "CSV"]).stdout.includes(`"${pid}"`);
async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const hello = async (port) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/hello`, { signal: AbortSignal.timeout(2000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};

// Is this run elevated? (The CI runner is an administrator; the standard-user run is not.)
const groups = tool("whoami.exe", ["/groups"]).stdout;
const elevated = /S-1-16-12288/.test(groups);
say(`user: ${tool("whoami.exe", []).stdout.trim()}   elevated (High integrity level): ${elevated}`);
if (process.argv.includes("--expect-standard-user")) check(!elevated, "this run is NOT elevated: a normal user without administrator rights");

async function scenario(name, { home, label, port }) {
  say(`\n== ${name}`);
  const env = { ...process.env };
  if (home) {
    fs.mkdirSync(path.join(home, "AppData", "Local"), { recursive: true });
    Object.assign(env, { USERPROFILE: home, HOME: home, LOCALAPPDATA: path.join(home, "AppData", "Local"), APPDATA: path.join(home, "AppData", "Roaming") });
  }
  const userHome = home ?? os.homedir();
  const localDir = path.join(env.LOCALAPPDATA, "gilb-claude-code-bridge");
  const stateDir = path.join(userHome, ".gilb-claude-code-bridge");
  const launcher = path.join(localDir, `start-${label}.js`);
  const logFile = path.join(localDir, label === "com.gilb.claude-code-bridge" ? "bridge.log" : `${label}.log`);
  const flags = label === "com.gilb.claude-code-bridge" ? [] : ["--label", label];
  const portFlag = port === 47821 ? [] : ["--port", String(port)];
  const run = (args) => spawnSync(process.execPath, [BRIDGE, ...args], { env, encoding: "utf8", windowsHide: true });
  const readJson = (p) => {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  };
  const regValue = () => {
    const q = tool("reg.exe", ["query", RUN_KEY, "/v", label]);
    if (q.status !== 0) return null;
    return new RegExp(`${label.replace(/\./g, "\\.")}\\s+REG_SZ\\s+(.*)`).exec(q.stdout)?.[1]?.trim() ?? null;
  };
  let installed = false;
  try {
    // ---- install: starts at once, no logout
    const t0 = Date.now();
    const inst = run(["--install", "--claude", FAKE, "--allow-origin", "http://localhost:5197", ...flags, ...portFlag]);
    say(`--install exit ${inst.status}, ${((Date.now() - t0) / 1000).toFixed(1)} s\n${inst.stdout}${inst.stderr}`);
    installed = true;
    check(inst.status === 0 && /starts when you log in and restarts if it stops/.test(inst.stdout), "--install succeeded and says it starts at login and restarts");
    const h = await hello(port);
    check(h?.bridge === "gilb-claude-code-bridge" && h.build === "0.1.8", `hello answers right after --install, no logout (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    check((Date.now() - t0) < 20000, "within 20 seconds");
    check(/node ("\$HOME\\[^"]*"|'[^']*') --code/.test(inst.stdout), "the commands printed are PowerShell commands ($HOME form or single-quoted path)");

    // ---- what was created
    const q = (p) => (/\s/.test(p) ? `"${p}"` : p); // quoted only when it has a space, as the command line needs
    const expected = `${path.join(SYS32, "wscript.exe")} //B //Nologo //E:JScript ${q(launcher)}`;
    check(regValue() === expected, `the start-up entry under HKCU Run holds exactly: ${expected}\n      found: ${regValue()}`);
    check(fs.existsSync(launcher) && fs.existsSync(logFile), "launcher file and log file exist");
    const js = fs.readFileSync(launcher).subarray(2).toString("utf16le");
    check(/sh\.Run\(.*--supervise.*, 0, false\);/.test(js), "launcher runs the supervisor with window style 0 (hidden), no wait");
    const acl = tool("icacls.exe", [logFile]).stdout;
    say(`icacls ${logFile}\n${acl}`);
    check(!/Everyone:|BUILTIN\\Users:|Authenticated Users:/i.test(acl), "the log is not open to Everyone, BUILTIN\\Users or Authenticated Users (default ACL of the user's profile folder)");
    const aclDir = tool("icacls.exe", [localDir]).stdout;
    say(`icacls ${localDir}\n${aclDir}`);

    // ---- status
    const st = run(["--status", ...flags, ...portFlag]);
    say(st.stdout);
    check(/Installed:  yes/.test(st.stdout) && /Running:    yes \(supervisor pid \d+, bridge pid \d+\)/.test(st.stdout) && /build 0\.1\.8/.test(st.stdout), "--status: installed, running, build 0.1.8");

    // ---- code, pair, one turn
    const code = run(["--code", ...flags, ...portFlag]);
    const codeText = /Pairing code: ([A-Z0-9]{3}-[A-Z0-9]{3})/.exec(code.stdout)?.[1];
    check(!!codeText, `--code prints a pairing code (${codeText})`);
    const base = `http://127.0.0.1:${port}`;
    const pair = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: codeText }) });
    const { secret } = await pair.json();
    check(pair.status === 200 && typeof secret === "string", "paired");
    const turn = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ prompt: "hello always on", system: "be brief", tools: [] }) });
    const body = await turn.text();
    check(turn.status === 200 && body.includes("echo: hello always on"), "one full turn answered through claude, under the supervisor");
    const log1 = fs.readFileSync(logFile, "utf8");
    check(/Pairing code: [A-Z0-9]{3}-[A-Z0-9]{3}/.test(log1) && /supervisor: bridge started/.test(log1), "the log holds the banner (with the code) and the supervisor's lines");

    // ---- kill the bridge: it comes back
    const s1 = readJson(path.join(stateDir, "status.json"));
    const sup1 = readJson(path.join(stateDir, "supervisor.json"));
    const tk = tool("taskkill.exe", ["/PID", String(s1.pid), "/T", "/F"]);
    check(tk.status === 0, `taskkill /PID ${s1.pid} /T /F ended the bridge`);
    const killedAt = Date.now();
    const back = await waitFor(async () => {
      const s = readJson(path.join(stateDir, "status.json"));
      return s?.ok && s.pid !== s1.pid && alive(s.pid) && (await hello(port)) ? s : null;
    }, 15000, "the bridge to come back").catch(() => null);
    check(!!back, `the bridge is back within 15 s of taskkill (${((Date.now() - killedAt) / 1000).toFixed(1)} s, new pid ${back?.pid})`);
    check(alive(sup1.pid) && readJson(path.join(stateDir, "supervisor.json"))?.pid === sup1.pid, "the same supervisor did it");
    check(/starting it again in 1 s/.test(fs.readFileSync(logFile, "utf8")), "the log says the restart waited 1 s");

    // ---- kill only the supervisor: the bridge must not carry on unwatched
    const s2 = readJson(path.join(stateDir, "status.json"));
    tool("taskkill.exe", ["/PID", String(sup1.pid), "/F"]);
    const orphanGone = await waitFor(() => !alive(s2.pid), 15000, "the unwatched bridge to end").then(() => true).catch(() => false);
    check(orphanGone, "after the supervisor alone is killed, the bridge ends by itself (no unwatched bridge left)");
    check(!(await hello(port)), "nothing answers now");

    // ---- simulated login: run the command stored in the registry, as Windows runs a Run entry
    const stored = regValue();
    const exe = stored.slice(0, stored.indexOf(" "));
    const rest = stored.slice(exe.length + 1);
    const l0 = Date.now();
    spawn(exe, [rest], { windowsVerbatimArguments: true, detached: true, stdio: "ignore", windowsHide: true, env }).unref();
    const up = await waitFor(() => hello(port), 20000, "the bridge after the stored start-up command").catch(() => null);
    check(!!up, `the stored start-up command, run as Windows runs it, brings the bridge up (${((Date.now() - l0) / 1000).toFixed(1)} s; a stale supervisor.json from the killed one was replaced)`);

    // ---- uninstall
    const supNow = readJson(path.join(stateDir, "supervisor.json"));
    const stNow = readJson(path.join(stateDir, "status.json"));
    const un = run(["--uninstall", ...flags, ...portFlag]);
    say(un.stdout + un.stderr);
    installed = false;
    check(un.status === 0 && /no longer starts at login/.test(un.stdout), "--uninstall succeeded");
    check(!(await hello(port)), "after --uninstall nothing answers (hello fails)");
    check(regValue() === null, "the start-up entry is gone");
    check(!fs.existsSync(launcher) && !fs.existsSync(logFile) && !fs.existsSync(localDir), "launcher, log and their folder are gone");
    check(!fs.existsSync(path.join(stateDir, "supervisor.json")) && !fs.existsSync(path.join(stateDir, "supervisor.stop")), "no supervisor.json or stop marker is left");
    await sleep(500);
    check(!alive(supNow.pid) && !alive(stNow.pid), "the supervisor and the bridge processes are gone");
    const again = run(["--uninstall", ...flags, ...portFlag]);
    check(/was not installed/.test(again.stdout), "a second --uninstall says it was not installed");
  } catch (e) {
    check(false, `${name}: ${e.stack ?? e.message}`);
  } finally {
    if (installed) {
      const un = run(["--uninstall", ...flags, ...portFlag]);
      say(`cleanup uninstall: ${un.stdout}${un.stderr}`);
    }
    tool("reg.exe", ["delete", RUN_KEY, "/v", label, "/f"]);
  }
}

await scenario("default label, this user's real home folder", { home: null, label: "com.gilb.claude-code-bridge", port: 47821 });
const spaced = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-home-")), "Anna Maria");
await scenario(`a user name with a space: ${spaced}`, { home: spaced, label: "com.gilb.claude-code-bridge.spaced", port: 47831 });
say(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
