// @vitest-environment node
// GitHubSync Step 1: after a code turn that changed files, the BRIDGE (never the code turn) commits them locally.
// Over real HTTP with the stand-in claude (fake-claude.mjs, WRITEFILES). No network, no push.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  DEFAULT_GITIGNORE,
  GIT_FIRST_SAVE_TIMEOUT_MS,
  GIT_FIRST_SAVE_TOTAL_MS,
  GIT_LOCK_UNNOTED_MS,
  GIT_SAVE_TOTAL_MS,
  GIT_TIMEOUT_MS,
  gitCommitMessage,
  saveTurnToGit,
  scanForSecret,
} from "../bridge/bridge.mjs";
import { commitCount, committedFiles, ev, fsckOk, lastMessage, outsideEv, plainGit, startGitBridge, writes } from "./gitTestKit.mjs";

let b;
afterEach(async () => {
  await b?.close();
  b = undefined;
});

// Secret fixtures are built from parts at run time, so this file never holds a literal that looks like a real key.
const SECRETS = {
  pem: ["-----BEGIN ", "RSA PRIVATE", " KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----\n"].join(""),
  openssh: ["-----BEGIN ", "OPENSSH PRIVATE", " KEY-----\nb3Bl\n"].join(""),
  aws: `const k = "${"AK" + "IA" + "ABCDEFGHIJKLMNOP"}";\n`,
  ghp: `token=${"gh" + "p_" + "a".repeat(36)}\n`,
  gho: `token=${"gh" + "o_" + "b".repeat(36)}\n`,
  ghpat: `token=${"github" + "_pat_" + "c".repeat(40)}\n`,
  sk: `OPENAI=${"s" + "k-" + "d".repeat(32)}\n`,
  skant: `ANTHROPIC=${"s" + "k-" + "ant-api03-" + "e".repeat(40)}\n`,
  slack: `SLACK=${"xo" + "xb-" + "1234567890-abcdef"}\n`,
};

describe("a changed code turn leaves one commit (bridge-run)", () => {
  it("changed turn -> one commit; unchanged turn -> none", async () => {
    b = await startGitBridge();
    const r1 = await b.turn([writes([{ p: "index.html", c: "<h1>hi</h1>" }]), "Made the start page"]);
    expect(ev(r1, "files_changed")[0].addedCount).toBe(1);
    const saved = ev(r1, "git_saved");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ files: [".gitignore", "index.html"], skipped: [], pushed: "no-link" });
    expect(saved[0].commit).toMatch(/^[0-9a-f]{40}$/);
    expect(commitCount(b.projPath)).toBe(1);
    expect(plainGit(b.projPath, ["rev-parse", "HEAD"]).trim()).toBe(saved[0].commit);
    // The event comes after the answer, so the answer is never held up by the commit.
    const names = r1.events.map((e) => e[0]);
    expect(names.indexOf("git_saved")).toBeGreaterThan(names.indexOf("message"));

    const r2 = await b.turn(["Nothing to do"]);
    expect(ev(r2, "git_saved")).toEqual([]);
    expect(ev(r2, "git_error")).toEqual([]);
    expect(commitCount(b.projPath)).toBe(1);
    expect(fsckOk(b.projPath)).toBe(true);
  });

  it("a chat turn never commits", async () => {
    b = await startGitBridge();
    const r = await b.api("/v1/turn", { system: "s", prompt: "hello" });
    expect(ev(r, "git_saved")).toEqual([]);
    expect(fs.existsSync(path.join(b.projPath, ".git"))).toBe(false);
  });

  it("works in the code folder itself when no project is named", async () => {
    b = await startGitBridge({ project: null });
    const r = await b.turn([writes([{ p: "a.txt", c: "a" }]), "Wrote a"]);
    expect(ev(r, "git_saved")[0].files).toEqual([".gitignore", "a.txt"]);
    expect(commitCount(b.ws)).toBe(1);
  });

  it("no .git -> git init on main + the default .gitignore; node_modules and .env stay out", async () => {
    b = await startGitBridge();
    const r = await b.turn([writes([{ p: "src/app.js", c: "x" }, { p: "node_modules/x/index.js", c: "y" }, { p: "dist/out.js", c: "z" }]), "Built it"]);
    expect(ev(r, "git_saved")[0].files.sort()).toEqual([".gitignore", "src/app.js"]);
    expect(plainGit(b.projPath, ["symbolic-ref", "--short", "HEAD"]).trim()).toBe("main");
    const gi = fs.readFileSync(path.join(b.projPath, ".gitignore"), "utf8");
    for (const line of ["node_modules", ".npm-cache", "dist", "build", ".env", ".env.*", "*.pem", "*.key", "*.p12", ".DS_Store"]) expect(gi.split("\n")).toContain(line);
    expect(DEFAULT_GITIGNORE).toContain("node_modules");
    expect(committedFiles(b.projPath).sort()).toEqual([".gitignore", "src/app.js"]);
  });

  it("an existing .gitignore is kept as it is", async () => {
    b = await startGitBridge();
    fs.writeFileSync(path.join(b.projPath, ".gitignore"), "secret-notes.txt\n");
    await b.turn([writes([{ p: "a.txt", c: "a" }, { p: "secret-notes.txt", c: "n" }]), "Two files"]);
    expect(fs.readFileSync(path.join(b.projPath, ".gitignore"), "utf8")).toBe("secret-notes.txt\n");
    expect(committedFiles(b.projPath).sort()).toEqual([".gitignore", "a.txt"]);
  });

  it("an existing repo with no .gitignore still keeps node_modules out (the bridge's own excludes)", async () => {
    b = await startGitBridge();
    plainGit(b.projPath, ["init", "-q", "--template="]);
    plainGit(b.projPath, ["-c", "user.name=p", "-c", "user.email=p@example.test", "commit", "-q", "--allow-empty", "-m", "start"]);
    const r = await b.turn([writes([{ p: "a.txt", c: "a" }, { p: "node_modules/m/i.js", c: "m" }]), "x"]);
    expect(ev(r, "git_saved")[0].files).toEqual(["a.txt"]);
    expect(fs.existsSync(path.join(b.projPath, ".gitignore"))).toBe(false); // a repo with history: its files are the person's
  });

  it("an existing EMPTY repo (no history, as New project makes) gets the default .gitignore on its first save", async () => {
    b = await startGitBridge();
    plainGit(b.projPath, ["init", "-q", "--template="]);
    const r = await b.turn([writes([{ p: "a.txt", c: "a" }, { p: "node_modules/m/i.js", c: "m" }]), "x"]);
    // No object yet: nothing saved to differ from, so no "outside the chat" save; the turn's first commit holds .gitignore too.
    expect(outsideEv(r, "git_saved")).toEqual([]);
    expect(ev(r, "git_saved")[0].files).toEqual([".gitignore", "a.txt"]);
  });

  it("a removed file is committed as removed", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }, { p: "b.txt", c: "b" }]), "two"]);
    const r = await b.turn([writes([{ p: "b.txt", rm: true }]), "removed b"]);
    expect(ev(r, "git_saved")[0].files).toEqual(["b.txt"]);
    expect(committedFiles(b.projPath).sort()).toEqual([".gitignore", "a.txt"]);
  });
});

