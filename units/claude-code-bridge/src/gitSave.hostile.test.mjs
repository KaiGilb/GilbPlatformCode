// @vitest-environment node
// GitHubSync Step 1, hostile: a code turn plants git hooks, config, attributes or links that the BRIDGE's own git would
// run or follow after the turn. None may execute, none may be followed, and the repo must stay intact.
// Each attack runs a marker script: if the marker file appears, the bridge ran code the turn planted.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { saveTurnToGit } from "../bridge/bridge.mjs";
import { commitCount, committedFiles, ev, fsckOk, plainGit, startGitBridge, writes } from "./gitTestKit.mjs";

const posix = process.platform !== "win32";
let b;
afterEach(async () => {
  await b?.close();
  b = undefined;
});

/** A shell script that, if anything runs it, leaves `marker` behind (and fails, so a filter would notice too). */
const markerScript = (marker) => `#!/bin/sh\necho ran >> '${marker}'\ncat\n`;
async function primed() {
  b = await startGitBridge();
  // A first, clean turn: the repo exists and has one commit, as it would after the person's first turn.
  await b.turn([writes([{ p: "a.txt", c: "a" }]), "first"]);
  expect(commitCount(b.projPath)).toBe(1);
  const marker = path.join(b.dir, "PWNED");
  const evil = path.join(b.dir, "evil.sh");
  fs.writeFileSync(evil, markerScript(marker), { mode: 0o755 });
  return { marker, evil };
}
const cfg = (extra) => `[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n${extra}`;

describe.skipIf(!posix)("planted hooks never run", () => {
  it.each(["pre-commit", "prepare-commit-msg", "commit-msg", "post-commit", "pre-auto-gc", "post-index-change", "reference-transaction"])("%s in .git/hooks", async (hook) => {
    const { marker } = await primed();
    const r = await b.turn([writes([{ p: `.git/hooks/${hook}`, c: markerScript(marker), x: true }, { p: "b.txt", c: "b" }]), "x"]);
    expect(fs.existsSync(marker)).toBe(false);
    // Hooks are simply not run: the turn's real change is still saved.
    expect(ev(r, "git_saved")[0].files).toEqual(["b.txt"]);
    expect(fsckOk(b.projPath)).toBe(true);
  });
});

