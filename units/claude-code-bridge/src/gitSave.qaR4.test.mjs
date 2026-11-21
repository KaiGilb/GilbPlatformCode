// @vitest-environment node
// Agent.Tester last check (L0-L3), adopted into the unit: the ref-lock content proof (L2: the recorded process must be gone).
// is not the bridge's: (L1) holds a different id, (L2) holds the expected id but the recorded process is alive, (L3) the lock was
// written by another git (real `git update-ref` holding its lock open), (L4) right content but empty record field.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { saveTurnToGit } from "../bridge/bridge.mjs";
const posix = process.platform !== "win32";
const temps = []; const kids = [];
afterEach(() => { for (const k of kids.splice(0)) try { k.kill("SIGKILL"); } catch {} for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true }); });
const tmp = () => { const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "qa-r4-"))); temps.push(d); return d; };
const record = (priv, gitDir) => path.join(priv, "calls", `${crypto.createHash("sha256").update(gitDir).digest("hex").slice(0, 32)}.json`);
const deadPid = () => { const k = spawn("true"); return k.pid; };
const livePid = () => { const k = spawn("sleep", ["60"], { stdio: "ignore" }); kids.push(k); return k.pid; };
async function primed() {
  const d = tmp(); const f = path.join(d, "p"); fs.mkdirSync(f); const priv = path.join(d, "priv");
  fs.writeFileSync(path.join(f, "a.txt"), "a");
  expect((await saveTurnToGit({ folder: f, summary: "first", turnId: "t0", env: process.env, privateDir: priv })).ok).toBe(true);
  fs.writeFileSync(path.join(f, "b.txt"), "b");
  return { d, f, priv, gitDir: path.join(f, ".git") };
}
const plant = (priv, gitDir, rec) => { fs.mkdirSync(path.join(priv, "calls"), { recursive: true }); fs.writeFileSync(record(priv, gitDir), JSON.stringify({ gitDir, lockRel: "refs/heads/main.lock", start: Date.now() - 1000, limit: 20000, ...rec })); };
const X = "1".repeat(40), Y = "2".repeat(40);
describe.skipIf(!posix)("ref-lock recovery by content", () => {
  it("L0 control: dead pid, the lock holds exactly the recorded id -> removed, save goes on", async () => {
    const { f, priv, gitDir } = await primed();
    fs.writeFileSync(path.join(gitDir, "refs/heads/main.lock"), `${X}\n`);
    plant(priv, gitDir, { pid: deadPid(), expect: X });
    await new Promise((r) => setTimeout(r, 200));
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
    console.log(`[L0] ${JSON.stringify(r)}`);
    expect(r.ok && r.commit).toBeTruthy();
  });
  it("L1 dead pid, the lock holds a DIFFERENT id -> kept, nothing saved", async () => {
    const { f, priv, gitDir } = await primed();
    fs.writeFileSync(path.join(gitDir, "refs/heads/main.lock"), `${Y}\n`);
    plant(priv, gitDir, { pid: deadPid(), expect: X });
    await new Promise((r) => setTimeout(r, 200));
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
    console.log(`[L1] ${JSON.stringify(r)}`);
    expect(r.ok).toBe(false);
    expect(fs.readFileSync(path.join(gitDir, "refs/heads/main.lock"), "utf8")).toBe(`${Y}\n`);
  });
  it("L2 the expected id, but the recorded process is ALIVE -> kept", async () => {
    const { f, priv, gitDir } = await primed();
    fs.writeFileSync(path.join(gitDir, "refs/heads/main.lock"), `${X}\n`);
    plant(priv, gitDir, { pid: livePid(), expect: X });
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
    console.log(`[L2] ${JSON.stringify(r)}`);
    expect(r.ok).toBe(false);
    expect(fs.existsSync(path.join(gitDir, "refs/heads/main.lock"))).toBe(true);
  });
  it("L3 a lock taken by ANOTHER git (git update-ref --stdin holding the transaction open), stale record of a dead bridge call -> kept", async () => {
    const { f, priv, gitDir } = await primed();
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: f, env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).toString().trim();
    const k = spawn("git", ["update-ref", "--stdin"], { cwd: f, env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }, stdio: ["pipe", "ignore", "ignore"] }); kids.push(k);
    k.stdin.write(`start\nupdate refs/heads/main ${head} ${head}\nprepare\n`);
    const locksNow = () => ["HEAD.lock", "refs/heads/main.lock", "index.lock"].filter((l) => fs.existsSync(path.join(gitDir, l)));
    for (let i = 0; i < 150 && locksNow().length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 300));
    const lockBefore = locksNow();
    const lockText = lockBefore.includes("refs/heads/main.lock") ? fs.readFileSync(path.join(gitDir, "refs/heads/main.lock"), "utf8") : "";
    plant(priv, gitDir, { pid: deadPid(), expect: X });   // a stale record of a dead bridge write with its own commit id
    await new Promise((r) => setTimeout(r, 200));
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
    const lockAfter = locksNow();
    console.log(`[L3] locks before ${JSON.stringify(lockBefore)} after ${JSON.stringify(lockAfter)}; other git's lock holds ${JSON.stringify(lockText.trim().slice(0, 12))}; save ${JSON.stringify(r)}; lock still there ${fs.existsSync(path.join(gitDir, "refs/heads/main.lock"))}`);
    expect(lockBefore.length).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
    expect(lockAfter).toEqual(lockBefore);
  });
});
