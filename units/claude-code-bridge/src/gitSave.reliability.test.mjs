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
import { saveTurnToGit } from "../bridge/bridge.mjs";
import { commitCount, committedFiles, ev, fsckOk, startGitBridge, writes } from "./gitTestKit.mjs";

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
  }, 120_000);
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
    for (let i = 0; i < 20; i++) {
      fs.writeFileSync(path.join(repo, "d7", "f7.js"), `export const v = ${i};\n`);
      t = performance.now();
      const r = await saveTurnToGit({ folder: repo, summary: `edit ${i}`, turnId: `t${i + 1}`, env: process.env, privateDir: priv });
      times.push(performance.now() - t);
      if (!(r.ok && r.commit)) console.log(`[timing] one-file save ${i}: ${r.ok ? "no commit" : r.reason}`);
      expect(r.ok && r.commit).toBeTruthy();
    }
    console.log(`[timing] 5000 files: first full save ${Math.round(firstMs)} ms; one-file save p50 ${Math.round(pct(times, 50))} ms, p95 ${Math.round(pct(times, 95))} ms, max ${Math.round(Math.max(...times))} ms`);
    expect(pct(times, 95)).toBeLessThanOrEqual(2000);
  }, 300_000);
});
