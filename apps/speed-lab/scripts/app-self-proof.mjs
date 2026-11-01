// Proves the any-app runner on Speed Lab itself, where the answers are known.
// Builds, serves `vite preview` on 5261, runs the runner, checks the known answers, and always stops the server.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main as runApp } from "./app-runner.mjs";
import { gitMeta } from "./results.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOG = join(homedir(), "Library/Logs/speed-lab-app-self.log");
const PORT = 5261;
const BASE = `http://localhost:${PORT}/`;
const URL = `${BASE}?entries=500&latency=600`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function taken(argv) {
  const out = { engines: null, profiles: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a !== "--engines" && a !== "--profiles") throw new Error(`usage: node scripts/app-self-proof.mjs [--engines chromium,webkit] [--profiles desktop,phone]\nunknown argument: ${a}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
    const slot = a === "--engines" ? "engines" : "profiles";
    if (out[slot] !== null) throw new Error(`${a} given twice`);
    out[slot] = v;
  }
  return out;
}

function knownLine(row) {
  const v = row.values ?? {};
  if (row.test === "SL-101") {
    const ok = row.pass === true && v.source === "preview" && typeof v.firstRowMs === "number" && v.firstRowMs < 2000 && typeof v.fullMs === "number" && v.fullMs > v.firstRowMs;
    return { ok, text: `KNOWN ${ok ? "PASS" : "FAIL"} ${row.engine}/${row.profile} SL-101 source preview, firstRowMs < 2000, fullMs > firstRowMs` };
  }
  if (row.test === "SL-102") {
    const ok = row.pass === true && v.source === "device";
    return { ok, text: `KNOWN ${ok ? "PASS" : "FAIL"} ${row.engine}/${row.profile} SL-102 source device` };
  }
  return { ok: false, text: `KNOWN FAIL ${row.engine}/${row.profile} unexpected ${row.test}` };
}

async function main() {
  let engines = null;
  let profiles = null;
  try {
    ({ engines, profiles } = taken(process.argv.slice(2)));
  } catch (e) {
    console.error(String(e?.message ?? e));
    process.exitCode = 2;
    return;
  }

  mkdirSync(dirname(LOG), { recursive: true });
  const logFd = openSync(LOG, "a");
  let server;
  let lsof = "";
  let code = 1;
  try {
    if (await fetch(BASE).then((r) => r.status, () => 0)) throw new Error(`port ${PORT} is already answering: stop what holds it first`);
    const build = spawnSync("npm", ["run", "build"], { cwd: APP, stdio: ["ignore", logFd, logFd] });
    if (build.status !== 0) throw new Error(`npm run build failed (see ${LOG})`);
    server = spawn("npx", ["vite", "preview"], { cwd: APP, stdio: ["ignore", logFd, logFd], detached: true });
    let exited = null;
    server.on("exit", (c) => { exited = c; });
    for (let i = 0; ; i++) {
      if (exited !== null) throw new Error(`vite preview exited (${exited}); port ${PORT} taken? see ${LOG}`);
      if ((await fetch(BASE).then((r) => r.status, () => 0)) === 200) break;
      if (i > 100) throw new Error("vite preview did not answer 200 in 20 s");
      await sleep(200);
    }
    const args = ["--url", URL, "--app", "speed-lab-self", "--key", "__speedProof", "--page", "entries", "--steps", "click:signin-ann", "--commit", gitMeta(APP).commit];
    if (engines) args.push("--engines", engines);
    if (profiles) args.push("--profiles", profiles);
    const result = await runApp(args, process.env);
    const rows = result.rows ?? [];
    let knownOk = rows.some((r) => r.test === "SL-101") && rows.some((r) => r.test === "SL-102");
    if (!knownOk) console.log("KNOWN FAIL -/- missing SL-101 or SL-102");
    for (const row of rows) {
      const k = knownLine(row);
      console.log(k.text);
      if (!k.ok) knownOk = false;
    }
    const allPassed = rows.length > 0 && rows.every((r) => r.pass === true);
    code = allPassed && knownOk && result.code === 0 ? 0 : 1;
  } catch (e) {
    console.error(String(e?.stack ?? e));
    code = 1;
  } finally {
    if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch { /* gone */ } }
    await sleep(800);
    if (server?.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch { /* gone */ } }
    closeSync(logFd);
    lsof = spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout.trim();
    console.log(`lsof :${PORT} LISTEN after the run: ${lsof === "" ? "(empty)" : lsof}`);
  }
  if (lsof) code = 1;
  process.exitCode = code;
}

main();
