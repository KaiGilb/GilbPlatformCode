// Batch F diagnostic: removed before merge.
// Why does the bridge's `git init` (src/bridge.ts, POST /v1/projects/create) fail on the Windows runner? Runs that exact call and
// four variants, each on a fresh temp folder, and prints what the failure looks like. Measures only; changes nothing.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const env = { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_TEMPLATE_DIR: "" };
const show = (label, fn) => { console.log(`--- ${label}`); try { console.log(String(fn() ?? "").trim()); } catch (e) { console.log(`threw: ${e?.code ?? ""} ${e?.message ?? e}`); } };
console.log(`platform=${process.platform} node=${process.version} devNull=${os.devNull}`);
show("git --version", () => execFileSync("git", ["--version"], { encoding: "utf8" }));
show(process.platform === "win32" ? "where git" : "which -a git", () => execFileSync(process.platform === "win32" ? "where" : "which", process.platform === "win32" ? ["git"] : ["-a", "git"], { encoding: "utf8" }));

const variants = {
  V0: { bin: "git", args: (p) => ["-c", "core.hooksPath=/dev/null", "init", "--quiet", "--template=", p] },
  V1: { bin: "git", args: (p) => ["init", "--quiet", "--template=", p] },
  V2: { bin: "git", args: (p) => ["-c", "core.hooksPath=/dev/null", "init", "--quiet", p] },
  V3: { bin: "git", args: (p) => ["-c", `core.hooksPath=${os.devNull}`, "init", "--quiet", "--template=", p] },
  V5: { bin: "git", args: (p) => ["init", "--quiet", "--template=", p], env: { ...env, GIT_CONFIG_GLOBAL: "NUL" } },
  V6: { bin: "git", args: (p) => ["init", "--quiet", "--template=", p], env: (() => { const e = { ...env }; delete e.GIT_CONFIG_GLOBAL; return e; })() },
  V7: { bin: "git", args: (p) => ["-c", "core.hooksPath=/dev/null", "init", "--quiet", "--template=", p], env: (() => { const e = { ...env }; delete e.GIT_CONFIG_GLOBAL; return e; })() },
  V8: { bin: "git", args: (p) => ["init", "--quiet", "--template=", p], envFn: (root) => { const f = path.join(root, "empty.gitconfig"); fs.writeFileSync(f, ""); return { ...env, GIT_CONFIG_GLOBAL: f }; } },
  V4: { bin: "git.exe", args: (p) => ["-c", "core.hooksPath=/dev/null", "init", "--quiet", "--template=", p], shell: false },
};
// V0 is run twice: once exactly as the bridge does (stdio "ignore", so no stderr), once with piped stdio to see the stderr.
const runs = [["V0 (exact, stdio ignore)", "V0", "ignore"], ["V0 (stdio pipe)", "V0", "pipe"], ["V1", "V1", "pipe"], ["V2", "V2", "pipe"], ["V3", "V3", "pipe"], ["V4", "V4", "pipe"], ["V5 (GIT_CONFIG_GLOBAL=NUL)", "V5", "pipe"], ["V6 (no GIT_CONFIG_GLOBAL)", "V6", "pipe"], ["V7 (V0 args, no GIT_CONFIG_GLOBAL)", "V7", "pipe"], ["V8 (GIT_CONFIG_GLOBAL=empty file)", "V8", "pipe"]];
for (const [label, key, stdio] of runs) {
  const v = variants[key];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "diag-git-"));
  const target = path.join(root, "alpha");
  fs.mkdirSync(target, { mode: 0o700 });
  console.log(`--- ${label}  target=${target}`);
  try {
    execFileSync(v.bin, v.args(target), { stdio, timeout: 10_000, env: v.envFn ? v.envFn(root) : (v.env ?? env), ...(v.shell === false ? { shell: false } : {}) });
    console.log("result: no error");
  } catch (e) {
    console.log(`result: threw  code=${e?.code} status=${e?.status} signal=${e?.signal}`);
    console.log(`message: ${e?.message}`);
    console.log(`stderr: ${e?.stderr ? JSON.stringify(String(e.stderr)) : String(e?.stderr)}`);
  }
  const g = path.join(target, ".git");
  console.log(`.git exists: ${fs.existsSync(g)}`);
  const h = path.join(g, "hooks");
  console.log(`.git/hooks: ${fs.existsSync(h) ? JSON.stringify(fs.readdirSync(h)) : "(absent)"}`);
  if (fs.existsSync(g)) console.log(`.git entries: ${JSON.stringify(fs.readdirSync(g))}`);
  fs.rmSync(root, { recursive: true, force: true });
}
