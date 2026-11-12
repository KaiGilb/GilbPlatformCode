#!/usr/bin/env node
/**
 * Runs the REAL Codex install commands from codexInstallCommands() in a real shell, the way a person pastes them,
 * against the real Codex CLI (@openai/codex), and reads back what Codex stored.
 *
 *   node scripts/codex-commands-e2e.mjs --shell bash|powershell|pwsh [--codex-bin-dir DIR]
 *
 * bash = a POSIX shell (macOS, Linux). powershell = Windows PowerShell 5.1 (powershell.exe). pwsh = PowerShell 7.
 * Needs `npm run build:connector` first: the built connector/gilb-connector.mjs is what gets served and downloaded.
 * --codex-bin-dir DIR puts DIR first on PATH for the child shell (a local install of Codex; in CI Codex is installed globally).
 *
 * Nothing touches the real home: a throwaway folder is made, HOME and USERPROFILE (and HOMEDRIVE/HOMEPATH on Windows)
 * point at it, and CODEX_HOME is a folder inside it. The connector file is served from a tiny local server at
 * http://127.0.0.1:<port>/app/gilb-connector.mjs. Each command string goes to the shell exactly as returned; for PowerShell
 * with -EncodedCommand, so no quoting sits between us and the shell.
 *
 * The `add` line is run exactly as codexInstallCommands() returns it. If that stores something else (PowerShell may swallow
 * the bare `--` when it calls the npm shim codex.ps1), the script tries two other forms, in order, and prints which one
 * works. The script still FAILS then, because the string a guide shows must be the one that works.
 * Exit 0 only if every check passes.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : d;
};
const SHELL = arg("--shell");
if (!["bash", "powershell", "pwsh"].includes(SHELL)) throw new Error("--shell must be bash, powershell or pwsh");
const WINDOWS = process.platform === "win32";
if (SHELL !== "bash" && !WINDOWS) {
  console.log("Not Windows: the PowerShell cases run only on Windows. Nothing to do.");
  process.exit(0);
}
const CODEX_BIN_DIR = arg("--codex-bin-dir");
const unit = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { codexInstallCommands } = await import(pathToFileURL(path.join(unit, "connector", "vite-plugin.mjs")).href);
const built = fs.readFileSync(path.join(unit, "connector", "gilb-connector.mjs"));

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures += 1;
};

// the throwaway home and Codex home
// realpath: on macOS /var is a link to /private/var, and the connector only starts when its own path is not a link.
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "codexcmd-")));
const home = path.join(work, "home");
const codexHome = path.join(home, ".codex");
fs.mkdirSync(codexHome, { recursive: true });
const env = { ...process.env, HOME: home, CODEX_HOME: codexHome };
if (WINDOWS) {
  env.USERPROFILE = home;
  env.HOMEDRIVE = path.parse(home).root.replace(/[\\/]$/, "");
  env.HOMEPATH = home.slice(env.HOMEDRIVE.length);
}
if (CODEX_BIN_DIR) env.PATH = `${path.resolve(CODEX_BIN_DIR)}${path.delimiter}${process.env.PATH}`;
const sep = WINDOWS ? "\\" : "/";
const downloaded = `${home}${sep}.gilb-connector.mjs`;

// the tiny static server
const server = http.createServer((req, res) => {
  if (req.url === "/app/gilb-connector.mjs") {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(built);
  } else {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/app/gilb-connector.mjs`;
const shellKind = SHELL === "bash" ? "posix" : "powershell";
const EXE = SHELL === "bash" ? "bash" : SHELL === "powershell" ? "powershell.exe" : "pwsh";

const shellArgs = (cmd) =>
  SHELL === "bash" ? ["-c", cmd] : ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(cmd, "utf16le").toString("base64")];
// Asynchronous on purpose: the download is answered by the server in THIS process, which a blocking spawnSync would freeze.
const run = (cmd) =>
  new Promise((resolve) => {
    const c = spawn(EXE, shellArgs(cmd), { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    c.stdout.on("data", (d) => (stdout += d));
    c.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => c.kill(), 120000);
    c.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
const out = (r) => `${r.stdout ?? ""}${r.stderr ?? ""}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** What Codex stored for `server`: { command, args } or null. */
async function stored(server) {
  const r = await run(`codex mcp get ${server} --json`);
  if (r.status !== 0) {
    console.log(`  codex mcp get ${server} --json -> exit ${r.status}\n${out(r)}`);
    return null;
  }
  try {
    const t = JSON.parse(r.stdout).transport;
    return { command: t.command, args: t.args };
  } catch (err) {
    console.log(`  could not read the JSON: ${err.message}\n${r.stdout}`);
    return null;
  }
}

