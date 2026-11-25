// The suite must not start a codex or claude found on the person's PATH or in the person's home.
// Traps sit first on PATH. A made-up home keeps the lookup out of the real one.
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

describe("the suite does not start codex or claude from PATH or home", () => {
  it("accessSwitch and windowsService leave the trap logs empty", (ctx) => {
    // Spec: Chat.CodexConnect.ChatPart — the unit's suite never starts a codex or claude from the person's PATH or home (meter: trap logs empty after the two test files run)
    if (process.platform === "win32") {
      ctx.skip("skipped on Windows: the traps are POSIX shell scripts, and this job cannot prove Windows");
    }
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "suite-hermetic-"));
    const trapDir = path.join(root, "traps");
    const home = path.join(root, "home");
    fs.mkdirSync(trapDir);
    fs.mkdirSync(home, { recursive: true });
    const codexLog = path.join(root, "codex-trap.log");
    const claudeLog = path.join(root, "claude-trap.log");
    try {
      const codexTrap = writeTrap(trapDir, "codex", codexLog);
      writeTrap(trapDir, "claude", claudeLog);
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
      };
      const runs = ["src/accessSwitch.test.mjs", "src/windowsService.test.mjs"].map((file) => {
        const run = spawnSync(process.execPath, [VITEST, "run", file], { cwd: UNIT, env, encoding: "utf8", timeout: 180000 });
        return { file, status: run.status, signal: run.signal, tail: `${run.stdout ?? ""}\n${run.stderr ?? ""}`.slice(-2000) };
      });
      for (const run of runs) {
        if (run.status !== 0) throw new Error(`${run.file} exited ${run.status} signal ${run.signal}\n${run.tail}`);
      }
      const codexText = logText(codexLog);
      const claudeText = logText(claudeLog);
      const lines = (text) => text.split("\n").filter((line) => line.length > 0);
      if (lines(codexText).length !== 0 || lines(claudeText).length !== 0) {
        throw new Error(`codex trap lines ${lines(codexText).length}:\n${codexText}claude trap lines ${lines(claudeText).length}:\n${claudeText}`);
      }
      expect(codexText).toBe("");
      expect(claudeText).toBe("");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 180000);
});