describe("the commit message and identity", () => {
  it("first line of the summary, blank line, changed files, Gilb-Turn trailer", async () => {
    b = await startGitBridge();
    const r = await b.turn([writes([{ p: "a.txt", c: "a" }, { p: "b/c.txt", c: "c" }]), "Added the two files"]);
    const turnId = ev(r, "turn_started")[0].turnId;
    // git log adds one newline after the stored message.
    expect(lastMessage(b.projPath)).toBe(`echo: Added the two files\n\nA\t.gitignore\nA\ta.txt\nA\tb/c.txt\n\nGilb-Turn: ${turnId}\n\n`);
  });

  it("gitCommitMessage cuts the first line to 72, lists at most 50 files and says how many more", () => {
    const m = gitCommitMessage("x".repeat(100) + "\nsecond line", Array.from({ length: 60 }, (_, i) => ({ status: "M", path: `f${i}` })), "abc");
    const lines = m.split("\n");
    expect(lines[0]).toHaveLength(72);
    expect(lines[1]).toBe("");
    expect(lines.filter((l) => l.startsWith("M\t"))).toHaveLength(50);
    expect(m).toContain("… and 10 more");
    expect(m.trimEnd().endsWith("Gilb-Turn: abc")).toBe(true);
  });

  it("an empty summary still gives a first line; control characters are dropped", () => {
    expect(gitCommitMessage("", [{ status: "A", path: "a" }], "t1").split("\n")[0]).toBe("Code turn t1");
    expect(gitCommitMessage("\u001b[31mred\u0007 text", [{ status: "A", path: "a" }], "t1").split("\n")[0]).toBe("[31mred text");
  });

  it("author and committer come from the page's gitIdentity; never from the person's git config", async () => {
    b = await startGitBridge();
    const ident = { authorName: "Ada Person", authorEmail: "noreply@example.test", committerName: "TheApp", committerEmail: "noreply@example.test" };
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "x"], { gitIdentity: ident });
    expect(plainGit(b.projPath, ["log", "-1", "--format=%an <%ae>|%cn <%ce>"]).trim()).toBe("Ada Person <noreply@example.test>|TheApp <noreply@example.test>");
  });

  it("without gitIdentity the bridge's neutral identity is used", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "x"]);
    expect(plainGit(b.projPath, ["log", "-1", "--format=%an <%ae>|%cn <%ce>"]).trim()).toBe("App user <noreply@bridge.invalid>|claude-code-bridge <noreply@bridge.invalid>");
  });

  it("a bad gitIdentity is refused before the turn starts", async () => {
    b = await startGitBridge();
    for (const bad of [{ authorName: "a\nb" }, { authorName: "x <y>" }, { authorEmail: "not an email" }, { authorName: "x".repeat(101) }, "str"]) {
      const r = await b.turn(["x"], { gitIdentity: bad });
      expect(r.status).toBe(400);
    }
  });
});

