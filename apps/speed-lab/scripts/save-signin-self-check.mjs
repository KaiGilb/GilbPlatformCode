// Headless proof that save-signin waits for the meter and writes a mode-600 file.
// Not part of npm test: it needs the preview server and a real browser, and CI has no browsers.
// Builds, serves `vite preview` on 5261, saves, prints the mode, forgets the file, and always stops the server.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { forgetSignin } from "./forget-signin.mjs";
import { insideGitTree, saveSignin } from "./save-signin.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOG = join(homedir(), "Library/Logs/speed-lab-save-signin-self.log");
const PORT = 5261;
const BASE = `http://localhost:${PORT}/`;
const URL = `${BASE}?entries=30&latency=50`;
const SPEED_TMP = "/Users/kaigilb/Developer/.grok-runs/speedkit-dev/sl5c/tmp";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function whyOf(e) {
  const line = String(e?.message ?? e).split("\n")[0].trim();
  return line || "failed";
}

function tempOut() {
  const roots = [SPEED_TMP];
  const env = process.env.TMPDIR;
  if (env && env !== SPEED_TMP) roots.push(env);
  const skipped = [];
  for (const root of roots) {
    if (insideGitTree(join(root, "x.json"))) { skipped.push(root); continue; }
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const dir = mkdtempSync(join(root, "save-signin-self-"));
    chmodSync(dir, 0o700);
    if (skipped.length) console.log(`temp root: ${root} (${skipped.join(", ")} is inside a git work tree)`);
    return { dir, out: join(dir, "signin.json") };
  }
  throw new Error(`every temp root is inside a git work tree: ${roots.join(", ")}`);
}

function assertStorageShape(file) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(file, "utf8")); }
  catch { throw new Error("saved file is not JSON"); }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.cookies) || !Array.isArray(parsed.origins)) {
    throw new Error("saved file is missing cookies or origins arrays");
  }
}

async function main() {
  const { dir, out } = tempOut();
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
    let clicked = false;
    const result = await saveSignin({
      url: URL,
      out,
      key: "__speedProof",
      page: "entries",
      engine: "chromium",
      timeout: 60_000,
      headless: true,
      onReady: async (page) => {
        const before = await page.evaluate(() => window.__speedProof?.lastPaint ?? null);
        if (before && before.page === "entries") throw new Error("entries was already painted before sign-in");
        await page.click('[data-testid="signin-ann"]');
        clicked = true;
      },
    });
    if (result.code !== 0) throw new Error("save-signin did not save");
    if (!clicked) throw new Error("sign-in click did not run");
    const stat = spawnSync("stat", ["-f", "%Lp", out], { encoding: "utf8" });
    const mode = String(stat.stdout ?? "").trim();
    console.log(`stat -f %Lp ${out}: ${mode}`);
    const nodeMode = (statSync(out).mode & 0o777).toString(8);
    if (mode !== "600" || nodeMode !== "600") throw new Error(`expected mode 600, stat said ${mode || "(empty)"}, node said ${nodeMode}`);
    assertStorageShape(out);
    code = 0;
  } catch (e) {
    console.error(whyOf(e));
    code = 1;
  } finally {
    if (existsSync(out)) {
      try {
        const forgotten = forgetSignin(out);
        console.log(forgotten.message);
        if (forgotten.code !== 0) code = 1;
      } catch (e) {
        console.error(whyOf(e));
        code = 1;
      }
    }
    rmSync(dir, { recursive: true, force: true });
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
