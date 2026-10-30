// Starts the app for the live check on localhost:5197 (see vite.live.config.ts): a real sign-in and a read-only list of ONE vault.
// Usage: node scripts/dev-live.mjs --vault https://<host>/vault [--platform https://<platform host>]
import net from "node:net";
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function probe(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
  });
}

export async function portInUse(port) {
  const [v4, v6] = await Promise.all([probe("127.0.0.1", port), probe("::1", port)]);
  return v4 || v6;
}

/** `https://<host>/vault` and nothing else (no port, path, query or user part). Returns the URL's parts, or a reason. */
export function checkVault(value) {
  let u;
  try { u = new URL(String(value ?? "")); } catch { return { problem: `--vault must be an https://<host>/vault address, not ${JSON.stringify(value)}` }; }
  if (u.protocol !== "https:" || u.pathname !== "/vault" || u.search || u.hash || u.port || u.username || u.password || String(value).replace(/\/$/, "") !== `https://${u.host}/vault`) {
    return { problem: `--vault must be exactly https://<host>/vault, not ${JSON.stringify(value)}` };
  }
  return { vault: `https://${u.host}/vault`, host: u.hostname };
}

/** The platform origin that signs the person in: the vault host with its first label taken off (`https://kai.example.test/vault` -> `https://example.test`), unless --platform names it. */
export function platformFor(host, given) {
  if (given) {
    let u;
    try { u = new URL(given); } catch { return { problem: `--platform must be an https origin, not ${JSON.stringify(given)}` }; }
    if (u.protocol !== "https:" || u.origin !== given.replace(/\/$/, "")) return { problem: `--platform must be an https origin like https://example.test, not ${JSON.stringify(given)}` };
    if (!host.endsWith(`.${u.hostname}`)) return { problem: `the vault host ${host} is not under the platform host ${u.hostname}` };
    return { origin: u.origin };
  }
  const labels = host.split(".");
  if (labels.length < 3) return { problem: `cannot take the platform host from ${host}; pass --platform https://<platform host>` };
  return { origin: `https://${labels.slice(1).join(".")}` };
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--vault") out.vault = argv[++i];
    else if (argv[i] === "--platform") out.platform = argv[++i];
    else return { problem: `unknown argument ${JSON.stringify(argv[i])}` };
  }
  return out;
}

export async function main({ argv = process.argv.slice(2), port = 5197, spawnFn = spawn, log = console.log, err = console.error, logFile = join(homedir(), "Library/Logs/speed-kit-taking-app-live.log") } = {}) {
  const args = parseArgs(argv);
  if (args.problem) { err(args.problem); return 1; }
  if (!args.vault) { err("usage: node scripts/dev-live.mjs --vault https://<host>/vault"); return 1; }
  const v = checkVault(args.vault);
  if (v.problem) { err(v.problem); return 1; }
  const p = platformFor(v.host, args.platform);
  if (p.problem) { err(p.problem); return 1; }
  if (await portInUse(port)) {
    err(`localhost:${port} is already in use (is GilbApp's dev server running?). Stop it, then run npm run dev:live again.`);
    return 1;
  }
  log(`Open http://localhost:${port}   (reads ${v.vault}; signs in at ${p.origin})`);
  log("Production admits this origin; the app's own port 5261 is refused there.");
  log("The code arrives by email. Writes are not part of this build: it only reads.");
  log("On this local check a reload signs you out; sign in again with a new code.");
  const vite = fileURLToPath(new URL("../node_modules/.bin/vite", import.meta.url));
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  mkdirSync(dirname(logFile), { recursive: true });
  const fd = openSync(logFile, "a");
  writeSync(fd, `\n--- ${new Date().toISOString()} dev:live ${v.vault}\n`);
  const env = { ...process.env, VITE_PLATFORM: "live", VITE_PINNED_VAULT: v.vault, VITE_PLATFORM_ORIGIN: p.origin };
  const child = spawnFn(vite, ["--config", "vite.live.config.ts"], { cwd, env, stdio: ["ignore", fd, fd] });
  const forward = (signal) => () => child.kill(signal);
  const onInt = forward("SIGINT");
  const onTerm = forward("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  return new Promise((resolve) => {
    let done = false;
    const finish = (code) => {
      if (done) return;
      done = true;
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
      try { closeSync(fd); } catch { /* closed */ }
      resolve(code);
    };
    child.once("exit", (code) => finish(code ?? 1));
    child.once("error", (e) => {
      if (done) return;
      err(`Could not start vite (${e.code ?? e.message}). Run npm ci in apps/speed-kit-taking-app first.`);
      finish(1);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