describe.skipIf(!posix)("planted repo config is refused, never run", () => {
  const cases = (evil, marker) => ({
    "core.fsmonitor": cfg(`\tfsmonitor = ${evil}\n`),
    "core.hooksPath": cfg(`\thooksPath = ${path.dirname(evil)}/hooks\n`),
    "credential.helper": cfg("") + `[credential]\n\thelper = !${evil}\n`,
    "filter.x.clean": cfg("") + `[filter "x"]\n\tclean = ${evil}\n\tsmudge = ${evil}\n\trequired = true\n`,
    "url.insteadOf": cfg("") + `[url "file:///${marker}"]\n\tinsteadOf = https://\n`,
    "include.path": cfg("") + `[include]\n\tpath = ${path.dirname(evil)}/inc.cfg\n`,
    "core.pager": cfg(`\tpager = ${evil}\n`),
    "core.sshCommand": cfg(`\tsshCommand = ${evil}\n`),
    "diff.external": cfg("") + `[diff]\n\texternal = ${evil}\n`,
    "gpg.program": cfg("") + `[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = ${evil}\n`,
    "core.worktree": cfg(`\tworktree = ${path.dirname(evil)}\n`),
    "extensions.worktreeConfig": cfg("\trepositoryformatversion = 1\n") + "[extensions]\n\tworktreeConfig = true\n",
  });

  it.each(Object.keys(cases("", "")))("%s", async (name) => {
    const { marker, evil } = await primed();
    fs.mkdirSync(path.join(b.dir, "hooks"), { recursive: true });
    fs.writeFileSync(path.join(b.dir, "hooks", "pre-commit"), markerScript(marker), { mode: 0o755 });
    fs.writeFileSync(path.join(b.dir, "inc.cfg"), `[core]\n\tfsmonitor = ${evil}\n`);
    const config = cases(evil, marker)[name];
    const r = await b.turn([writes([{ p: ".git/config", c: config }, { p: ".gitattributes", c: "* filter=x diff=x\n" }, { p: "b.txt", c: "b" }]), "x"]);
    expect(fs.existsSync(marker)).toBe(false);
    expect(ev(r, "git_saved")).toEqual([]);
    expect(ev(r, "git_error")[0].reason).toMatch(/setting|config/i);
    expect(ev(r, "message")).toHaveLength(1); // the turn itself is unharmed
    expect(commitCount(b.projPath)).toBe(1);
    expect(fsckOk(b.projPath)).toBe(true);
  });

  it("a repo made DURING the turn with an evil config is refused the same way", async () => {
    b = await startGitBridge();
    const marker = path.join(b.dir, "PWNED");
    const evil = path.join(b.dir, "evil.sh");
    fs.writeFileSync(evil, markerScript(marker), { mode: 0o755 });
    const r = await b.turn([
      writes([
        { p: ".git/HEAD", c: "ref: refs/heads/main\n" }, { p: ".git/objects/.keep", c: "" }, { p: ".git/refs/heads/.keep", c: "" },
        { p: ".git/config", c: cfg(`\tfsmonitor = ${evil}\n`) }, { p: "b.txt", c: "b" },
      ]),
      "x",
    ]);
    expect(fs.existsSync(marker)).toBe(false);
    expect(ev(r, "git_error")).toHaveLength(1);
  });

  it("allowed settings (remote, branch, user) do not stop the save", async () => {
    await primed();
    const r = await b.turn([writes([{ p: ".git/config", c: cfg("\tlogallrefupdates = true\n\tignorecase = true\n\tprecomposeunicode = true\n") + '[remote "origin"]\n\turl = https://example.test/x.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[branch "main"]\n\tremote = origin\n\tmerge = refs/heads/main\n[user]\n\tname = Someone\n' }, { p: "b.txt", c: "b" }]), "x"]);
    expect(ev(r, "git_saved")[0].files).toEqual(["b.txt"]);
    // The repo's own user.name is not used either: the identity is the bridge's.
    expect(plainGit(b.projPath, ["log", "-1", "--format=%an"]).trim()).toBe("App user");
  });
});

describe.skipIf(!posix)("links and pointers out of the project folder are never followed", () => {
  async function outsideRepo() {
    const outside = path.join(b.dir, "outside");
    fs.mkdirSync(outside);
    plainGit(outside, ["init", "-q", "--template="]);
    fs.writeFileSync(path.join(outside, "o.txt"), "o");
    plainGit(outside, ["add", "o.txt"]);
    plainGit(outside, ["-c", "user.name=o", "-c", "user.email=o@example.test", "commit", "-qm", "o"]);
    return outside;
  }

  it(".git as a symlink to another repo's .git", async () => {
    b = await startGitBridge();
    const outside = await outsideRepo();
    const r = await b.turn([writes([{ p: ".git", link: path.join(outside, ".git") }, { p: "b.txt", c: "b" }]), "x"]);
    expect(ev(r, "git_error")[0].reason).toMatch(/link/i);
    expect(commitCount(outside)).toBe(1);
  });

  it(".git as a symlink to the home folder", async () => {
    b = await startGitBridge();
    const r = await b.turn([writes([{ p: ".git", link: b.dir }, { p: "b.txt", c: "b" }]), "x"]);
    expect(ev(r, "git_error")[0].reason).toMatch(/link/i);
    expect(fs.existsSync(path.join(b.dir, "index"))).toBe(false);
  });

  it.each([["relative", (o) => path.join("..", "..", "outside", ".git")], ["absolute", (o) => path.join(o, ".git")]])("a gitdir: file pointing outside (%s)", async (_k, to) => {
    b = await startGitBridge();
    const outside = await outsideRepo();
    const r = await b.turn([writes([{ p: ".git", c: `gitdir: ${to(outside)}\n` }, { p: "b.txt", c: "b" }]), "x"]);
    expect(ev(r, "git_error")[0].reason).toMatch(/outside/i);
    expect(commitCount(outside)).toBe(1);
  });

  it("a gitdir: file pointing INSIDE the project folder is used", async () => {
    b = await startGitBridge();
    fs.mkdirSync(path.join(b.projPath, "repo-store"));
    plainGit(b.projPath, ["init", "-q", "--template=", `--separate-git-dir=${path.join(b.projPath, "repo-store", "g")}`]);
    fs.writeFileSync(path.join(b.projPath, ".gitignore"), "repo-store\n");
    const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "x"]);
    // .gitignore was made before the turn: saved first, as a change outside the chat.
    expect(ev(r, "git_saved")[0].files).toEqual(["b.txt"]);
  });

  it.each([["commondir", "objects/../../outside/.git"], ["objects/info/alternates", "/somewhere/else/objects"]])(".git/%s pointing elsewhere is refused", async (file, text) => {
    await primed();
    const r = await b.turn([writes([{ p: `.git/${file}`, c: text }, { p: "b.txt", c: "b" }]), "x"]);
    expect(ev(r, "git_error")).toHaveLength(1);
    // The planted file also misleads the test's own git; take it out to count what the bridge committed.
    fs.rmSync(path.join(b.projPath, ".git", file));
    expect(commitCount(b.projPath)).toBe(1);
  });

  it("a symlink in the project is committed as a link, never followed into its target", async () => {
    await primed();
    fs.writeFileSync(path.join(b.dir, "secret-outside.txt"), "outside secret");
    const r = await b.turn([writes([{ p: "link.txt", link: path.join(b.dir, "secret-outside.txt") }]), "x"]);
    expect(ev(r, "git_saved")[0].files).toEqual(["link.txt"]);
    expect(plainGit(b.projPath, ["cat-file", "-p", "HEAD:link.txt"])).toBe(path.join(b.dir, "secret-outside.txt"));
  });
});