describe("the per-project switch (sync), default on", () => {
  it("reads on by default, turns off, off => zero commits, on again => commits", async () => {
    b = await startGitBridge();
    expect((await b.api("/v1/git/sync", { project: "app" })).json).toEqual({ project: "app", sync: true });
    expect((await b.api("/v1/git/sync", { project: "app", sync: false })).json).toEqual({ project: "app", sync: false });
    const r = await b.turn([writes([{ p: "a.txt", c: "a" }]), "x"]);
    expect(ev(r, "files_changed")).toHaveLength(1);
    expect(ev(r, "git_saved")).toEqual([]);
    expect(fs.existsSync(path.join(b.projPath, ".git"))).toBe(false);
    await b.api("/v1/git/sync", { project: "app", sync: true });
    const r2 = await b.turn([writes([{ p: "b.txt", c: "b" }]), "y"]);
    expect(ev(r2, "git_saved")).toHaveLength(1);
    expect(commitCount(b.projPath)).toBe(1);
  });

  it("is per project: off in one leaves another on", async () => {
    b = await startGitBridge();
    fs.mkdirSync(path.join(b.ws, "other"));
    await b.api("/v1/git/sync", { project: "app", sync: false });
    expect((await b.api("/v1/git/sync", { project: "other" })).json).toEqual({ project: "other", sync: true });
    const r = await b.turn([writes([{ p: "a.txt", c: "a" }]), "x"], { project: "other" });
    expect(ev(r, "git_saved")).toHaveLength(1);
  });

  it("the code folder itself has its own switch (no project)", async () => {
    b = await startGitBridge({ project: null });
    expect((await b.api("/v1/git/sync", {})).json).toEqual({ project: null, sync: true });
    expect((await b.api("/v1/git/sync", { sync: false })).json).toEqual({ project: null, sync: false });
  });

  it("is kept in the bridge's state folder across a restart (never in the project folder)", async () => {
    b = await startGitBridge();
    await b.api("/v1/git/sync", { project: "app", sync: false });
    const stateFile = path.join(b.dir, "state", "git-sync.json");
    expect(fs.existsSync(stateFile)).toBe(true);
    expect(fs.readdirSync(b.projPath)).toEqual([]);
    expect(JSON.parse(fs.readFileSync(stateFile, "utf8"))).toEqual({ off: [fs.realpathSync.native(b.projPath)] });
  });

  it("needs pairing, and refuses a bad body or an unknown project", async () => {
    b = await startGitBridge();
    const anon = await fetch(`${b.base}/v1/git/sync`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(anon.status).toBe(401);
    expect((await b.api("/v1/git/sync", { project: "nope" })).status).toBe(400);
    expect((await b.api("/v1/git/sync", { project: "app", sync: "off" })).status).toBe(400);
    expect((await b.api("/v1/git/sync", { project: "../x" })).status).toBe(400);
  });

  it("/v1/hello says the bridge saves to git and does not push", async () => {
    b = await startGitBridge();
    const h = await (await fetch(`${b.base}/v1/hello`)).json();
    expect(h.options.git).toEqual({ save: true, push: false });
  });
});

describe("secret scan before the commit", () => {
  it.each(Object.entries(SECRETS))("content %s is kept out and reported", async (name, text) => {
    b = await startGitBridge();
    const r = await b.turn([writes([{ p: "ok.txt", c: "fine" }, { p: `conf/${name}.txt`, c: text }]), "x"]);
    const s = ev(r, "git_saved")[0];
    expect(s.files).not.toContain(`conf/${name}.txt`);
    expect(s.skipped).toEqual([{ path: `conf/${name}.txt`, reason: expect.any(String) }]);
    expect(committedFiles(b.projPath)).not.toContain(`conf/${name}.txt`);
    expect(committedFiles(b.projPath)).toContain("ok.txt");
    // Left on disk, only not committed.
    expect(fs.readFileSync(path.join(b.projPath, "conf", `${name}.txt`), "utf8")).toBe(text);
  });

  it.each([".env", ".env.local", "config/.env.production", "id_rsa", "keys/id_rsa.pub", "server.pem", "tls/server.key"])("file name %s is kept out even past a .gitignore that allows it", async (p) => {
    b = await startGitBridge();
    fs.writeFileSync(path.join(b.projPath, ".gitignore"), "!*\n");
    plainGit(b.projPath, ["init", "-q", "--template="]);
    const r = await b.turn([writes([{ p, c: "harmless" }, { p: "ok.txt", c: "ok" }]), "x"]);
    const s = ev(r, "git_saved")[0];
    expect(s.skipped.map((x) => x.path)).toEqual([p]);
    expect(committedFiles(b.projPath)).not.toContain(p);
  });

  it("a turn whose only change is a secret makes no commit and still reports it", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "first"]);
    const r = await b.turn([writes([{ p: "k.txt", c: SECRETS.aws }]), "second"]);
    expect(ev(r, "git_saved")).toEqual([{ commit: null, files: [], skipped: [{ path: "k.txt", reason: expect.any(String) }], pushed: "no-link" }]);
    expect(commitCount(b.projPath)).toBe(1);
  });

  it("a committed file that later gains a secret keeps its last clean version in git", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "cfg.js", c: "export const a = 1;\n" }]), "first"]);
    await b.turn([writes([{ p: "cfg.js", c: SECRETS.ghp }, { p: "b.txt", c: "b" }]), "second"]);
    expect(plainGit(b.projPath, ["show", "HEAD:cfg.js"])).toBe("export const a = 1;\n");
    expect(committedFiles(b.projPath)).toContain("b.txt");
  });

  it("scanForSecret: names and contents; a file over 1 MB is not read; a clean file passes", () => {
    expect(scanForSecret("a.txt", Buffer.from("hello"))).toBeNull();
    expect(scanForSecret(".env.example", Buffer.from("A=1"))).toMatch(/env/i);
    expect(scanForSecret("x/y.p12", Buffer.from(""))).not.toBeNull(); // also by name since F7: a tree .gitignore can un-ignore it
    expect(scanForSecret("big.txt", null)).toBeNull();
    for (const t of Object.values(SECRETS)) expect(scanForSecret("f.txt", Buffer.from(t))).not.toBeNull();
    // Windows-style separators in a path are read as folders.
    expect(scanForSecret("keys\\id_rsa", Buffer.from(""))).not.toBeNull();
  });
});

