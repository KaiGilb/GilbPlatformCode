// @vitest-environment node
// GitHubSync Step 1, reliability and time:
//  - P.Commit.Coverage: 100 scripted code turns (stand-in claude) that each change a file leave 100 commits.
//  - P.Rel.NoCorruption: 1000 saves, with the saving process SIGKILLed again and again mid-save; the repo stays valid
//    (`git fsck --strict`), no lock is left behind, and every file written before the last save is committed.
//  - P.Turn.NoDelay: the save after a one-file turn in a 5 000-file project takes <= 2 s at p95.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { saveTurnToGit, scanGitDir } from "../bridge/bridge.mjs";
import { commitCount, committedFiles, ev, fsckOk, plainGit, startGitBridge, writes } from "./gitTestKit.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let b;
const temps = [];
afterEach(async () => {
  await b?.close();
  b = undefined;
  for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});
const tmp = (p) => {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), p)));
  temps.push(d);
  return d;
};
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];

describe("P.Commit.Coverage", () => {
  it("100 scripted code turns that change files leave 100 commits", async () => {
    b = await startGitBridge();
    let saved = 0;
    for (let i = 0; i < 100; i++) {
      const r = await b.turn([writes([{ p: `f${i}.txt`, c: String(i) }]), `turn ${i}`]);
      if (ev(r, "git_saved")[0]?.commit) saved++;
    }
    console.log(`[coverage] ${saved}/100 changed turns left a commit`);
    expect(saved).toBe(100);
    expect(commitCount(b.projPath)).toBe(100);
    expect(fsckOk(b.projPath)).toBe(true);
  }, 300_000); // Windows runners start each git far slower
});

// POSIX only: on Windows each process start costs ~10x more, so 1000 saves with restarts would take many minutes of CI.
describe.skipIf(process.platform === "win32")("P.Rel.NoCorruption", () => {
  it("1000 saves with the saver SIGKILLed mid-save: repo valid, no lock left, nothing lost", async () => {
    const repo = tmp("bridge-git-rel-");
    const priv = tmp("bridge-git-priv-");
    const runner = path.join(HERE, "gitSaveRunner.mjs");
    let attempts = 0;
    let kills = 0;
    let next = 0;
    while (attempts < 1000) {
      // One run of the saver: it writes a file and saves, again and again, printing each attempt; it is killed at a random time.
      const child = spawn(process.execPath, [runner, repo, priv, String(next)], { stdio: ["ignore", "pipe", "inherit"] });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      const killAfter = 250 + Math.floor(Math.random() * 1200);
      await new Promise((r) => setTimeout(r, killAfter));
      child.kill("SIGKILL");
      kills++;
      await new Promise((r) => child.once("exit", r));
      const done = out.split("\n").filter((l) => l.startsWith("attempt ")).length;
      attempts += done;
      next += done + 1; // a file may have been written by an attempt that was cut before it printed
      // Wait for a git the killed saver left running to finish (the bridge's git children are not killed with it).
      for (let i = 0; i < 100 && fs.existsSync(path.join(repo, ".git", "index.lock")); i++) await new Promise((r) => setTimeout(r, 50));
    }
    // A last, clean save picks up anything an interrupted save did not commit.
    const last = await saveTurnToGit({ folder: repo, summary: "final", turnId: "final", env: process.env, privateDir: priv });
    expect(last.ok).toBe(true);
    const written = fs.readdirSync(repo).filter((f) => f.startsWith("f"));
    console.log(`[reliability] ${attempts} save attempts, ${kills} SIGKILLs, ${commitCount(repo)} commits, ${written.length} files written`);
    expect(fsckOk(repo)).toBe(true);
    expect(fs.existsSync(path.join(repo, ".git", "index.lock"))).toBe(false);
    const inGit = new Set(committedFiles(repo));
    expect(written.filter((f) => !inGit.has(f))).toEqual([]);
  }, 600_000);
});

