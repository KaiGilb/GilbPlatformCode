// The suite must not start a codex or claude found on the person's PATH, in the person's home,
// or in the fixed system folders the Codex lookup searches.
// Traps sit first on PATH. A made-up home keeps the lookup out of the real one.
// The fixed folders are pointed at trap folders in a copy of the built bridge, then the lookup file runs against that copy.
// The assertion of today's list reads that same built constant, so it runs on the real bridge, where the list is unpatched.
// Windows is skipped: these traps are POSIX shell scripts, and this job cannot prove Windows.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UNIT = path.join(HERE, "..");
const VITEST = path.join(UNIT, "node_modules", "vitest", "vitest.mjs");
const FORBIDDEN = new Set(["codex", "claude", "codex.exe", "claude.exe", "codex.cmd", "claude.cmd", "codex.bat", "claude.bat"]);
const FIXED_MARK = 'export const CODEX_FIXED_LOOKUP_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];';
// The files this guard runs. The third is the lookup file: its default fixed folders are trap folders in the copy.
const NAMED_FILES = ["src/accessSwitch.test.mjs", "src/windowsService.test.mjs", "src/codexEngine.test.mjs"];

function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/** A directory of symlinks with no codex or claude file, so the rest of PATH still has node and the other tools. */
function shadowDir(dir, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    if (FORBIDDEN.has(name.toLowerCase())) continue;
    const to = path.join(dest, name);
    if (fs.existsSync(to)) continue;
    try { fs.symlinkSync(path.join(dir, name), to); } catch { /* a name that will not link is left out */ }
  }
  return dest;
}

function pathWithoutRealBinaries(root) {
  const out = [];
  let n = 0;
  for (const dir of String(process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    let names;
    try { names = fs.readdirSync(dir); } catch { continue; }
    if (names.some((name) => FORBIDDEN.has(name.toLowerCase()))) out.push(shadowDir(dir, path.join(root, "shadow", String(n++))));
    else out.push(dir);
  }
  return out.join(":");
}

function writeTrap(dir, name, log) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/sh\nprintf '%s %s\\n' "$(basename "$0")" "$*" >> ${shQuote(log)}\nexit 1\n`, { mode: 0o755 });
  fs.chmodSync(file, 0o755);
  return file;
}

function logText(file) {
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8");
}

function linesOf(text) {
  return text.split("\n").filter((line) => line.length > 0);
}

/** One vitest run of a named file. `passed` and `skipped` are the summary counts the guard requires. */
function runNamed(file, env, opts) {
  if (!NAMED_FILES.includes(file)) throw new Error(`${file} is outside the guard's named files`);
  // One worker: other jobs share this computer, and this guard is already a second vitest.
  const run = spawnSync(process.execPath, [VITEST, "run", "--maxWorkers=1", "--minWorkers=1", file, ...opts.args], {
    cwd: opts.cwd,
    env,
    encoding: "utf8",
    timeout: opts.timeout,
  });
  const text = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  const counts = text.match(/Tests\s+(\d+) passed(?:\s+\|\s+(\d+) skipped)?/);
  return {
    file: opts.args.length > 0 ? `${file} ${opts.args.join(" ")}` : file,
    status: run.status,
    signal: run.signal,
    tail: text.slice(-4000),
    passed: opts.passed,
    skipped: opts.skipped,
    gotPassed: counts ? Number(counts[1]) : undefined,
    gotSkipped: counts ? Number(counts[2] ?? 0) : undefined,
  };
}

/** A copy of the unit whose default Codex fixed folders are `dirs`. node_modules stays a link. */
function copyUnitWithFixedDirs(dest, dirs) {
  fs.cpSync(UNIT, dest, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(UNIT, src);
      return rel !== "node_modules" && !rel.startsWith(`node_modules${path.sep}`);
    },
  });
  fs.symlinkSync(path.join(UNIT, "node_modules"), path.join(dest, "node_modules"));
  const bridgeFile = path.join(dest, "bridge", "bridge.mjs");
  const text = fs.readFileSync(bridgeFile, "utf8");
  const count = text.split(FIXED_MARK).length - 1;
  if (count !== 1) throw new Error(`CODEX_FIXED_LOOKUP_DIRS marker count ${count} in the built bridge`);
  const next = `export const CODEX_FIXED_LOOKUP_DIRS = ${JSON.stringify(dirs)};`;
  fs.writeFileSync(bridgeFile, text.replace(FIXED_MARK, next));
  return dest;
}