describe("no network, and a commit failure never fails the turn", () => {
  it("a stale index.lock is reported, not deleted; the answer still arrives", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "first"]);
    const lock = path.join(b.projPath, ".git", "index.lock");
    fs.writeFileSync(lock, "");
    const old = new Date(Date.now() - 11 * 60_000);
    fs.utimesSync(lock, old, old);
    const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "second"]);
    expect(ev(r, "message")).toHaveLength(1);
    expect(ev(r, "error")).toEqual([]);
    expect(ev(r, "git_error")[0].reason).toMatch(/index\.lock/);
    expect(fs.existsSync(lock)).toBe(true);
    expect(commitCount(b.projPath)).toBe(1);
  });

  it("a fresh index.lock (someone else's git) is reported as busy, and left alone", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "first"]);
    const lock = path.join(b.projPath, ".git", "index.lock");
    fs.writeFileSync(lock, "");
    const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "second"]);
    expect(ev(r, "git_error")[0].reason).toMatch(/busy|another git/i);
    expect(fs.existsSync(lock)).toBe(true);
  });

  it("git missing on the computer -> git_error, the answer is unchanged", async () => {
    b = await startGitBridge({ bridgeOpts: { gitBin: path.join("no", "such", "git-binary") } });
    const r = await b.turn([writes([{ p: "a.txt", c: "a" }]), "x"]);
    expect(ev(r, "message")[0].content).toBe("echo: x");
    expect(ev(r, "git_error")[0].reason).toMatch(/git/i);
  });
});