describe.skipIf(!posix)("the bridge's own environment cannot steer its git", () => {
  it("GIT_DIR, GIT_WORK_TREE, GIT_EXEC_PATH, GIT_CONFIG_PARAMETERS and a global config are all ignored", async () => {
    const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-git-home-")));
    try {
      const marker = path.join(home, "PWNED");
      const evil = path.join(home, "evil.sh");
      fs.writeFileSync(evil, markerScript(marker), { mode: 0o755 });
      const outside = path.join(home, "outside");
      fs.mkdirSync(path.join(home, "xdg", "git"), { recursive: true });
      fs.writeFileSync(path.join(home, ".gitconfig"), `[core]\n\tfsmonitor = ${evil}\n\thooksPath = ${home}/hooks\n[user]\n\tname = Global Person\n`);
      fs.writeFileSync(path.join(home, "xdg", "git", "config"), `[core]\n\tfsmonitor = ${evil}\n`);
      b = await startGitBridge({
        env: {
          HOME: home, XDG_CONFIG_HOME: path.join(home, "xdg"), GIT_DIR: outside, GIT_WORK_TREE: outside, GIT_EXEC_PATH: path.join(home, "nowhere"),
          GIT_CONFIG_PARAMETERS: `'core.fsmonitor'='${evil}'`, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.fsmonitor", GIT_CONFIG_VALUE_0: evil,
        },
      });
      const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "x"]);
      expect(ev(r, "git_saved")[0].files.sort()).toEqual([".gitignore", "b.txt"]);
      expect(fs.existsSync(marker)).toBe(false);
      expect(fs.existsSync(outside)).toBe(false);
      expect(plainGit(b.projPath, ["log", "-1", "--format=%an"]).trim()).toBe("App user");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

// ---- after Agent.Hacker's review (F1-F10): the class fixes -------------------------------------------------------------
// Not on Windows: outside computer mode a Windows code turn is files-only (no command tool), so the bridge skips the look there.
describe.skipIf(!posix)("no save while a process of the turn may still run (F4)", () => {
  it("a live process whose parent is the turn's claude refuses the save; nothing is committed", async () => {
    const pre = await startGitBridge();
    const logFile = path.join(pre.dir, "claude.log");
    await pre.close();
    // The process list the bridge reads: a made-up child of the turn's claude that is still alive.
    const claudePid = () => {
      try {
        return fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === "run").map((r) => r.pid).pop();
      } catch {
        return undefined;
      }
    };
    b = await startGitBridge({
      env: { FAKE_CLAUDE_LOG: logFile },
      bridgeOpts: { killGraceMs: 50, procList: async () => (claudePid() ? [{ pid: 4194301, ppid: claudePid(), start: "x" }] : []) },
    });
    fs.mkdirSync(pre.dir, { recursive: true });
    const r = await b.turn([writes([{ p: "a.txt", c: "a" }]), "x"]);
    expect(ev(r, "message")).toHaveLength(1);
    expect(ev(r, "git_saved")).toEqual([]);
    expect(ev(r, "git_error")[0].reason).toMatch(/still running/);
    expect(fs.existsSync(path.join(b.projPath, ".git"))).toBe(false);
    fs.rmSync(pre.dir, { recursive: true, force: true });
  });

  it("with every process gone the save goes through (the same check, nothing alive)", async () => {
    b = await startGitBridge({ bridgeOpts: { procList: async () => [] } });
    const r = await b.turn([writes([{ p: "a.txt", c: "a" }]), "x"]);
    expect(ev(r, "git_saved")).toHaveLength(1);
  });
});

describe.skipIf(!posix)("the git folder is checked entry by entry (F1-F3)", () => {
  it("a hard link inside .git to a file outside refuses the save, and the outside file is unchanged", async () => {
    await primed();
    const victim = path.join(b.dir, "victim.txt");
    fs.writeFileSync(victim, "ORIGINAL\n");
    fs.rmSync(path.join(b.projPath, ".git", "COMMIT_EDITMSG"), { force: true });
    fs.linkSync(victim, path.join(b.projPath, ".git", "COMMIT_EDITMSG"));
    const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "x"]);
    expect(ev(r, "git_error")[0].reason).toMatch(/hard-linked/);
    expect(fs.readFileSync(victim, "utf8")).toBe("ORIGINAL\n");
  });

  it("a pipe inside .git refuses the save at once (no git is started on it)", async () => {
    await primed();
    execFileSync("mkfifo", [path.join(b.projPath, ".git", "description")]);
    const t0 = Date.now();
    const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "x"]);
    expect(ev(r, "git_error")[0].reason).toMatch(/not a plain file/);
    expect(Date.now() - t0).toBeLessThan(10_000);
  });
});