describe("the suite does not start codex or claude from PATH or home", () => {
  it("accessSwitch, windowsService and the Codex lookup leave the trap logs empty", (ctx) => {
    // Spec: Chat.CodexConnect.ChatPart — the unit's suite never starts a codex or claude from the person's PATH, home, or fixed lookup folders (meter: trap logs empty after the named test files run)
    if (process.platform === "win32") {
      ctx.skip("skipped on Windows: the traps are POSIX shell scripts, and this job cannot prove Windows");
    }
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "suite-hermetic-"));
    const trapDir = path.join(root, "traps");
    const fixedOpt = path.join(root, "fixed-opt");
    const fixedUsr = path.join(root, "fixed-usr");
    const home = path.join(root, "home");
    const emptyHome = path.join(root, "empty-home");
    const nodeDir = path.join(root, "node-dir");
    fs.mkdirSync(trapDir);
    fs.mkdirSync(fixedOpt);
    fs.mkdirSync(fixedUsr);
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(emptyHome, { recursive: true });
    fs.mkdirSync(nodeDir);
    const codexLog = path.join(root, "codex-trap.log");
    const claudeLog = path.join(root, "claude-trap.log");
    try {
      const codexTrap = writeTrap(trapDir, "codex", codexLog);
      writeTrap(trapDir, "claude", claudeLog);
      writeTrap(fixedOpt, "codex", codexLog);
      writeTrap(fixedUsr, "codex", codexLog);
      // A direct start must leave a line, so an empty log after the suite is a real result.
      const known = spawnSync(codexTrap, ["known-answer"], { encoding: "utf8" });
      expect(known.status).toBe(1);
      expect(logText(codexLog)).toContain("codex known-answer");
      fs.writeFileSync(codexLog, "");
      const env = {
        ...process.env,
        PATH: `${trapDir}:${pathWithoutRealBinaries(root)}`,
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: path.join(home, ".config"),
        XDG_DATA_HOME: path.join(home, ".local", "share"),
        XDG_CACHE_HOME: path.join(home, ".cache"),
        XDG_RUNTIME_DIR: path.join(home, "runtime"),
        NO_COLOR: "1",
      };
      const copy = copyUnitWithFixedDirs(path.join(root, "unit"), [fixedOpt, fixedUsr]);
      const probe = path.join(root, "probe-default-lookup.mjs");
      fs.writeFileSync(probe, [
        'import { resolveCodexBin } from "./unit/bridge/bridge.mjs";',
        'import { spawnSync } from "node:child_process";',
        "const found = resolveCodexBin(\"codex\", { PATH: \"\" }, process.argv[2], \"darwin\", process.argv[3]);",
        "if (!found) { console.error(\"default lookup found nothing\"); process.exit(2); }",
        "const run = spawnSync(found, [\"known-fixed\"], { encoding: \"utf8\" });",
        "if (run.status !== 1) { console.error(\"trap status\", run.status); process.exit(3); }",
        "",
      ].join("\n"));
      const probed = spawnSync(process.execPath, [probe, emptyHome, path.join(nodeDir, "node")], { cwd: root, encoding: "utf8", timeout: 30000 });
      if (probed.status !== 0) throw new Error(`fixed-folder known answer exited ${probed.status}\n${probed.stdout ?? ""}\n${probed.stderr ?? ""}`);
      expect(logText(codexLog)).toContain("codex known-fixed");
      fs.writeFileSync(codexLog, "");
      // Today's list is the unpatched constant. The copy's constant is the trap folders, so that one assertion stays on the real bridge.
      const runs = [
        runNamed("src/codexEngine.test.mjs", env, {
          cwd: UNIT,
          timeout: 120000,
          args: ["-t", "the default fixed folders are today's list"],
          passed: 1,
          skipped: 42,
        }),
        runNamed("src/codexEngine.test.mjs", env, {
          cwd: copy,
          timeout: 360000,
          args: ["-t", "^(?!.*the default fixed folders)"],
          passed: 42,
          skipped: 1,
        }),
        runNamed("src/accessSwitch.test.mjs", env, { cwd: UNIT, timeout: 180000, args: [] }),
        runNamed("src/windowsService.test.mjs", env, { cwd: UNIT, timeout: 180000, args: [] }),
      ];
      for (const run of runs) {
        if (run.status !== 0) throw new Error(`${run.file} exited ${run.status} signal ${run.signal}\n${run.tail}`);
        if (run.passed !== undefined && (run.gotPassed !== run.passed || run.gotSkipped !== run.skipped)) {
          throw new Error(`${run.file} passed ${run.gotPassed} skipped ${run.gotSkipped}, wanted ${run.passed} passed and ${run.skipped} skipped\n${run.tail}`);
        }
      }
      const codexText = logText(codexLog);
      const claudeText = logText(claudeLog);
      if (linesOf(codexText).length !== 0 || linesOf(claudeText).length !== 0) {
        throw new Error(`codex trap lines ${linesOf(codexText).length}:\n${codexText}claude trap lines ${linesOf(claudeText).length}:\n${claudeText}`);
      }
      expect(codexText).toBe("");
      expect(claudeText).toBe("");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 720000);
});
