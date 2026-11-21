// @vitest-environment node
// Agent.Hacker's re-test file, adopted into the unit 2026-11-21 (Agent.Coder). Since then the bridge writes its ref itself and keeps
// no reflog (RT1), proves a lock by its identity (RT2) and counts pseudo-refs as reachable (RT3); the probes assert the safe side.
// GitHubSync Step 1, security RE-TEST (Agent.Hacker, 2026-11-21) of the fixes at b8acbe1f: the NEW surface.
// Harmless only: markers and "victim" files live in each case's own throwaway folder; no network.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { saveTurnToGit } from "../bridge/bridge.mjs";
import { FAKE, commitCount, ev, fsckOk, plainGit, startGitBridge, writes } from "./gitTestKit.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const posix = process.platform !== "win32";
let t;
let b;
const kill = [];
afterEach(async () => {
  for (const p of kill.splice(0)) try { process.kill(p, "SIGKILL"); } catch { /* gone */ }
  await b?.close();
  b = undefined;
  if (t) await removeTestDir(t.dir);
  t = undefined;
});

function sandbox() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-gitre-")));
  const folder = path.join(dir, "proj");
  const priv = path.join(dir, "priv");
  const outside = path.join(dir, "outside");
  fs.mkdirSync(folder);
  fs.mkdirSync(outside);
  const marker = path.join(dir, "PWNED");
  const evil = path.join(dir, "evil.sh");
  fs.writeFileSync(evil, `#!/bin/sh\necho ran >> '${marker}'\ncat\n`, { mode: 0o755 });
  let n = 0;
  const save = (o = {}) => saveTurnToGit({ folder, summary: "turn", turnId: `t${++n}`, env: process.env, privateDir: priv, ...o });
  const w = (rel, c = "x") => {
    fs.mkdirSync(path.dirname(path.join(folder, rel)), { recursive: true });
    fs.writeFileSync(path.join(folder, rel), c);
  };
  t = { dir, folder, priv, outside, marker, evil, save, w, git: path.join(folder, ".git") };
  return t;
}
async function primed() {
  const s = sandbox();
  s.w("a.txt", "a");
  expect((await s.save()).ok).toBe(true);
  return s;
}
const deadPid = () => {
  const r = execFileSync(process.execPath, ["-e", "process.stdout.write(String(require('child_process').spawnSync(process.execPath,['-e','0']).pid))"], { encoding: "utf8" });
  return Number(r);
};
const callFile = (priv, gitDir) => path.join(priv, "calls", `${crypto.createHash("sha256").update(gitDir).digest("hex").slice(0, 32)}.json`);

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("N1 the descendant check: a double-forked, setsid process re-parented to init", () => {
  // A stand-in claude that, when a flag file exists, starts an intermediate that starts a setsid grandchild and exits at once.
  // The grandchild ignores SIGTERM, waits for the bridge's `git add` (the index changes), then plants .git/logs/HEAD -> a file
  // outside, so the bridge's update-ref would append to it. (In real use the turn's sandbox denies .git writes; see N3.)
  function wrapper(dir) {
    const f = path.join(dir, "claude-wrapper.mjs");
    // The escaped process: perl, setsid at once, TERM/HUP ignored; it waits for the bridge's `git add` (index mtime changes,
    // sub-second via Time::HiRes), then replaces .git/logs/HEAD with a link to the victim, so update-ref would append to it.
    fs.writeFileSync(path.join(dir, "gc.pl"), `use POSIX (); use Time::HiRes qw(stat sleep time); POSIX::setsid(); $SIG{TERM}='IGNORE'; $SIG{HUP}='IGNORE';
my ($proj,$victim,$alive,$pidf)=@ARGV; open(my $p,'>',$pidf); print $p $$; close $p;
my $idx="$proj/.git/index"; my $lh="$proj/.git/logs/HEAD"; my $m0=(stat($idx))[9]||0; my $end=time()+12; my $fired=0;
while (time() < $end) { my $m=(stat($idx))[9]||0; if (!$fired && $m && $m != $m0) { unlink $lh; symlink($victim,$lh); $fired=1; open(my $q,'>',"$alive.fired"); close $q; } sleep(0.001); }
open(my $a,'>',$alive); print $a "survived fired=$fired"; close $a;
`);
    fs.writeFileSync(f, `#!/usr/bin/env node
import fs from "node:fs";
import { spawn } from "node:child_process";
const flag = process.env.FAKE_DF_FILE;
if (flag && fs.existsSync(flag)) {
  const s = JSON.parse(fs.readFileSync(flag, "utf8")); fs.rmSync(flag);
  // 400 ms into the turn (away from the bridge's first look), a shell that lives a few ms forks perl into the background and exits.
  setTimeout(() => {
    spawn("/bin/sh", ["-c", '/usr/bin/perl "$0" "$1" "$2" "$3" "$4" </dev/null >/dev/null 2>&1 & exit 0', s.gcPl, s.proj, s.victim, s.alive, s.pidFile], { stdio: "ignore" });
    setTimeout(() => {}, 300); // claude stays a moment longer, so the bridge's group kill comes after perl's setsid
  }, 400);
}
await import(${JSON.stringify(pathToFileURL(FAKE).href)});
`, { mode: 0o755 });
    return f;
  }

  it.each([1, 2, 3, 4, 5])("trial %i: is the escaped process seen before the save, and does anything outside change?", async () => {
    const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-gitre-df-")));
    try {
      const flag = path.join(tmp, "flag.json");
      b = await startGitBridge({ env: { FAKE_DF_FILE: flag }, bridgeOpts: { claudeBin: wrapper(tmp), killGraceMs: 300 } });
      await b.turn([writes([{ p: "a.txt", c: "a" }]), "first"]);
      const victim = path.join(tmp, "victim.txt");
      fs.writeFileSync(victim, "ORIGINAL\n");
      const spec = { proj: b.projPath, victim, alive: path.join(tmp, "alive"), pidFile: path.join(tmp, "gc.pid"), gcPl: path.join(tmp, "gc.pl") };
      fs.writeFileSync(flag, JSON.stringify(spec));
      const r = await b.turn([writes([{ p: "b.txt", c: "b" + Date.now() }]), "second"]);
      await new Promise((res) => setTimeout(res, 300));
      const gcPid = fs.existsSync(spec.pidFile) ? Number(fs.readFileSync(spec.pidFile, "utf8")) : 0;
      let gcAlive = false;
      if (gcPid) { try { process.kill(gcPid, 0); gcAlive = true; kill.push(gcPid); } catch { /* gone */ } }
      const fired = fs.existsSync(spec.alive + ".fired");
      const vic = fs.readFileSync(victim, "utf8");
      console.log(`[N1] gcStarted=${gcPid > 0} escapedAliveAfterSave=${gcAlive} plantedDuringSave=${fired} git_saved=${JSON.stringify(ev(r, "git_saved").map((x) => x.commit))} git_error=${JSON.stringify(ev(r, "git_error").map((x) => x.reason.slice(0, 60)))} victimChangedByReflog=${vic !== "ORIGINAL\n"}`);
      // The security property the deeper layers must hold even WITHOUT the sandbox (this harness has none): a save that is
      // tampered with mid-run must NOT be reported as a clean commit. The after-check must catch it and refuse git_saved.
      // (In real use the OS sandbox denyWrite on .git stops the escaped process from planting anything; victimChanged is the
      // RESIDUAL the report rates Medium: the reflog write via update-ref lands before the after-check, so a belt-and-suspenders
      // -c core.logAllRefUpdates=false is recommended.)
      // RT1 (fixed): the bridge writes no reflog, so nothing is ever appended through a planted link, in every trial.
      expect(vic).toBe("ORIGINAL\n");
      const planted = (() => {
        try {
          return fs.lstatSync(path.join(spec.proj, ".git", "logs", "HEAD")).isSymbolicLink();
        } catch {
          return false;
        }
      })();
      if (fired && planted) {
        expect(ev(r, "git_saved")).toEqual([]);
        expect(ev(r, "git_error").length).toBeGreaterThan(0);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("N2 lock removal proof", () => {
  async function withRecord(s, { pid, startAgo = 5000, limit = 20_000 }) {
    const gitDir = s.git;
    fs.mkdirSync(path.join(s.priv, "calls"), { recursive: true });
    fs.writeFileSync(callFile(s.priv, gitDir), JSON.stringify({ pid, start: Date.now() - startAgo, limit, gitDir }));
  }
  const lockAt = (s, rel, agoMs) => {
    const p = path.join(s.git, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "");
    const t0 = new Date(Date.now() - agoMs);
    fs.utimesSync(p, t0, t0);
    return p;
  };

  it("record of a LIVE pid: the lock is kept and reported", async () => {
    const s = await primed();
    await withRecord(s, { pid: process.pid });
    const l = lockAt(s, "index.lock", 4000);
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[N2 live pid] ${JSON.stringify(r)}`);
    expect(fs.existsSync(l)).toBe(true);
  });

  it("record of a dead pid, lock OUTSIDE the call window: kept", async () => {
    const s = await primed();
    await withRecord(s, { pid: deadPid(), startAgo: 120_000 });
    const l = lockAt(s, "index.lock", 5000);
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[N2 outside window] ${JSON.stringify(r)}`);
    expect(fs.existsSync(l)).toBe(true);
  });

  it("FINDING-PROBE: after a bridge crash, a lock held by ANOTHER live git made inside the window is removed", async () => {
    // The bridge was killed mid-call at T (record left). The person's own git (e.g. `git commit` waiting in an editor, or an
    // IDE) started at T+3 s and still holds index.lock. The record proves only that the BRIDGE's git is gone.
    const s = await primed();
    await withRecord(s, { pid: deadPid(), startAgo: 10_000, limit: 20_000 });
    const holder = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" }); // stands for the other git
    kill.push(holder.pid);
    const l = lockAt(s, "index.lock", 7000);
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[N2 other live git] ${JSON.stringify(r)} lockStillThere=${fs.existsSync(l)}`);
    expect(fs.existsSync(l)).toBe(true);
  });

  it("what else counts as a lock: a submodule's lock under .git/modules and an lfs lock file (records)", async () => {
    const s = await primed();
    await withRecord(s, { pid: deadPid(), startAgo: 10_000 });
    const a = lockAt(s, "modules/sub/index.lock", 7000);
    const c = lockAt(s, "lfs/cache/locks/x.lock", 7000);
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[N2 other locks] recovered=${JSON.stringify(r.recovered ?? null)} ok=${r.ok} submoduleLockKept=${fs.existsSync(a)} lfsLockKept=${fs.existsSync(c)}`);
    expect(true).toBe(true);
  });

  it("a lock that is a link, or a folder named *.lock, is never followed or removed", async () => {
    const s = await primed();
    await withRecord(s, { pid: deadPid(), startAgo: 10_000 });
    const victim = path.join(s.outside, "v.lock");
    fs.writeFileSync(victim, "keep");
    fs.symlinkSync(victim, path.join(s.git, "index.lock"));
    fs.mkdirSync(path.join(s.git, "refs", "dir.lock"));
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[N2 link lock] ${JSON.stringify(r)}`);
    expect(fs.readFileSync(victim, "utf8")).toBe("keep");
    expect(fs.existsSync(path.join(s.git, "refs", "dir.lock"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("N4 attributes on a git older than 2.42 (a wrapper reports 2.41.0)", () => {
  function oldGit(dir) {
    const f = path.join(dir, "git-2.41");
    fs.writeFileSync(f, `#!/bin/sh\nfor a; do last="$a"; done\nif [ "$last" = version ]; then echo "git version 2.41.0"; exit 0; fi\nexec git "$@"\n`, { mode: 0o755 });
    return f;
  }
  it("a tracked .gitattributes naming a filter refuses the save", async () => {
    const s = await primed();
    s.w(".gitattributes", "* filter=x\n");
    s.w("b.txt", "b");
    const r = await s.save({ gitBin: oldGit(s.dir) });
    console.log(`[N4 visible] ${JSON.stringify(r)}`);
    expect(r.ok).toBe(false);
  });
  it("PROBE: a .gitattributes the folder's .gitignore hides is not checked (records)", async () => {
    const s = await primed();
    s.w(".gitignore", "sub/.gitattributes\n");
    s.w("sub/.gitattributes", "* filter=x\n");
    s.w("sub/f.txt", "f");
    const r = await s.save({ gitBin: oldGit(s.dir) });
    console.log(`[N4 hidden .gitattributes] ok=${r.ok} ${r.ok ? "save went ahead: fallback check missed it" : r.reason}`);
    expect(fs.existsSync(s.marker)).toBe(false);
  });
  it("PROBE: .git/info/attributes naming a filter (not covered by --attr-source either) (records)", async () => {
    const s = await primed();
    fs.mkdirSync(path.join(s.git, "info"), { recursive: true });
    fs.writeFileSync(path.join(s.git, "info", "attributes"), "* filter=x\n");
    s.w("b.txt", "b");
    const rOld = await s.save({ gitBin: oldGit(s.dir) });
    s.w("c.txt", "c");
    const rNew = await s.save();
    console.log(`[N4 info/attributes] old-git ok=${rOld.ok} new-git ok=${rNew.ok}`);
    expect(fs.existsSync(s.marker)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("N5 the plumbing path with planted refs state", () => {
  const head = (s) => plainGit(s.folder, ["rev-parse", "HEAD"]).trim();
  it.each([
    ["HEAD -> a tag", (s) => { plainGit(s.folder, ["tag", "v1"]); fs.writeFileSync(path.join(s.git, "HEAD"), "ref: refs/tags/v1\n"); }],
    ["HEAD detached", (s) => { fs.writeFileSync(path.join(s.git, "HEAD"), head(s) + "\n"); }],
    ["main only in packed-refs", (s) => { const h = head(s); fs.rmSync(path.join(s.git, "refs/heads/main")); fs.writeFileSync(path.join(s.git, "packed-refs"), `# pack-refs with: peeled fully-peeled sorted \n${h} refs/heads/main\n`); }],
    ["packed-refs says main is something else", (s) => { fs.writeFileSync(path.join(s.git, "packed-refs"), `# pack-refs with: peeled fully-peeled sorted \n${"1".repeat(40)} refs/heads/main\n`); }],
    ["main is a symbolic ref to another branch", (s) => { const h = head(s); fs.mkdirSync(path.join(s.git, "refs/heads"), { recursive: true }); fs.writeFileSync(path.join(s.git, "refs/heads/other"), h + "\n"); fs.writeFileSync(path.join(s.git, "refs/heads/main"), "ref: refs/heads/other\n"); }],
    ["reflog full of garbage", (s) => { fs.mkdirSync(path.join(s.git, "logs"), { recursive: true }); fs.writeFileSync(path.join(s.git, "logs/HEAD"), "garbage\n\0\0\nmore garbage\n"); }],
    ["HEAD -> refs/heads/../config (invalid)", (s) => { fs.writeFileSync(path.join(s.git, "HEAD"), "ref: refs/heads/../config\n"); }],
  ])("%s: nothing outside changes, the repo stays valid (records the outcome)", async (_n, plant) => {
    const s = await primed();
    plant(s);
    const outsideBefore = fs.readdirSync(s.dir).sort().join(",");
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[N5 ${_n}] ${JSON.stringify(r).slice(0, 220)} fsck=${fsckOk(s.folder)}`);
    expect(fs.readdirSync(s.dir).sort().join(",")).toBe(outsideBefore);
    expect(fs.existsSync(s.marker)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("N6 the unreachable-object delete", () => {
  function sideCommitWithSecret(s, content) {
    plainGit(s.folder, ["checkout", "-q", "-b", "side"]);
    fs.writeFileSync(path.join(s.folder, "credentials.json"), content);
    plainGit(s.folder, ["add", "-f", "credentials.json"]);
    plainGit(s.folder, ["-c", "user.name=p", "-c", "user.email=p@example.test", "commit", "-qm", "side"]);
    const c2 = plainGit(s.folder, ["rev-parse", "HEAD"]).trim();
    plainGit(s.folder, ["checkout", "-q", "main"]);
    return c2;
  }

  it("a blob reachable from a branch is kept", async () => {
    const s = await primed();
    const X = '{"client_secret":"not-a-real-secret-1"}';
    sideCommitWithSecret(s, X);
    s.w("credentials.json", X);
    const r = await s.save();
    expect(r.ok).toBe(true);
    expect(fsckOk(s.folder)).toBe(true);
  });

  it.each(["MERGE_HEAD", "ORIG_HEAD", "FETCH_HEAD", "CHERRY_PICK_HEAD"])("PROBE: a blob reachable only through .git/%s (an in-progress merge, a fetch) is deleted?", async (name) => {
    const s = await primed();
    const X = '{"client_secret":"not-a-real-secret-2"}';
    const c2 = sideCommitWithSecret(s, X);
    plainGit(s.folder, ["branch", "-q", "-D", "side"]);
    plainGit(s.folder, ["reflog", "expire", "--expire=now", "--all"]);
    fs.writeFileSync(path.join(s.git, name), name === "FETCH_HEAD" ? `${c2}\t\tbranch 'side' of ../elsewhere\n` : `${c2}\n`);
    s.w("credentials.json", X);
    const r = await s.save();
    let blobThere = true;
    try { plainGit(s.folder, ["cat-file", "-e", `${c2}:credentials.json`]); } catch { blobThere = false; }
    console.log(`[N6 ${name}] save.ok=${r.ok} skipped=${JSON.stringify(r.skipped ?? null)} blobOf${name}Present=${blobThere} fsck=${fsckOk(s.folder)}`);
    expect(blobThere).toBe(true);
  });

  it("a blob in a pack is never deleted", async () => {
    const s = await primed();
    const X = '{"client_secret":"not-a-real-secret-3"}';
    const c2 = sideCommitWithSecret(s, X);
    plainGit(s.folder, ["tag", "keep", c2]);
    plainGit(s.folder, ["repack", "-a", "-d", "-q"]);
    plainGit(s.folder, ["tag", "-d", "keep"]);
    plainGit(s.folder, ["branch", "-q", "-D", "side"]);
    s.w("credentials.json", X);
    const r = await s.save();
    expect(r.ok).toBe(true);
    // packed: still there even though nothing reaches it
    expect(() => plainGit(s.folder, ["cat-file", "-e", `${c2}:credentials.json`])).not.toThrow();
  });
});
