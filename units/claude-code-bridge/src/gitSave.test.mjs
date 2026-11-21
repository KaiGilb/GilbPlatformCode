// @vitest-environment node
// GitHubSync Step 1: after a code turn that changed files, the BRIDGE (never the code turn) commits them locally.
// Over real HTTP with the stand-in claude (fake-claude.mjs, WRITEFILES). No network, no push.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DEFAULT_GITIGNORE,
  GIT_FIRST_SAVE_TIMEOUT_MS,
  GIT_TIMEOUT_MS,
  gitCommitMessage,
  saveTurnToGit,
  scanForSecret,
} from "../bridge/bridge.mjs";
import { commitCount, committedFiles, ev, fsckOk, lastMessage, plainGit, startGitBridge, writes } from "./gitTestKit.mjs";

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
    const r = await b.turn([writes([{ p: "a.txt", c: "a" }, { p: "node_modules/m/i.js", c: "m" }]), "x"]);
    expect(ev(r, "git_saved")[0].files).toEqual(["a.txt"]);
    expect(fs.existsSync(path.join(b.projPath, ".gitignore"))).toBe(false);
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
    expect(scanForSecret("x/y.p12", Buffer.from(""))).toBeNull(); // *.p12 is kept out by the default .gitignore, not the scan
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
    expect(one.of("commit")).toEqual([120_000]);
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