describe.skipIf(!posix)("gitdir: is checked by its text before any file system call (F10)", () => {
  it.each([["//host/share/repo", /network/], ["\\\\host\\share\\repo", /network/], ["/net/host/repo", /outside/]])("gitdir: %s is refused", async (target, why) => {
    b = await startGitBridge();
    const r = await b.turn([writes([{ p: ".git", c: `gitdir: ${target}\n` }, { p: "b.txt", c: "b" }]), "x"]);
    expect(ev(r, "git_error")[0].reason).toMatch(why);
  });

  it("gitdir: through a link inside the folder is refused", async () => {
    b = await startGitBridge();
    const outside = path.join(b.dir, "outside-repo");
    fs.mkdirSync(outside);
    plainGit(outside, ["init", "-q", "--template="]);
    const r = await b.turn([writes([{ p: "store", link: outside }, { p: ".git", c: "gitdir: store/.git\n" }, { p: "b.txt", c: "b" }]), "x"]);
    expect(ev(r, "git_error")[0].reason).toMatch(/link/);
  });
});

describe("a save of the code folder itself leaves out projects whose switch is off (F6)", () => {
  it("an already-tracked file in a project that is now off is not updated by a root save", async () => {
    b = await startGitBridge();
    const root = await b.api("/v1/turn", { system: "s", prompt: [writes([{ p: "app/kept.txt", c: "v1" }, { p: "root.txt", c: "r" }]), "root one"].join("\n"), mode: "code" });
    expect(ev(root, "git_saved")[0].files).toContain("app/kept.txt");
    await b.api("/v1/git/sync", { project: "app", sync: false });
    const r = await b.api("/v1/turn", { system: "s", prompt: [writes([{ p: "app/kept.txt", c: "v2 private" }, { p: "app/new.txt", c: "n" }, { p: "root2.txt", c: "r" }]), "root two"].join("\n"), mode: "code" });
    expect(ev(r, "git_saved")[0].files).toEqual(["root2.txt"]);
    expect(plainGit(b.ws, ["show", "HEAD:app/kept.txt"])).toBe("v1");
    expect(committedFiles(b.ws)).not.toContain("app/new.txt");
  });
});