describe("the git time limit: 120 s only for a folder's first save, 20 s once it has any commit", () => {
  const temps = [];
  afterEach(() => {
    for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-git-limit-")));
    temps.push(d);
    return d;
  };
  /** One save that records the limit of each git call, by subcommand. */
  async function limits(folder, priv) {
    const seen = [];
    const r = await saveTurnToGit({ folder, summary: "s", turnId: "t", env: process.env, privateDir: priv, onGitRun: (args, ms) => seen.push([args.find((a) => /^[a-z][a-z-]*$/.test(a) && !["-c"].includes(a)), ms]) });
    const of = (cmd) => seen.filter(([c]) => c === cmd).map(([, ms]) => ms);
    return { r, of, all: seen.map(([, ms]) => ms) };
  }

  it("pins the two limits", () => {
    expect(GIT_TIMEOUT_MS).toBe(20_000);
    expect(GIT_FIRST_SAVE_TIMEOUT_MS).toBe(120_000);
  });

  it("a folder with no repo: init and checks at 20 s, the first add and commit at 120 s; the next save is 20 s throughout", async () => {
    const f = tmp();
    const priv = tmp();
    fs.writeFileSync(path.join(f, "a.txt"), "a");
    const one = await limits(f, priv);
    expect(one.r.ok && one.r.commit).toBeTruthy();
    expect(one.of("init")).toEqual([20_000]);
    expect(one.of("add")).toEqual([120_000]);
    expect(one.of("commit-tree")).toEqual([120_000]);
    expect(one.of("update-ref")).toEqual([]); // the bridge writes the ref itself: no reflog
    expect(one.of("commit")).toEqual([]); // plumbing only: nothing writes COMMIT_EDITMSG
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    const two = await limits(f, priv);
    expect(two.r.ok && two.r.commit).toBeTruthy();
    expect(two.all.every((ms) => ms === 20_000)).toBe(true);
  });

  it("a repo with a commit never gets 120 s, even with HEAD pointed at an empty branch (a planted way to look new)", async () => {
    const f = tmp();
    const priv = tmp();
    fs.writeFileSync(path.join(f, "a.txt"), "a");
    expect((await saveTurnToGit({ folder: f, summary: "s", turnId: "t", env: process.env, privateDir: priv })).ok).toBe(true);
    plainGit(f, ["symbolic-ref", "HEAD", "refs/heads/empty"]);
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    const r = await limits(f, priv);
    expect(r.all.length).toBeGreaterThan(3);
    expect(r.all.every((ms) => ms === 20_000)).toBe(true);
  });

  it("a repo with only a tag or a detached HEAD at a commit counts as having history", async () => {
    const f = tmp();
    const priv = tmp();
    fs.writeFileSync(path.join(f, "a.txt"), "a");
    await saveTurnToGit({ folder: f, summary: "s", turnId: "t", env: process.env, privateDir: priv });
    const sha = plainGit(f, ["rev-parse", "HEAD"]).trim();
    plainGit(f, ["update-ref", "-d", "refs/heads/main"]);
    fs.writeFileSync(path.join(f, ".git", "HEAD"), `${sha}\n`); // detached, no branch left
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    const r = await limits(f, priv);
    expect(r.all.every((ms) => ms === 20_000)).toBe(true);
  });

  it("an empty repo with no commit (made by the person or planted) gets the first-save limit: it has no history to protect", async () => {
    const f = tmp();
    const priv = tmp();
    plainGit(f, ["init", "-q", "--template="]);
    fs.writeFileSync(path.join(f, "a.txt"), "a");
    const r = await limits(f, priv);
    expect(r.of("add")).toEqual([120_000]);
  });
});

describe("tester findings (Agent.Tester, 2026-11-21)", () => {
  const temps = [];
  afterEach(() => {
    for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-git-qa-")));
    temps.push(d);
    return d;
  };
  const callRecord = (priv, gitDir) => path.join(priv, "calls", `${createHash("sha256").update(gitDir).digest("hex").slice(0, 32)}.json`);
  async function primedRepo() {
    const f = tmp();
    const priv = tmp();
    fs.writeFileSync(path.join(f, "a.txt"), "a");
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t0", env: process.env, privateDir: priv });
    expect(r.ok && r.commit).toBeTruthy();
    return { f, priv, gitDir: path.join(f, ".git") };
  }
  const deadPid = () => {
    // A pid that is not running now: a child that has exited.
    const c = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
    return Number(c.stdout);
  };

  it("D2: a lock the bridge's own killed git left (a record proves it) is removed, said in the result, and the save goes on", async () => {
    const { f, priv, gitDir } = await primedRepo();
    const start = Date.now();
    fs.mkdirSync(path.join(priv, "calls"), { recursive: true });
    fs.writeFileSync(path.join(gitDir, "index.lock"), "");
    fs.mkdirSync(path.join(gitDir, "refs", "heads"), { recursive: true });
    fs.writeFileSync(path.join(gitDir, "refs", "heads", "main.lock"), "");
    // The record names those very files (device, inode, birth time), as the bridge notes them while its git runs.
    const id = (rel) => {
      const st = fs.lstatSync(path.join(gitDir, rel), { bigint: true });
      return { rel, dev: String(st.dev), ino: String(st.ino), birth: st.birthtimeMs > 0n ? Number(st.birthtimeMs) : 0 };
    };
    fs.writeFileSync(callRecord(priv, gitDir), JSON.stringify({ pid: deadPid(), start, limit: 20_000, gitDir, locks: [id("index.lock"), id("refs/heads/main.lock")] }));
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
    expect(r.ok && r.commit).toBeTruthy();
    expect(r.recovered?.sort()).toEqual(["index.lock", "refs/heads/main.lock"]);
    expect(fs.existsSync(callRecord(priv, gitDir))).toBe(false);
  });

  it("D2: any lock the bridge cannot prove is its own is reported and kept", async () => {
    const { f, priv, gitDir } = await primedRepo();
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    const lock = path.join(gitDir, "index.lock");
    // (a) no record at all
    fs.writeFileSync(lock, "");
    let r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(lock)).toBe(true);
    fs.mkdirSync(path.join(priv, "calls"), { recursive: true });
    // (b) the recorded git is still alive (this test's own process stands in for it)
    fs.writeFileSync(callRecord(priv, gitDir), JSON.stringify({ pid: process.pid, start: Date.now(), limit: 20_000, gitDir }));
    r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t2", env: process.env, privateDir: priv });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(lock)).toBe(true);
    // (c) the recorded git is gone, but the record names no lock (it was killed before its lock was seen): kept
    fs.writeFileSync(callRecord(priv, gitDir), JSON.stringify({ pid: deadPid(), start: Date.now(), limit: 20_000, gitDir }));
    r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t3a", env: process.env, privateDir: priv });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(lock)).toBe(true);
    // (d) RT2: the recorded git is gone and the lock is at the recorded path, but it is ANOTHER file (another git made it): kept
    const st = fs.lstatSync(lock, { bigint: true });
    fs.writeFileSync(callRecord(priv, gitDir), JSON.stringify({ pid: deadPid(), start: Date.now(), limit: 20_000, gitDir, locks: [{ rel: "index.lock", dev: String(st.dev), ino: String(st.ino + 1n), birth: 0 }] }));
    r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t3", env: process.env, privateDir: priv });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(lock)).toBe(true);
  });

  it("D2/RT2: an index lock the killed call had no time to note is removed only if born within 250 ms of that call's start", async () => {
    expect(GIT_LOCK_UNNOTED_MS).toBe(250);
    const { f, priv, gitDir } = await primedRepo();
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    fs.mkdirSync(path.join(priv, "calls"), { recursive: true });
    const lock = path.join(gitDir, "index.lock");
    fs.writeFileSync(lock, "");
    const birth = Number(fs.lstatSync(lock, { bigint: true }).birthtimeMs);
    if (!(birth > 0)) return; // no birth time on this system: the fallback never applies there (the lock is reported)
    // Born 3 s after the call began: another git's (RT2) - kept.
    fs.writeFileSync(callRecord(priv, gitDir), JSON.stringify({ pid: deadPid(), start: Math.round(birth) - 3000, limit: 20_000, gitDir, takesIndexLock: true }));
    let r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(lock)).toBe(true);
    // Born right as an index-locking call began, and that call is gone: its own - removed and said.
    fs.writeFileSync(callRecord(priv, gitDir), JSON.stringify({ pid: deadPid(), start: Math.round(birth) - 5, limit: 20_000, gitDir, takesIndexLock: true }));
    r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t2", env: process.env, privateDir: priv });
    expect(r.ok && r.commit).toBeTruthy();
    expect(r.recovered).toEqual(["index.lock"]);
  });

  it("D2: the bridge's own ref lock, killed before it was noted, is removed only when born right as that write began", async () => {
    const { f, priv, gitDir } = await primedRepo();
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    fs.mkdirSync(path.join(priv, "calls"), { recursive: true });
    const lock = path.join(gitDir, "refs", "heads", "main.lock");
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, "");
    const birth = Number(fs.lstatSync(lock, { bigint: true }).birthtimeMs);
    if (!(birth > 0)) return;
    fs.writeFileSync(callRecord(priv, gitDir), JSON.stringify({ pid: deadPid(), start: birth - 3000, limit: 20_000, gitDir, lockRel: "refs/heads/main.lock" }));
    let r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(lock)).toBe(true);
    fs.writeFileSync(callRecord(priv, gitDir), JSON.stringify({ pid: deadPid(), start: birth - 5, limit: 20_000, gitDir, lockRel: "refs/heads/main.lock" }));
    r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t2", env: process.env, privateDir: priv });
    expect(r.ok && r.commit).toBeTruthy();
    expect(r.recovered).toEqual(["refs/heads/main.lock"]);
  });

  it("the whole save has a time cap: 60 s after history, 300 s for a first save", async () => {
    expect(GIT_SAVE_TOTAL_MS).toBe(60_000);
    expect(GIT_FIRST_SAVE_TOTAL_MS).toBe(300_000);
    const { f, priv } = await primedRepo();
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    let clock = Date.now();
    let calls = 0;
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv, now: () => clock, onGitRun: () => { if (++calls === 6) clock += 61_000; } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/longer than 60 s in all/);
  });

  it("the subject is cut at a word, with an ellipsis, 72 characters at most", () => {
    const s = "Added the login page with the email field and the code field and the button";
    const first = gitCommitMessage(s, [{ status: "A", path: "a" }], "t").split("\n")[0];
    expect(first.length).toBeLessThanOrEqual(72);
    expect(first.endsWith("…")).toBe(true);
    expect(s.startsWith(first.slice(0, -1))).toBe(true);
    expect(s[first.length - 1]).toBe(" "); // the cut is at a space
  });

  it("a flagged secret is not left in .git/objects (the bridge removes the loose object it wrote and nothing reaches)", async () => {
    const { f, priv } = await primedRepo();
    const secret = `key=${"AK" + "IA" + "QWERTYUIOPASDFGH"}\n`;
    fs.writeFileSync(path.join(f, "k.txt"), secret);
    fs.writeFileSync(path.join(f, "b.txt"), "b");
    const id = execFileSync("git", ["hash-object", path.join(f, "k.txt")], { encoding: "utf8", env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1" } }).trim();
    const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t1", env: process.env, privateDir: priv });
    expect(r.ok && r.skipped.map((x) => x.path)).toEqual(["k.txt"]);
    expect(fs.existsSync(path.join(f, ".git", "objects", id.slice(0, 2), id.slice(2)))).toBe(false);
    expect(fs.readFileSync(path.join(f, "k.txt"), "utf8")).toBe(secret); // still on disk, only not in git
  });
});