// the other forms of the PowerShell add line, in the order they are tried
const alternatives = (add) => [
  ["quoted '--'", add.replace(" -- ", " '--' ")],
  ["codex.cmd", add.replace(/^codex /, "codex.cmd ")],
];

try {
  const ver = await run("codex --version");
  console.log(`shell: ${EXE}   server: ${url}\nhome: ${home}\ncodex: ${ver.stdout.trim() || out(ver).trim()}`);
  check(ver.status === 0 && /0\.167\.2/.test(ver.stdout), "codex 0.167.2 is on PATH");
  if (SHELL !== "bash") {
    const major = await run("$PSVersionTable.PSVersion.Major");
    const want = SHELL === "powershell" ? 5 : 7;
    check(major.status === 0 && Number(major.stdout.trim()) === want, `the shell is PowerShell ${want} (major version printed: ${major.stdout.trim()})`);
  }

  // download, exactly as returned
  const base = codexInstallCommands(url, { shell: shellKind });
  console.log(`download: ${base.download}`);
  const dl = await run(base.download);
  if (dl.status !== 0) console.log(out(dl));
  check(dl.status === 0, "the download string exits 0");
  check(fs.existsSync(downloaded) && fs.readFileSync(downloaded).equals(built), "the file under $HOME is byte-identical to the built connector");

  // add, with and without a name
  for (const name of [undefined, "kai"]) {
    const cmds = codexInstallCommands(url, { shell: shellKind, name });
    const label = name === undefined ? "no name" : `name ${name}`;
    const want = { command: "node", args: [downloaded, "--hop-cli", "codex", ...(name ? ["--profile", name] : [])] };
    console.log(`add (${label}): ${cmds.add}`);
    const forms = [["as returned", cmds.add], ...(shellKind === "powershell" ? alternatives(cmds.add) : [])];
    let working = null;
    for (const [formName, line] of forms) {
      await run(`codex mcp remove ${cmds.server}`);
      const r = await run(line);
      const got = r.status === 0 ? await stored(cmds.server) : null;
      const ok = got !== null && got.command === want.command && same(got.args, want.args);
      if (formName === "as returned") {
        if (r.status !== 0) console.log(out(r));
        check(ok, `add (${label}) as returned stores command "node" and args ${JSON.stringify(want.args)}${ok ? "" : ` (stored: ${JSON.stringify(got)})`}`);
      } else {
        console.log(`${ok ? "PASS" : "FAIL"}  (diagnostic) add (${label}) in the form ${formName}: ${line}${ok ? "" : ` (stored: ${JSON.stringify(got)})`}`);
      }
      if (ok) {
        working = formName;
        break;
      }
    }
    console.log(`WORKING ADD FORM (${label}): ${working ?? "none"}`);
    await run(`codex mcp remove ${cmds.server}`);
  }

  // the downloaded connector runs and knows --hop-cli
  const help = await run(WINDOWS ? `node "$HOME\\.gilb-connector.mjs" --help` : "node ~/.gilb-connector.mjs --help");
  check(help.status === 0 && out(help).includes("--hop-cli"), "node <downloaded file> --help prints --hop-cli");
} finally {
  server.close();
  fs.rmSync(work, { recursive: true, force: true });
}
console.log(failures ? `\nFAILED: ${failures} check(s)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
