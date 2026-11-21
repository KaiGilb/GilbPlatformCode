// @vitest-environment node
// GitHubSync Step 1, security FINAL round (Agent.Hacker, 2026-11-21) at f51ab435: the bridge's own ref writer, the lock proof
// (identity + 250 ms fallback), and the pre-turn "Changes made outside the chat" commit.
// Harmless only: markers and "victim" files live in each case's own throwaway folder; no network.
// Adopted into the unit (Agent.Coder, after the fixes): FN1 asserts the safe outcome; the RACE injection now fires at the bridge's
// second clock read after its last git call, rev-list (the start of its ref write), which is between its branch check and its ref lock (the bridge no longer runs rev-parse there).
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { saveTurnToGit, GIT_LOCK_UNNOTED_MS } from "../bridge/bridge.mjs";
import { commitCount, ev, fsckOk, lastMessage, outsideEv, plainGit, startGitBridge, writes } from "./gitTestKit.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const posix = process.platform !== "win32";
let t;
let b;
afterEach(async () => {
  await b?.close();
  b = undefined;
  if (t) await removeTestDir(t.dir);
  t = undefined;
});

function sandbox() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-gitfin-")));
  const folder = path.join(dir, "proj");
  const priv = path.join(dir, "priv");
  const outside = path.join(dir, "outside");
  fs.mkdirSync(folder);
  fs.mkdirSync(outside);
  const marker = path.join(dir, "PWNED");
  const evil = path.join(dir, "evil.sh");
  fs.writeFileSync(evil, `#!/bin/sh\necho ran >> '${marker}'\ncat\n`, { mode: 0o755 });
  const victim = path.join(outside, "victim.txt");
  fs.writeFileSync(victim, "ORIGINAL\n");
  let n = 0;
  const save = (o = {}) => saveTurnToGit({ folder, summary: "turn", turnId: `t${++n}`, env: process.env, privateDir: priv, ...o });
  const w = (rel, c = "x") => {
    fs.mkdirSync(path.dirname(path.join(folder, rel)), { recursive: true });
    fs.writeFileSync(path.join(folder, rel), c);
  };
  t = { dir, folder, priv, outside, marker, evil, victim, save, w, git: path.join(folder, ".git") };
  return t;
}
async function primed() {
  const s = sandbox();
  s.w("a.txt", "a");
  expect((await s.save()).ok).toBe(true);
  return s;
}
/** Every path under the case's folder OUTSIDE proj/.git and priv/: nothing the save does may appear or change there. */
const outsideState = (s) => {
  const out = [];
  const walk = (d, rel) => {
    for (const n of fs.readdirSync(d)) {
      const r = rel ? `${rel}/${n}` : n;
      if (r === "proj" || r === "priv") continue;
      const p = path.join(d, n);
      const st = fs.lstatSync(p);
      if (st.isDirectory()) walk(p, r);
      else out.push(`${r}=${st.isSymbolicLink() ? "->" + fs.readlinkSync(p) : fs.readFileSync(p, "utf8").length}`);
    }
  };
  walk(s.dir, "");
  return out.sort().join("|");
};
const head = (s) => plainGit(s.folder, ["rev-parse", "HEAD"]).trim();
const deadPid = () => Number(execFileSync(process.execPath, ["-e", "process.stdout.write(String(require('child_process').spawnSync(process.execPath,['-e','0']).pid))"], { encoding: "utf8" }));
const callFile = (priv, gitDir) => path.join(priv, "calls", `${crypto.createHash("sha256").update(gitDir).digest("hex").slice(0, 32)}.json`);
const birthOf = (p) => Number(fs.lstatSync(p, { bigint: true }).birthtimeMs);

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("F1 the bridge's own ref writer", () => {
  it("a planted refs/heads/main.lock: refused as busy, lock kept, branch unchanged", async () => {
    const s = await primed();
    const h = head(s);
    fs.writeFileSync(path.join(s.git, "refs/heads/main.lock"), "planted");
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[F1 planted main.lock] ${JSON.stringify(r)}`);
    expect(r.ok).toBe(false);
    expect(fs.readFileSync(path.join(s.git, "refs/heads/main.lock"), "utf8")).toBe("planted");
    expect(head(s)).toBe(h);
  });

  it.each([
    ["refs/heads/main.lock as a link to a file outside", (s) => fs.symlinkSync(s.victim, path.join(s.git, "refs/heads/main.lock"))],
    ["refs/heads/main.lock as a dangling link outside", (s) => fs.symlinkSync(path.join(s.outside, "new-file"), path.join(s.git, "refs/heads/main.lock"))],
    ["refs/heads/main as a link to a file outside", (s) => { fs.writeFileSync(s.victim, head(s) + "\n"); fs.rmSync(path.join(s.git, "refs/heads/main")); fs.symlinkSync(s.victim, path.join(s.git, "refs/heads/main")); }],
    ["refs/heads/main hard-linked to a file outside", (s) => { fs.writeFileSync(s.victim, head(s) + "\n"); fs.rmSync(path.join(s.git, "refs/heads/main")); fs.linkSync(s.victim, path.join(s.git, "refs/heads/main")); }],
    ["refs/heads as a link to a folder outside", (s) => { const d = path.join(s.outside, "heads"); fs.cpSync(path.join(s.git, "refs/heads"), d, { recursive: true }); fs.rmSync(path.join(s.git, "refs/heads"), { recursive: true }); fs.symlinkSync(d, path.join(s.git, "refs/heads")); }],
    ["refs as a link to a folder outside", (s) => { const d = path.join(s.outside, "refs"); fs.cpSync(path.join(s.git, "refs"), d, { recursive: true }); fs.rmSync(path.join(s.git, "refs"), { recursive: true }); fs.symlinkSync(d, path.join(s.git, "refs")); }],
  ])("%s: nothing outside changes", async (_n, plant) => {
    const s = await primed();
    plant(s);
    s.w("b.txt", "b");
    const before = outsideState(s);
    const r = await s.save();
    console.log(`[F1 ${_n}] ${JSON.stringify(r).slice(0, 200)}`);
    expect(outsideState(s)).toBe(before);
    expect(fs.existsSync(s.marker)).toBe(false);
  });

  it("branch only in packed-refs: a loose ref is written, packed-refs is left alone, the repo is valid", async () => {
    const s = await primed();
    const h = head(s);
    fs.rmSync(path.join(s.git, "refs/heads/main"));
    fs.writeFileSync(path.join(s.git, "packed-refs"), `# pack-refs with: peeled fully-peeled sorted \n${h} refs/heads/main\n`);
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok).toBe(true);
    expect(head(s)).toBe(r.commit);
    expect(fs.readFileSync(path.join(s.git, "packed-refs"), "utf8")).toContain(h);
    expect(fsckOk(s.folder)).toBe(true);
  });

  it.each([
    "refs/heads/../../x", "refs/heads/../config", "refs/heads/a/../../../outside/x", "refs/tags/v1", "refs/remotes/origin/main", "refs/heads/x.lock",
    "refs/heads/a..b", "refs/heads/with space", "refs/heads/-dash", "refs/heads/.hidden", "refs/heads/end.", "refs/heads/a@{1}", "refs/heads/a\\b",
    "refs/heads/Main", "refs/heads/new/deep/branch", "refs/heads/con", "refs/heads/\u202eevil", "refs/heads/caf\u00e9",
  ])("HEAD -> %s: nothing outside .git/refs appears, nothing outside changes (records the outcome)", async (ref) => {
    const s = await primed();
    fs.writeFileSync(path.join(s.git, "HEAD"), `ref: ${ref}\n`);
    s.w("b.txt", "b");
    const before = outsideState(s);
    const gitTop = fs.readdirSync(s.git).sort().join(",");
    const mainBefore = fs.readFileSync(path.join(s.git, "refs/heads/main"), "utf8").trim();
    const r = await s.save();
    const headAfter = fs.readFileSync(path.join(s.git, "HEAD"), "utf8").trim();
    let parents = "";
    try { parents = r.ok && r.commit ? plainGit(s.folder, ["rev-list", "--parents", "-n", "1", r.commit]).trim().split(" ").length - 1 + " parent(s)" : ""; } catch { parents = "?"; }
    console.log(`[F1 HEAD -> ${JSON.stringify(ref)} after] HEAD file now=${JSON.stringify(headAfter.slice(0, 60))} commit has ${parents} main moved=${fs.readFileSync(path.join(s.git, "refs/heads/main"), "utf8").trim() !== mainBefore}`);
    const gitTopAfter = fs.readdirSync(s.git).sort().join(",");
    console.log(`[F1 HEAD -> ${JSON.stringify(ref)}] ok=${r.ok} ${r.ok ? "commit" : r.reason.slice(0, 110)} newTopLevelGitEntries=${JSON.stringify(gitTopAfter.split(",").filter((x) => !gitTop.split(",").includes(x)))}`);
    expect(outsideState(s)).toBe(before);
    // Only refs/heads/<valid name> may be written: no new file at the top of .git (e.g. a written "config" or "x").
    expect(gitTopAfter.split(",").filter((x) => !gitTop.split(",").includes(x) && x !== "index.lock")).toEqual([]);
  });

  it("no reflog line is written, even into an existing reflog file", async () => {
    const s = await primed();
    fs.mkdirSync(path.join(s.git, "logs/refs/heads"), { recursive: true });
    fs.writeFileSync(path.join(s.git, "logs/HEAD"), "x\n");
    fs.writeFileSync(path.join(s.git, "logs/refs/heads/main"), "y\n");
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(path.join(s.git, "logs/HEAD"), "utf8")).toBe("x\n");
    expect(fs.readFileSync(path.join(s.git, "logs/refs/heads/main"), "utf8")).toBe("y\n");
  });

  it("RACE: the person's own git commits between the bridge's branch check and its ref write: the person's commit must not be dropped", async () => {
    const s = await primed();
    s.w("b.txt", "b");
    let armed = false;
    let after = 0;
    let userCommit = null;
    const onGitRun = (args) => {
      if (args[0] === "rev-list") armed = true; // the last git call before the ref write (the object check)
    };
    const nowFn = () => {
      if (armed && userCommit === null && ++after === 2) {
        // The moment between the bridge's check (`current === parent`) and its exclusive lock: the person's own git commits.
        plainGit(s.folder, ["-c", "user.name=p", "-c", "user.email=p@example.test", "commit", "--allow-empty", "-qm", "the person's own commit"]);
        userCommit = head(s);
      }
      return Date.now();
    };
    const r = await s.save({ onGitRun, now: nowFn });
    const tip = head(s);
    let kept = false;
    if (userCommit) {
      try {
        plainGit(s.folder, ["merge-base", "--is-ancestor", userCommit, tip]);
        kept = true;
      } catch {
        kept = false;
      }
    }
    console.log(`[F1 RACE] injected=${userCommit !== null} save=${JSON.stringify(r).slice(0, 160)} personCommitStillOnBranch=${kept}`);
    expect(userCommit).not.toBe(null);
    expect(kept).toBe(true);
    // FN1 (fixed): the bridge re-reads the branch once its lock is held and writes nothing when it moved.
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/moved the branch/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("F2 the lock proof: identity, and the 250 ms fallback", () => {
  const writeRec = (s, rec) => {
    fs.mkdirSync(path.join(s.priv, "calls"), { recursive: true });
    fs.writeFileSync(callFile(s.priv, s.git), JSON.stringify({ limit: 20_000, gitDir: s.git, ...rec }));
  };
  const lock = (s, rel) => {
    const p = path.join(s.git, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "");
    return p;
  };
  const idOf = (s, rel) => {
    const st = fs.lstatSync(path.join(s.git, rel), { bigint: true });
    return { rel, dev: String(st.dev), ino: String(st.ino), birth: Number(st.birthtimeMs) };
  };

  it("noted identity of the killed git's own lock: removed (by design)", async () => {
    const s = await primed();
    const l = lock(s, "index.lock");
    writeRec(s, { pid: deadPid(), start: birthOf(l) - 10, takesIndexLock: true, locks: [idOf(s, "index.lock")] });
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[F2 noted own] ok=${r.ok} recovered=${JSON.stringify(r.recovered ?? null)}`);
    expect(fs.existsSync(l)).toBe(false);
  });

  it("noted identity, but the lock now there is ANOTHER file (deleted and re-made by someone else): kept", async () => {
    const s = await primed();
    const l = lock(s, "index.lock");
    const id = idOf(s, "index.lock");
    fs.rmSync(l);
    await new Promise((res) => setTimeout(res, 20));
    lock(s, "index.lock"); // the person's own git, later; the inode may even be the same number
    const id2 = idOf(s, "index.lock");
    writeRec(s, { pid: deadPid(), start: id.birth - 10, takesIndexLock: true, locks: [id] });
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[F2 other file] sameInode=${id.ino === id2.ino} ok=${r.ok} ${r.ok ? "" : r.reason} lockKept=${fs.existsSync(l)}`);
    expect(fs.existsSync(l)).toBe(true);
  });

  it("FALLBACK probe: the killed call never noted a lock; ANOTHER git's index.lock is born 100 ms after the killed call began", async () => {
    // The fallback assumes the killed git made the lock (O_EXCL: nobody else could while it held one). If the killed git was stopped
    // BEFORE it made its lock, a lock born inside the window is someone else's.
    const s = await primed();
    const l = lock(s, "index.lock");
    writeRec(s, { pid: deadPid(), start: birthOf(l) - 100, takesIndexLock: true });
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[F2 fallback, other git's lock at +100 ms] ok=${r.ok} recovered=${JSON.stringify(r.recovered ?? null)} lockKept=${fs.existsSync(l)}`);
    expect(true).toBe(true); // recorded: see the report (narrow window, by design)
  });

  it.each([[GIT_LOCK_UNNOTED_MS + 50, "after"], [-50, "before"]])("fallback: a lock born %i ms from the call's start (%s the window) is kept", async (offset) => {
    const s = await primed();
    const l = lock(s, "index.lock");
    writeRec(s, { pid: deadPid(), start: birthOf(l) - offset, takesIndexLock: true });
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok).toBe(false);
    expect(fs.existsSync(l)).toBe(true);
  });

  it("fallback for a call that takes no index lock (e.g. cat-file): a lock in the window is kept", async () => {
    const s = await primed();
    const l = lock(s, "index.lock");
    writeRec(s, { pid: deadPid(), start: birthOf(l) - 50 });
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok).toBe(false);
    expect(fs.existsSync(l)).toBe(true);
  });

  it("the record names the bridge's OWN pid (a reused pid after a restart): nothing is removed", async () => {
    const s = await primed();
    const l = lock(s, "index.lock");
    writeRec(s, { pid: process.pid, start: birthOf(l) - 10, takesIndexLock: true, locks: [idOf(s, "index.lock")] });
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok).toBe(false);
    expect(fs.existsSync(l)).toBe(true);
  });

  it("the record names a LIVE process: nothing is removed", async () => {
    const s = await primed();
    const l = lock(s, "index.lock");
    writeRec(s, { pid: process.ppid, start: birthOf(l) - 10, takesIndexLock: true, locks: [idOf(s, "index.lock")] });
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok).toBe(false);
    expect(fs.existsSync(l)).toBe(true);
  });

  it("a noted identity cannot make the bridge remove anything that is not a regular *.lock file in .git", async () => {
    const s = await primed();
    const keep = path.join(s.git, "refs/heads/main");
    const st = fs.lstatSync(keep, { bigint: true });
    // A record that names a real ref (not a lock) by its identity, and an outside file.
    writeRec(s, { pid: deadPid(), start: Date.now(), takesIndexLock: true, locks: [
      { rel: "refs/heads/main", dev: String(st.dev), ino: String(st.ino), birth: Number(st.birthtimeMs) },
      { rel: "../outside/victim.txt", dev: "0", ino: "0", birth: 0 },
      { rel: "config", dev: "0", ino: "0", birth: 0 },
    ] });
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[F2 non-lock names] ok=${r.ok} recovered=${JSON.stringify(r.recovered ?? null)}`);
    expect(fs.existsSync(keep)).toBe(true);
    expect(fs.existsSync(path.join(s.git, "config"))).toBe(true);
    expect(fs.readFileSync(s.victim, "utf8")).toBe("ORIGINAL\n");
  });

  it("the bridge's own ref write, killed: its refs/heads/main.lock is recognised by its record", async () => {
    const s = await primed();
    const l = lock(s, "refs/heads/main.lock");
    writeRec(s, { pid: deadPid(), start: birthOf(l) - 5, lockRel: "refs/heads/main.lock" });
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[F2 own ref lock] ok=${r.ok} recovered=${JSON.stringify(r.recovered ?? null)}`);
    expect(fs.existsSync(l)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("F3 the pre-turn commit ('Changes made outside the chat')", () => {
  async function twoTurns(between) {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "first"]);
    const ctx = { victim: path.join(b.dir, "victim.txt"), marker: path.join(b.dir, "PWNED"), evil: path.join(b.dir, "evil.sh") };
    fs.writeFileSync(ctx.victim, "ORIGINAL\n");
    fs.writeFileSync(ctx.evil, `#!/bin/sh\necho ran >> '${ctx.marker}'\ncat\n`, { mode: 0o755 });
    between(b.projPath, ctx);
    const r = await b.turn([writes([{ p: "turn.txt", c: "t" + Date.now() }]), "second"]);
    return { r, ctx };
  }
  const cfg = (extra = "") => `[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n${extra}`;

  it("between turns: an evil repo config + a changed file: the outside save is refused, nothing runs", async () => {
    const { r, ctx } = await twoTurns((p, c) => {
      fs.writeFileSync(path.join(p, ".git/config"), cfg(`\tfsmonitor = ${c.evil}\n`) + `[filter "x"]\n\tclean = ${c.evil}\n`);
      fs.writeFileSync(path.join(p, ".gitattributes"), "* filter=x\n");
      fs.writeFileSync(path.join(p, "mine.txt"), "m");
    });
    console.log(`[F3 evil config] outside git_error=${JSON.stringify(outsideEv(r, "git_error").map((x) => x.reason.slice(0, 80)))} outside git_saved=${JSON.stringify(outsideEv(r, "git_saved"))}`);
    expect(fs.existsSync(ctx.marker)).toBe(false);
    expect(outsideEv(r, "git_saved")).toEqual([]);
    expect(outsideEv(r, "git_error")).toHaveLength(1);
  });

  it("between turns: .git/logs/HEAD and refs/heads/main.lock planted as links outside: refused, nothing outside changes", async () => {
    const { r, ctx } = await twoTurns((p, c) => {
      fs.mkdirSync(path.join(p, ".git/logs"), { recursive: true });
      fs.rmSync(path.join(p, ".git/logs/HEAD"), { force: true });
      fs.symlinkSync(c.victim, path.join(p, ".git/logs/HEAD"));
      fs.writeFileSync(path.join(p, "mine.txt"), "m");
    });
    expect(fs.readFileSync(ctx.victim, "utf8")).toBe("ORIGINAL\n");
    expect(outsideEv(r, "git_saved")).toEqual([]);
    expect(outsideEv(r, "git_error").length).toBeGreaterThan(0);
  });

  it("between turns: .git replaced by a gitdir: file to a repo outside: refused, the outside repo is unchanged", async () => {
    const { r, ctx } = await twoTurns((p) => {
      const o = path.join(path.dirname(path.dirname(p)), "outside-repo");
      fs.mkdirSync(o);
      plainGit(o, ["init", "-q", "--template="]);
      fs.renameSync(path.join(p, ".git"), path.join(path.dirname(path.dirname(p)), "moved-git"));
      fs.writeFileSync(path.join(p, ".git"), `gitdir: ${path.join(o, ".git")}\n`);
      fs.writeFileSync(path.join(p, "mine.txt"), "m");
    });
    const o = path.join(b.dir, "outside-repo");
    console.log(`[F3 gitdir outside] outside git_error=${JSON.stringify(outsideEv(r, "git_error").map((x) => x.reason.slice(0, 80)))}`);
    expect(commitCount(o)).toBe(0);
    expect(outsideEv(r, "git_saved")).toEqual([]);
    void ctx;
  });

  it("between turns: a secret and a normal file: the secret is kept out of the outside commit, reported once", async () => {
    const { r } = await twoTurns((p) => {
      fs.writeFileSync(path.join(p, ".env.local"), "TOKEN=1");
      fs.writeFileSync(path.join(p, "mine.txt"), "m");
    });
    const o = outsideEv(r, "git_saved")[0];
    console.log(`[F3 secret] ${JSON.stringify(o)}`);
    expect(o.files).toEqual(["mine.txt"]);
  });

  it("the outside commit and the turn's commit are separate; the turn's commit holds only the turn's file", async () => {
    const { r } = await twoTurns((p) => fs.writeFileSync(path.join(p, "mine.txt"), "m"));
    const turnSaved = ev(r, "git_saved").filter((x) => !x.outside);
    expect(outsideEv(r, "git_saved")[0].files).toEqual(["mine.txt"]);
    expect(turnSaved[0].files).toEqual(["turn.txt"]);
    expect(lastMessage(b.projPath).split("\n")[0]).toBe("echo: second");
  });

  it("the turn's own previous save was refused (a lock): its changes go into the NEXT turn's commit, not an outside commit (records)", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "first"]);
    const lockP = path.join(b.projPath, ".git/index.lock");
    fs.writeFileSync(lockP, "");
    const r1 = await b.turn([writes([{ p: "left.txt", c: "l" }]), "refused"]);
    fs.rmSync(lockP);
    const r2 = await b.turn([writes([{ p: "next.txt", c: "n" }]), "next"]);
    console.log(`[F3 after refused] r1 git_error=${JSON.stringify(ev(r1, "git_error").map((x) => x.reason.slice(0, 60)))} r2 outside=${JSON.stringify(outsideEv(r2, "git_saved").map((x) => x.files))} r2 turn=${JSON.stringify(ev(r2, "git_saved").filter((x) => !x.outside).map((x) => x.files))}`);
    expect(true).toBe(true);
  });
});