describe("changes made outside the chat are saved first, on their own (Kai-Zen decision)", () => {
  it("a file the person changed between turns: its own commit 'Changes made outside the chat', then the turn's commit", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "first turn"]);
    fs.writeFileSync(path.join(b.projPath, "mine.txt"), "made by the person");
    const r = await b.turn([writes([{ p: "c.txt", c: "c" }]), "second turn"]);
    expect(outsideEv(r, "git_saved")).toEqual([{ commit: expect.stringMatching(/^[0-9a-f]{40}$/), files: ["mine.txt"], skipped: [], pushed: "no-link", outside: true }]);
    expect(ev(r, "git_saved")[0].files).toEqual(["c.txt"]);
    const log = plainGit(b.projPath, ["log", "--format=%s", "-3"]).trim().split("\n");
    expect(log).toEqual(["echo: second turn", "Changes made outside the chat", "echo: first turn"]);
    expect(plainGit(b.projPath, ["log", "-1", "--skip=1", "--format=%B"])).not.toMatch(/Gilb-Turn:/);
    // The outside save comes before the turn runs (it is in the stream before the answer).
    const names = r.events.map((e) => e[0]);
    expect(names.indexOf("git_saved")).toBeLessThan(names.indexOf("message"));
  });

  it("no outside change: no extra commit and no extra event", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "one"]);
    const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "two"]);
    expect(outsideEv(r, "git_saved")).toEqual([]);
    expect(commitCount(b.projPath)).toBe(2);
  });

  it("changes made while the switch was off are committed separately once it is on again", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "one"]);
    await b.api("/v1/git/sync", { project: "app", sync: false });
    await b.turn([writes([{ p: "off.txt", c: "while off" }]), "off turn"]);
    await b.api("/v1/git/sync", { project: "app", sync: true });
    const r = await b.turn([writes([{ p: "on.txt", c: "on" }]), "on again"]);
    expect(outsideEv(r, "git_saved")[0].files).toEqual(["off.txt"]);
    expect(ev(r, "git_saved")[0].files).toEqual(["on.txt"]);
  });

  it("an outside secret is kept out of the outside commit too", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "one"]);
    fs.writeFileSync(path.join(b.projPath, "k.txt"), SECRETS.aws);
    fs.writeFileSync(path.join(b.projPath, "ok.txt"), "ok");
    const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "two"]);
    expect(outsideEv(r, "git_saved")[0]).toMatchObject({ files: ["ok.txt"], skipped: [{ path: "k.txt", reason: expect.any(String) }] });
    expect(committedFiles(b.projPath)).not.toContain("k.txt");
  });

  it("a folder with no repo yet gets no outside commit (the turn's first save makes the repo)", async () => {
    b = await startGitBridge();
    fs.writeFileSync(path.join(b.projPath, "pre.txt"), "p");
    const r = await b.turn([writes([{ p: "a.txt", c: "a" }]), "x"]);
    expect(outsideEv(r, "git_saved")).toEqual([]);
    expect(ev(r, "git_saved")[0].files.sort()).toEqual([".gitignore", "a.txt", "pre.txt"]);
  });
});