// ---- D4 (Agent.Tester, last check): git trusts an object file already at the right path and skips writing it -------------
describe("a link or hard link at .git/objects/xx/<next blob> never puts foreign bytes into a commit (D4)", () => {
  /** A repo with one saved commit; returns the id and path of the blob the NEXT save will add (b.txt = "bee\n"). */
  async function nextBlob() {
    const f = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-git-d4-")));
    const proj = path.join(f, "proj");
    const out = path.join(f, "outside");
    fs.mkdirSync(proj);
    fs.mkdirSync(out);
    const priv = path.join(f, "priv");
    fs.writeFileSync(path.join(proj, "a.txt"), "a\n");
    const r1 = await saveTurnToGit({ folder: proj, summary: "first", turnId: "t1", env: process.env, privateDir: priv });
    expect(r1.ok && r1.commit).toBeTruthy();
    fs.writeFileSync(path.join(proj, "b.txt"), "bee\n");
    const id = plainGit(proj, ["hash-object", "b.txt"]).trim();
    const objPath = path.join(proj, ".git", "objects", id.slice(0, 2), id.slice(2));
    fs.mkdirSync(path.dirname(objPath), { recursive: true });
    return { f, proj, out, priv, id, objPath, tip: plainGit(proj, ["rev-parse", "HEAD"]).trim() };
  }
  /** A valid loose object of ANOTHER repo (other content): its file, copied outside. */
  function foreignObject(t) {
    const other = path.join(t.f, "otherrepo");
    fs.mkdirSync(other);
    plainGit(other, ["init", "-q", "--template="]);
    const fid = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: other, input: "FOREIGN SECRET CONTENT\n", encoding: "utf8", env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1" } }).trim();
    const copy = path.join(t.out, "foreign-obj");
    fs.copyFileSync(path.join(other, ".git", "objects", fid.slice(0, 2), fid.slice(2)), copy);
    return copy;
  }
  function plainOutside(t) {
    const p = path.join(t.out, "victim");
    fs.writeFileSync(p, "VICTIM\n");
    return p;
  }
  const cases = [
    ["a symlink", "another repo's object", (t) => fs.symlinkSync(foreignObject(t), t.objPath), posix],
    ["a symlink", "a plain outside file", (t) => fs.symlinkSync(plainOutside(t), t.objPath), posix],
    ["a hard link", "another repo's object", (t) => fs.linkSync(foreignObject(t), t.objPath), true],
    ["a hard link", "a plain outside file", (t) => fs.linkSync(plainOutside(t), t.objPath), true],
  ];
  for (const [kind, target, plant, runs] of cases) {
    it.skipIf(!runs)(`${kind} to ${target}: the save is refused, the branch does not move, fsck stays clean`, async () => {
      const t = await nextBlob();
      try {
        plant(t);
        const r = await saveTurnToGit({ folder: t.proj, summary: "second", turnId: "t2", env: process.env, privateDir: t.priv });
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/object .* (is not a plain file|does not hash back|cannot be read|damaged header)|a link in place of a git object/);
        expect(plainGit(t.proj, ["rev-parse", "HEAD"]).trim()).toBe(t.tip);
        // The bridge removed the planted name (only the name: an outside target is untouched) and reset the index, so the repo is
        // valid and the next save writes and commits b.txt's own bytes.
        expect(fs.lstatSync(t.objPath, { throwIfNoEntry: false })).toBeUndefined();
        for (const n of fs.readdirSync(t.out)) if (n === "victim") expect(fs.readFileSync(path.join(t.out, n), "utf8")).toBe("VICTIM\n");
        expect(fsckOk(t.proj)).toBe(true);
        const r3 = await saveTurnToGit({ folder: t.proj, summary: "third", turnId: "t3", env: process.env, privateDir: t.priv });
        expect(r3.ok && r3.commit).toBeTruthy();
        expect(plainGit(t.proj, ["show", "HEAD:b.txt"])).toBe("bee\n");
      } finally {
        fs.rmSync(t.f, { recursive: true, force: true });
      }
    });
  }
});
