// @vitest-environment node
// Agent.Tester final round, adopted into the unit: guards that no other test holds.
// P1/P2 a lock whose recorded process is STILL ALIVE is never removed (identity proof and the 250 ms fallback).
// W1 the bridge's ref lock is exclusive: a ref lock that appears during the save is never overwritten.
// W3 a branch moved by another git during the save is never overwritten.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { saveTurnToGit } from "../bridge/bridge.mjs";
const posix = process.platform !== "win32";
const temps = []; const kids = [];
afterEach(() => { for (const k of kids.splice(0)) try { k.kill("SIGKILL"); } catch {} for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true }); });
const tmp = () => { const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "qa-r3-"))); temps.push(d); return d; };
const git = (cwd, args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd, env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "o", GIT_AUTHOR_EMAIL: "o@x.test", GIT_COMMITTER_NAME: "o", GIT_COMMITTER_EMAIL: "o@x.test" } }).toString().trim();
const record = (priv, gitDir) => path.join(priv, "calls", `${crypto.createHash("sha256").update(gitDir).digest("hex").slice(0, 32)}.json`);
async function primed() {
  const d = tmp(); const f = path.join(d, "p"); fs.mkdirSync(f); const priv = path.join(d, "priv");
  fs.writeFileSync(path.join(f, "a.txt"), "a");
  const r = await saveTurnToGit({ folder: f, summary: "first", turnId: "t0", env: process.env, privateDir: priv });
  expect(r.ok && r.commit).toBeTruthy();
  return { d, f, priv, gitDir: path.join(f, ".git") };
}
const livePid = () => { const k = spawn("sleep", ["60"], { stdio: "ignore" }); kids.push(k); return k.pid; };

describe.skipIf(!posix)("P: a lock held by a LIVE recorded process is kept", () => {
  it("P1 identity proof: the record names this very lock, but its process is alive -> kept, nothing saved", async () => {
    const { f, priv, gitDir } = await primed();
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    const lock = path.join(gitDir, "index.lock"); fs.writeFileSync(lock, "");
    const st = fs.lstatSync(lock, { bigint: true });
    fs.mkdirSync(path.join(priv, "calls"), { recursive: true });
    fs.writeFileSync(record(priv, gitDir), JSON.stringify({ pid: livePid(), start: Date.now() - 100, limit: 20000, gitDir, takesIndexLock: true, locks: [{ rel: "index.lock", dev: String(st.dev), ino: String(st.ino), birth: st.birthtimeMs > 0n ? Number(st.birthtimeMs) : 0 }] }));
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(lock)).toBe(true);
  });
  it("P2 250 ms fallback: lock born right at the recorded call's start, but its process is alive -> kept", async () => {
    const { f, priv, gitDir } = await primed();
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    const lock = path.join(gitDir, "index.lock"); fs.writeFileSync(lock, "");
    const birth = Number(fs.lstatSync(lock, { bigint: true }).birthtimeMs);
    if (!(birth > 0)) return;
    fs.mkdirSync(path.join(priv, "calls"), { recursive: true });
    fs.writeFileSync(record(priv, gitDir), JSON.stringify({ pid: livePid(), start: Math.round(birth) - 5, limit: 20000, gitDir, takesIndexLock: true }));
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(lock)).toBe(true);
  });
});

/** A git wrapper that, right after a chosen subcommand, runs a shell snippet (simulating another git acting during the save). */
function hookedGit(d, sub, snippet) {
  const realGit = (process.env.PATH || "").split(path.delimiter).map((p) => path.join(p, "git")).find((p) => fs.existsSync(p));
  const bin = path.join(d, `git-${sub}.sh`);
  fs.writeFileSync(bin, `#!/bin/sh\n'${realGit}' "$@"; rc=$?\nfor a in "$@"; do if [ "$a" = ${sub} ]; then ${snippet}; fi; done\nexit $rc\n`, { mode: 0o755 });
  return bin;
}
describe.skipIf(!posix)("W: the bridge's own ref write", () => {
  it("W1 a ref lock that appears during the save (another git) is not overwritten; the branch is not moved", async () => {
    const { d, f, priv, gitDir } = await primed();
    const before = git(f, ["rev-parse", "refs/heads/main"]);
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    const lock = path.join(gitDir, "refs", "heads", "main.lock");
    const bin = hookedGit(d, "commit-tree", `printf 'OTHER\\n' > '${lock}'`);
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv, gitBin: bin });
    console.log(`[W1] ${JSON.stringify(r)}`);
    expect(r.ok).toBe(false);
    expect(fs.readFileSync(lock, "utf8")).toBe("OTHER\n");
    expect(git(f, ["rev-parse", "refs/heads/main"])).toBe(before);
  });
  it("W3 a branch moved by another git during the save is not overwritten (no lost commit)", async () => {
    const { d, f, priv, gitDir } = await primed();
    const base = git(f, ["rev-parse", "HEAD"]);
    const other = git(f, ["commit-tree", git(f, ["rev-parse", "HEAD^{tree}"]), "-p", base, "-m", "someone else's commit"]);
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    const bin = hookedGit(d, "commit-tree", `printf '${other}\\n' > '${path.join(gitDir, "refs", "heads", "main")}'`);
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv, gitBin: bin });
    console.log(`[W3] ${JSON.stringify(r)}`);
    expect(r.ok).toBe(false);
    expect(git(f, ["rev-parse", "refs/heads/main"])).toBe(other);
  });
});