describe("re-test findings (Agent.Hacker RT1, Agent.Tester N1/N2)", () => {
  it("RT1: the bridge writes no reflog line; an existing reflog is left exactly as it was", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "one"]);
    const logs = path.join(b.projPath, ".git", "logs");
    fs.mkdirSync(path.join(logs, "refs", "heads"), { recursive: true });
    fs.writeFileSync(path.join(logs, "HEAD"), "ORIGINAL\n");
    fs.writeFileSync(path.join(logs, "refs", "heads", "main"), "ORIGINAL\n");
    const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "two"]);
    expect(ev(r, "git_saved")[0].commit).toMatch(/^[0-9a-f]{40}$/);
    expect(fs.readFileSync(path.join(logs, "HEAD"), "utf8")).toBe("ORIGINAL\n");
    expect(fs.readFileSync(path.join(logs, "refs", "heads", "main"), "utf8")).toBe("ORIGINAL\n");
    expect(fsckOk(b.projPath)).toBe(true);
  });

  it("RT1: HEAD pointing at something that is not a branch (a tag) refuses the save; the tag is not moved", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "one"]);
    plainGit(b.projPath, ["tag", "v1"]);
    const tagged = plainGit(b.projPath, ["rev-parse", "v1"]).trim();
    fs.writeFileSync(path.join(b.projPath, ".git", "HEAD"), "ref: refs/tags/v1\n");
    const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "two"]);
    expect(ev(r, "git_error")[0].reason).toMatch(/not a branch/);
    expect(plainGit(b.projPath, ["rev-parse", "v1"]).trim()).toBe(tagged);
  });

  it("N1: git's own lock refusal is reported as busy, never 'remove the file manually'", async () => {
    const f = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-git-busy-")));
    const priv = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-git-busyp-")));
    try {
      // A git that fails `add` exactly as git does when another git holds the index lock, and leaves no lock behind.
      const wrap = path.join(priv, process.platform === "win32" ? "git.cmd" : "git-wrap.sh");
      const real = execFileSync(process.platform === "win32" ? "where" : "which", ["git"], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
      if (process.platform === "win32") return; // the shell stand-in is POSIX-only
      fs.writeFileSync(wrap, `#!/bin/sh\nfor a in "$@"; do if [ "$a" = add ]; then echo "fatal: Unable to create '$PWD/.git/index.lock': File exists." >&2; echo "Another git process seems to be running in this repository ... remove the file manually to continue." >&2; exit 128; fi; done\nexec '${real}' "$@"\n`, { mode: 0o755 });
      fs.writeFileSync(path.join(f, "a.txt"), "a");
      const r = await saveTurnToGit({ folder: f, summary: "s", turnId: "t", env: process.env, privateDir: path.join(priv, "p"), gitBin: wrap });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("Another git is busy in this project, so nothing was saved this time.");
    } finally {
      fs.rmSync(f, { recursive: true, force: true });
      fs.rmSync(priv, { recursive: true, force: true });
    }
  });

  it("N2: a kept-out secret is reported once per content, again only when its content changes", async () => {
    b = await startGitBridge();
    const r1 = await b.turn([writes([{ p: "k.txt", c: SECRETS.aws }, { p: "a.txt", c: "a" }]), "one"]);
    expect(ev(r1, "git_saved")[0].skipped.map((x) => x.path)).toEqual(["k.txt"]);
    const r2 = await b.turn([writes([{ p: "b.txt", c: "b" }]), "two"]);
    expect(ev(r2, "git_saved")[0].skipped).toEqual([]);
    const r3 = await b.turn([writes([{ p: "k.txt", c: SECRETS.ghp }, { p: "c.txt", c: "c" }]), "three"]);
    expect(ev(r3, "git_saved")[0].skipped.map((x) => x.path)).toEqual(["k.txt"]);
    expect(committedFiles(b.projPath)).not.toContain("k.txt");
  });
});