// Agent.Tester's D2 (kill-group.mjs): the saver AND its git child killed together (a crash, a power cut, a service stop) can leave a
// lock. The next save must still commit: the bridge removes a lock only when its own call record proves its own git left it.
describe.skipIf(process.platform === "win32")("P.Rel.NoCorruption, whole group killed (D2)", () => {
  it("100 kills of the saver and its git together: 0 repos broken, 0 left stuck (the next save always commits)", async () => {
    const W = tmp("bridge-git-killgroup-");
    const runner = path.join(HERE, "gitSaveRunner.mjs");
    let lockedAfterKill = 0;
    let broken = 0;
    let stuck = 0;
    let recoveredLocks = 0;
    const reasons = new Map();
    for (let i = 0; i < 100; i++) {
      const repo = path.join(W, `r${i}`);
      const priv = path.join(W, `p${i}`);
      fs.mkdirSync(repo, { recursive: true });
      for (let k = 0; k < 300; k++) fs.writeFileSync(path.join(repo, `s${k}.js`), `export const v = ${k};\n`.repeat(30));
      await saveTurnToGit({ folder: repo, summary: "base", turnId: "b", env: process.env, privateDir: priv });
      const child = spawn(process.execPath, [runner, repo, priv, "0"], { stdio: "ignore", detached: true });
      await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 600)));
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
      await new Promise((r) => (child.exitCode !== null || child.signalCode !== null ? r() : child.once("exit", r)));
      const gd = path.join(repo, ".git");
      const anyLock = fs.existsSync(path.join(gd, "index.lock")) || fs.existsSync(path.join(gd, "HEAD.lock")) || fs.readdirSync(path.join(gd, "refs", "heads")).some((f) => f.endsWith(".lock"));
      if (anyLock) lockedAfterKill++;
      fs.writeFileSync(path.join(repo, "after.txt"), "x");
      const next = await saveTurnToGit({ folder: repo, summary: "after", turnId: "a", env: process.env, privateDir: priv });
      if (next.ok && next.commit) recoveredLocks += next.recovered?.length ?? 0;
      else {
        stuck++;
        const k = next.ok ? "no commit" : next.reason.slice(0, 90);
        reasons.set(k, (reasons.get(k) ?? 0) + 1);
      }
      // Broken = the repo after the next save (a lock left by the kill is a lock, counted above, until that save removes it).
      if (!fsckOk(repo)) {
        broken++;
        let why = "";
        try {
          plainGit(repo, ["fsck", "--strict", "--no-progress"]);
        } catch (e) {
          why = String(e.stderr ?? e.stdout ?? e.message).slice(0, 600);
        }
        console.log(`[kill-group] fsck broken after the next save, round ${i}: ${why}`);
      }
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(priv, { recursive: true, force: true });
    }
    console.log(`[kill-group] 100 kills: ${lockedAfterKill} left a lock, ${recoveredLocks} lock(s) removed by proof, ${broken} fsck-broken after the next save, ${stuck} stuck ${JSON.stringify(Object.fromEntries(reasons))}`);
    expect(broken).toBe(0);
    expect(stuck).toBe(0);
  }, 600_000);
});

describe("P.Turn.NoDelay", () => {
  it("a one-file save in a 5 000-file project is <= 2 s at p95 (and the first, full save is measured)", async () => {
    const repo = tmp("bridge-git-time-");
    const priv = tmp("bridge-git-priv-");
    for (let d = 0; d < 50; d++) {
      fs.mkdirSync(path.join(repo, `d${d}`));
      for (let f = 0; f < 100; f++) fs.writeFileSync(path.join(repo, `d${d}`, `f${f}.js`), `export const v = ${d * 100 + f};\n`.repeat(20));
    }
    let t = performance.now();
    // The first, full save of an existing big project runs with the bridge's own first-save limit (GIT_FIRST_SAVE_TIMEOUT_MS).
    const first = await saveTurnToGit({ folder: repo, summary: "all", turnId: "t0", env: process.env, privateDir: priv });
    const firstMs = performance.now() - t;
    console.log(`[timing] ${process.platform}: first full save of 5000 files ${Math.round(firstMs)} ms: ${first.ok ? "ok" : first.reason}`);
    expect(first.ok && first.commit).toBeTruthy();
    const times = [];
    const starts = [];
    for (let i = 0; i < 20; i++) {
      fs.writeFileSync(path.join(repo, "d7", "f7.js"), `export const v = ${i};\n`);
      t = performance.now();
      let n = 0;
      const r = await saveTurnToGit({ folder: repo, summary: `edit ${i}`, turnId: `t${i + 1}`, env: process.env, privateDir: priv, onGitRun: () => n++ });
      starts.push(n);
      times.push(performance.now() - t);
      if (!(r.ok && r.commit)) console.log(`[timing] one-file save ${i}: ${r.ok ? "no commit" : r.reason}`);
      expect(r.ok && r.commit).toBeTruthy();
    }
    // Where the time goes: how many git processes a one-file save starts, and what one look over .git costs (it runs twice per save).
    t = performance.now();
    scanGitDir(path.join(repo, ".git"));
    const walkMs = performance.now() - t;
    console.log(`[timing-profile] ${process.platform}: git starts per one-file save ${Math.min(...starts)}-${Math.max(...starts)}; one .git walk ${walkMs.toFixed(1)} ms`);
    console.log(`[timing] 5000 files: first full save ${Math.round(firstMs)} ms; one-file save p50 ${Math.round(pct(times, 50))} ms, p95 ${Math.round(pct(times, 95))} ms, max ${Math.round(Math.max(...times))} ms`);
    expect(pct(times, 95)).toBeLessThanOrEqual(2000);
  }, 300_000);
});
