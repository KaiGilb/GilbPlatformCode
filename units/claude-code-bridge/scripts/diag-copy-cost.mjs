// Batch F diagnostic: removed before merge.
// X4 part B: what does one snapshotBuild copy cost on this machine, and what part of the preview "snapshotBuild alone" test's per-iteration cost is
// the copy, the test's own re-read of every copied file, the symlink swapper running beside it, or the disk itself? Measures only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { snapshotBuild } from "../bridge/bridge.mjs";

const MARKER = "MARKER-OUTSIDE-SECRET";
const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "diag-copy-")));
const ms = (t) => Math.round(performance.now() - t);
const allFiles = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? allFiles(path.join(d, e.name)) : [path.join(d, e.name)]));
console.log(`platform=${process.platform} node=${process.version} tmp=${os.tmpdir()}`);
if (process.platform === "win32") {
  try { console.log("defender realtime disabled:", execFileSync("powershell.exe", ["-NoProfile", "-Command", "(Get-MpPreference).DisableRealtimeMonitoring; (Get-MpComputerStatus).RealTimeProtectionEnabled"], { encoding: "utf8", timeout: 20000 }).trim().replace(/\r?\n/g, " | ")); } catch (e) { console.log("defender query failed:", String(e.message).slice(0, 100)); }
}
let t = performance.now();
const p = path.join(dir, "app"); const out = path.join(dir, "outside");
fs.mkdirSync(path.join(out, "sub"), { recursive: true });
fs.mkdirSync(path.join(p, "dist", "sub"), { recursive: true });
for (let i = 0; i < 400; i++) { fs.writeFileSync(path.join(out, "sub", `f${i}`), MARKER); fs.writeFileSync(path.join(p, "dist", "sub", `f${i}`), `REAL-${i}`); }
fs.writeFileSync(path.join(out, "index.html"), MARKER); fs.writeFileSync(path.join(out, "id"), MARKER); fs.writeFileSync(path.join(out, "sub", "id"), MARKER);
fs.writeFileSync(path.join(p, "dist", "sub", "id"), "REAL-SUB-ID");
console.log(`fixture (802 small files) ${ms(t)} ms`);
t = performance.now();
try { fs.symlinkSync(out, path.join(p, "dist", "sub_link")); fs.symlinkSync(out, path.join(p, "dist_link")); console.log(`2 symlinks created ${ms(t)} ms`); } catch (e) { console.log(`symlink failed: ${e.code} ${e.message}`); }
const dist = path.join(p, "dist");

async function loop(label, n, verify) {
  let copy = 0, ver = 0, ok = 0, changed = 0;
  for (let i = 0; i < n; i++) {
    const dest = path.join(dir, `${label}-${i}`);
    t = performance.now();
    try { await snapshotBuild(dist, dest); ok++; } catch (e) { if (e.body?.error === "build-changed") changed++; else throw e; }
    copy += ms(t);
    if (verify) { t = performance.now(); if (fs.existsSync(dest)) allFiles(dest).some((f) => fs.readFileSync(f, "utf8").includes(MARKER)); ver += ms(t); }
  }
  console.log(`${label}: ${n} iterations; copy avg ${Math.round(copy / n)} ms${verify ? `; verify (list + read every copied file) avg ${Math.round(ver / n)} ms` : ""}; ok ${ok}, changed ${changed}`);
}
await loop("plain-copy-only", 10, false);
await loop("plain-copy-and-verify", 10, true);
// the same swapper as the test
const stop = path.join(dir, "stop-swap");
const src = fs.readFileSync(new URL("../src/preview.test.mjs", import.meta.url), "utf8").match(/const swapper = [\s\S]*?\{ stdio: "ignore" \}\);/)[0];
const swapper = new Function("spawn", `${src.replace("const swapper =", "return")}`)(spawn);
const kid = swapper(dist, "sub", stop);
await loop("with-swapper-copy-only", 10, false);
await loop("with-swapper-copy-and-verify", 10, true);
fs.writeFileSync(stop, ""); await new Promise((r) => (kid.exitCode !== null ? r() : kid.once("exit", r)));
t = performance.now();
fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
console.log(`cleanup ${ms(t)} ms`);