describe("final round (Agent.Hacker FN1-FN4, Agent.Tester N4)", () => {
  it("N4: a project made with New project: the bridge's own .gitignore and .npmrc are in the turn's first commit, not 'outside the chat'", async () => {
    b = await startGitBridge({ project: null });
    await b.api("/v1/projects/create", { name: "fresh" });
    const r = await b.turn([writes([{ p: "index.html", c: "<p>hi</p>" }]), "made the page"], { project: "fresh" });
    expect(outsideEv(r, "git_saved")).toEqual([]);
    const files = ev(r, "git_saved")[0].files;
    expect(files).toContain("index.html");
    expect(files).toContain(".gitignore");
    expect(plainGit(path.join(b.ws, "fresh"), ["log", "--format=%s"]).trim()).toBe("echo: made the page");
  });

  it("FN2: HEAD naming a ref that is not a writable branch is refused; HEAD and the branch stay as they were", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "one"]);
    const headFile = path.join(b.projPath, ".git", "HEAD");
    const tip = plainGit(b.projPath, ["rev-parse", "refs/heads/main"]).trim();
    for (const bad of ["refs/heads/a..b", "refs/heads/../config", "refs/heads/x.lock", "refs/heads/.hidden", "refs/tags/v1", "refs/heads/with space"]) {
      fs.writeFileSync(headFile, `ref: ${bad}\n`);
      const r = await b.turn([writes([{ p: `${commitCount(b.projPath)}.txt`, c: bad }]), "x"]);
      expect(ev(r, "git_saved"), bad).toEqual([]);
      expect(ev(r, "git_error")[0].reason, bad).toMatch(/not a branch/);
      expect(fs.readFileSync(headFile, "utf8"), bad).toBe(`ref: ${bad}\n`);
    }
    fs.writeFileSync(headFile, "ref: refs/heads/main\n");
    expect(plainGit(b.projPath, ["rev-parse", "refs/heads/main"]).trim()).toBe(tip);
  });

  it("FN4: a process that survived an earlier turn's stop is still alive: the outside save is refused, the turn still runs", async () => {
    let alive = true;
    b = await startGitBridge({ bridgeOpts: { residualSeed: [[4194299, "s"]], procList: async () => (alive ? [{ pid: 4194299, ppid: 1, start: "s" }] : []) } });
    alive = false;
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "one"]);
    fs.writeFileSync(path.join(b.projPath, "mine.txt"), "m");
    alive = true;
    const r = await b.turn([writes([{ p: "c.txt", c: "c" }]), "two"]);
    expect(ev(r, "message")).toHaveLength(1);
    expect(outsideEv(r, "git_saved")).toEqual([]);
    expect(outsideEv(r, "git_error")[0].reason).toMatch(/left from an earlier turn/);
    // The turn's own save is refused for the same reason (nothing of an earlier turn may run while the bridge's git does).
    expect(ev(r, "git_saved")).toEqual([]);
    expect(ev(r, "git_error")[0].reason).toMatch(/still running/);
  });
});
