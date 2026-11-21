// @vitest-environment node
// GitHubSync Step 1, security review (Agent.Hacker, 2026-11-21): defensive regression cases for the bridge's saveTurnToGit.
// Each case leaves a project folder the way an untrusted code turn could leave it, then runs the bridge's own save and checks that
// the hardening holds: no planted command runs (a marker file would appear), nothing outside the folder is read into a commit or
// written, risky files are refused or not committed, and the save never runs past its time limit.
// Harmless only: every "attack" is a shell script that appends a line to a marker file INSIDE the test's own folder.
// Secret probes whose miss is a scanner gap (not a hardening break) are recorded in a printed table instead of failing.
// Adopted into the unit 2026-11-21 (Agent.Coder): key-like literals are built from parts at run time so the file holds none, and
// the cases the report marked "records" are now assertions for what the fix closed (F7, F8, F9, F6).
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { saveTurnToGit, GIT_TIMEOUT_MS, GIT_FIRST_SAVE_TIMEOUT_MS } from "../bridge/bridge.mjs";
import { commitCount, committedFiles, ev, fsckOk, lastMessage, plainGit, startGitBridge, writes } from "./gitTestKit.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const posix = process.platform !== "win32";
const markerScript = (marker) => `#!/bin/sh\necho ran >> '${marker}'\ncat\n`;
const cfg = (extra = "") => `[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n${extra}`;

let t; // the current case's sandbox
let b; // a bridge, for the cases that need the HTTP surface
afterEach(async () => {
  await b?.close();
  b = undefined;
  if (t) await removeTestDir(t.dir);
  t = undefined;
});

/** A throwaway folder: proj/ (the turn's folder), priv/ (the bridge's own), outside/ (must never be read into a commit or written). */
function sandbox() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-gitrev-")));
  const folder = path.join(dir, "proj");
  const priv = path.join(dir, "priv");
  const outside = path.join(dir, "outside");
  fs.mkdirSync(folder);
  fs.mkdirSync(outside);
  const marker = path.join(dir, "PWNED");
  const evil = path.join(dir, "evil.sh");
  fs.writeFileSync(evil, markerScript(marker), { mode: 0o755 });
  const victim = path.join(outside, "victim.txt");
  fs.writeFileSync(victim, "ORIGINAL\n");
  let n = 0;
  const save = (o = {}) => saveTurnToGit({ folder, summary: "turn summary", turnId: `t${++n}`, env: process.env, privateDir: priv, ...o });
  const w = (rel, c = "x") => {
    fs.mkdirSync(path.dirname(path.join(folder, rel)), { recursive: true });
    fs.writeFileSync(path.join(folder, rel), c);
  };
  t = { dir, folder, priv, outside, marker, evil, victim, save, w, git: path.join(folder, ".git") };
  return t;
}
/** A sandbox whose project already has one clean commit, as after the person's first turn. */
async function primed() {
  const s = sandbox();
  s.w("a.txt", "a");
  const r = await s.save();
  expect(r.ok).toBe(true);
  expect(commitCount(s.folder)).toBe(1);
  return s;
}
const ran = (s) => fs.existsSync(s.marker);
const victimIntact = (s) => fs.readFileSync(s.victim, "utf8") === "ORIGINAL\n";
const listOutside = (s, sub = "") => fs.readdirSync(path.join(s.outside, sub)).filter((f) => f !== "victim.txt");

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("R1 links INSIDE .git: git must not write through them to a file outside the project", () => {
  // checkGitDirLayout looks only at HEAD, config, index, objects, refs. Every other file git WRITES during a commit is open()ed
  // and follows a link. A code turn can plant these in a repo the bridge already uses.
  it.each([
    ["COMMIT_EDITMSG", "COMMIT_EDITMSG"],
    ["logs/HEAD", "logs/HEAD"],
    ["logs/refs/heads/main", "logs/refs/heads/main"],
  ])("%s as a link to a file outside", async (_n, rel) => {
    const s = await primed();
    s.w("b.txt", "b");
    fs.mkdirSync(path.dirname(path.join(s.git, rel)), { recursive: true });
    fs.rmSync(path.join(s.git, rel), { force: true });
    fs.symlinkSync(s.victim, path.join(s.git, rel));
    const r = await s.save({ summary: "pwned line from the turn summary" });
    console.log(`[R1 ${rel}] save=${JSON.stringify(r)} victim=${JSON.stringify(fs.readFileSync(s.victim, "utf8"))}`);
    expect(victimIntact(s)).toBe(true);
  });

  it("COMMIT_EDITMSG as a link, payload from a FILE NAME only (no control of the summary needed)", async () => {
    const s = await primed();
    s.w("x\necho payload-from-a-file-name\n", "b");
    fs.rmSync(path.join(s.git, "COMMIT_EDITMSG"), { force: true }); // left by the first save
    fs.symlinkSync(s.victim, path.join(s.git, "COMMIT_EDITMSG"));
    const r = await s.save();
    console.log(`[R1 COMMIT_EDITMSG name-payload] ok=${r.ok} victim=${JSON.stringify(fs.readFileSync(s.victim, "utf8"))}`);
    expect(victimIntact(s)).toBe(true);
  });

  it("END TO END over /v1/turn: a code turn plants .git/COMMIT_EDITMSG -> a file outside the code folder (that need not exist yet)", async () => {
    b = await startGitBridge();
    await b.turn([writes([{ p: "a.txt", c: "a" }]), "first"]);
    const target = path.join(b.dir, "outside-new-file.sh"); // does not exist: git's fopen("w") creates it
    const r = await b.turn([writes([{ p: ".git/COMMIT_EDITMSG", link: target }, { p: "b.txt", c: "b" }]), "touch-marker-line"]);
    const got = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
    console.log(`[R1 e2e COMMIT_EDITMSG] git_saved=${JSON.stringify(ev(r, "git_saved"))} git_error=${JSON.stringify(ev(r, "git_error"))} outside file=${JSON.stringify(got)}`);
    expect(got).toBe(null);
  });

  it("refs/heads/main as a link to a file outside (holding the current commit)", async () => {
    const s = await primed();
    const head = plainGit(s.folder, ["rev-parse", "HEAD"]);
    fs.writeFileSync(s.victim, head);
    fs.rmSync(path.join(s.git, "refs/heads/main"));
    fs.symlinkSync(s.victim, path.join(s.git, "refs/heads/main"));
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[R1 refs/heads/main] save=${JSON.stringify(r)} victim=${JSON.stringify(fs.readFileSync(s.victim, "utf8"))}`);
    expect(fs.readFileSync(s.victim, "utf8")).toBe(head);
  });

  it.each([["logs"], ["refs/heads"], ["objects/info"]])(".git/%s as a link to a folder outside", async (rel) => {
    const s = await primed();
    const target = path.join(s.outside, "dir-" + rel.replace(/\//g, "_"));
    fs.cpSync(path.join(s.git, rel), target, { recursive: true });
    // Names AND contents of everything under the outside folder.
    const snap = () => fs.readdirSync(target, { recursive: true }).sort().map((f) => {
      const p = path.join(target, f);
      return fs.statSync(p).isFile() ? `${f}=${fs.readFileSync(p, "utf8").length}:${fs.readFileSync(p, "utf8").slice(-60)}` : `${f}/`;
    });
    const before = snap();
    fs.rmSync(path.join(s.git, rel), { recursive: true });
    fs.symlinkSync(target, path.join(s.git, rel));
    s.w("b.txt", "b");
    const r = await s.save();
    const after = snap();
    console.log(`[R1 ${rel}/] save.ok=${r.ok} ${r.ok ? "" : r.reason} changed outside: ${JSON.stringify(after.filter((x) => !before.includes(x)))}`);
    expect(after).toEqual(before);
  });

  it("every .git/objects/<xx> folder as a link to one folder outside", async () => {
    const s = await primed();
    const store = path.join(s.outside, "objs");
    fs.mkdirSync(store);
    for (let i = 0; i < 256; i++) {
      const xx = i.toString(16).padStart(2, "0");
      const p = path.join(s.git, "objects", xx);
      if (fs.existsSync(p)) fs.cpSync(p, store, { recursive: true });
      fs.rmSync(p, { recursive: true, force: true });
      fs.symlinkSync(store, p);
    }
    const before = fs.readdirSync(store).length;
    s.w("b.txt", "b-" + Date.now());
    const r = await s.save();
    const after = fs.readdirSync(store).length;
    console.log(`[R1 objects/xx] save.ok=${r.ok} ${r.ok ? "" : r.reason} files in outside store before=${before} after=${after}`);
    expect(after).toBe(before);
  });

  it("index.lock as a link to a file outside: refused, link and target left alone", async () => {
    const s = await primed();
    fs.symlinkSync(s.victim, path.join(s.git, "index.lock"));
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok).toBe(false);
    expect(victimIntact(s)).toBe(true);
    expect(fs.lstatSync(path.join(s.git, "index.lock")).isSymbolicLink()).toBe(true);
  });

  it(".git/hooks as a link to a folder of marker hooks: nothing runs", async () => {
    const s = await primed();
    const hooks = path.join(s.outside, "hooks");
    fs.mkdirSync(hooks);
    for (const h of ["pre-commit", "commit-msg", "post-commit", "post-index-change", "reference-transaction"]) fs.writeFileSync(path.join(hooks, h), markerScript(s.marker), { mode: 0o755 });
    fs.rmSync(path.join(s.git, "hooks"), { recursive: true, force: true });
    fs.symlinkSync(hooks, path.join(s.git, "hooks"));
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok).toBe(true);
    expect(ran(s)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("R2 repo config keys and attributes: refused, never run", () => {
  const cases = (s) => ({
    "core.fsmonitor": cfg(`\tfsmonitor = ${s.evil}\n`),
    "core.hooksPath": cfg(`\thooksPath = ${s.outside}/hooks\n`),
    "core.sshCommand": cfg(`\tsshCommand = ${s.evil}\n`),
    "core.worktree": cfg(`\tworktree = ${s.outside}\n`),
    "core.askPass": cfg(`\taskPass = ${s.evil}\n`),
    "core.alternateRefsCommand": cfg(`\talternateRefsCommand = ${s.evil}\n`),
    "include.path": cfg() + `[include]\n\tpath = ${s.outside}/inc.cfg\n`,
    "includeIf gitdir": cfg() + `[includeIf "gitdir:/"]\n\tpath = ${s.outside}/inc.cfg\n`,
    "includeIf onbranch": cfg() + `[includeIf "onbranch:main"]\n\tpath = ${s.outside}/inc.cfg\n`,
    "filter.x.clean": cfg() + `[filter "x"]\n\tclean = ${s.evil}\n\trequired = true\n`,
    "filter.x.process": cfg() + `[filter "x"]\n\tprocess = ${s.evil}\n`,
    "diff.external": cfg() + `[diff]\n\texternal = ${s.evil}\n`,
    "diff.x.textconv": cfg() + `[diff "x"]\n\ttextconv = ${s.evil}\n`,
    "UPPER-CASE section and key": `[CORE]\n\tFSMONITOR = ${s.evil}\n`,
    "subsection under an allowed section": cfg(`[core "x"]\n\tfsmonitor = ${s.evil}\n`),
    "allowed-looking remote key (uploadpack)": cfg() + `[remote "o"]\n\turl = ${s.outside}\n\tuploadpack = ${s.evil}\n`,
    "extensions.partialclone": cfg("\trepositoryformatversion = 1\n") + `[extensions]\n\tpartialclone = o\n`,
    "a key in a quoted-continuation line": cfg(`\tfilemode = true\\\n\n[filter "x"]\n\tclean = ${s.evil}\n`),
  });
  const names = Object.keys(cases({ evil: "", outside: "" }));

  it.each(names)("%s", async (name) => {
    const s = await primed();
    fs.mkdirSync(path.join(s.outside, "hooks"), { recursive: true });
    fs.writeFileSync(path.join(s.outside, "hooks", "pre-commit"), markerScript(s.marker), { mode: 0o755 });
    fs.writeFileSync(path.join(s.outside, "inc.cfg"), `[filter "x"]\n\tclean = ${s.evil}\n[core]\n\tfsmonitor = ${s.evil}\n`);
    fs.writeFileSync(path.join(s.git, "config"), cases(s)[name]);
    s.w(".gitattributes", "* filter=x diff=x\n");
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[R2 ${name}] ${JSON.stringify(r).slice(0, 200)}`);
    expect(ran(s)).toBe(false);
    expect(r.ok).toBe(false);
    expect(commitCount(s.folder)).toBe(1);
  });

  it("hooks in .git/hooks with core.hooksPath unset are not run, and the save still happens", async () => {
    const s = await primed();
    fs.mkdirSync(path.join(s.git, "hooks"), { recursive: true });
    for (const h of ["pre-commit", "prepare-commit-msg", "commit-msg", "post-commit", "post-index-change", "reference-transaction", "pre-auto-gc", "fsmonitor-watchman"]) {
      fs.writeFileSync(path.join(s.git, "hooks", h), markerScript(s.marker), { mode: 0o755 });
    }
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok && r.commit).toBeTruthy();
    expect(ran(s)).toBe(false);
  });

  it(".git/info/attributes and .gitattributes naming a filter no config defines: nothing runs, save happens", async () => {
    const s = await primed();
    fs.mkdirSync(path.join(s.git, "info"), { recursive: true });
    fs.writeFileSync(path.join(s.git, "info", "attributes"), "* filter=lfs diff=lfs merge=lfs\n");
    s.w(".gitattributes", "* filter=x diff=x ident\n");
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok).toBe(true);
    expect(ran(s)).toBe(false);
  });

  it("RACE: a process the turn left behind swaps .git/config between the bridge's check and git add", async () => {
    // Precondition (see the report): the bridge does not wait for the turn's process group to be killed before it saves
    // (reap() is fire-and-forget; SIGTERM, then SIGKILL after killGraceMs, default 2 s; on Windows there is no group).
    const s = await primed();
    s.w(".gitattributes", "* filter=x\n");
    await s.save();
    const good = cfg();
    const bad = cfg() + `[filter "x"]\n\tclean = ${s.evil}\n`;
    const flipper = spawn(process.execPath, ["-e", `
      const fs = require("fs"); const f = process.argv[1]; const tmp = f + ".flip";
      const g = process.argv[2], b = process.argv[3]; let i = 0;
      const end = Date.now() + 25000;
      (function loop() { if (Date.now() > end) return; fs.writeFileSync(tmp, i++ % 2 ? g : b); fs.renameSync(tmp, f); setTimeout(loop, 2); })();
    `, path.join(s.git, "config"), good, bad], { stdio: "ignore" });
    const tally = { refused: 0, saved: 0, other: 0 };
    try {
      for (let i = 0; i < 60 && !ran(s); i++) {
        s.w(`race-${i}.txt`, String(i));
        const r = await s.save();
        if (r.ok) tally.saved++;
        else if (/setting/.test(r.reason)) tally.refused++;
        else tally.other++;
      }
    } finally {
      flipper.kill("SIGKILL");
    }
    console.log(`[R2 RACE] ${JSON.stringify(tally)} markerRan=${ran(s)}`);
    expect(ran(s)).toBe(false);
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("R3 nested repos", () => {
  function nested(s, sub = "sub") {
    const d = path.join(s.folder, sub);
    fs.mkdirSync(d, { recursive: true });
    plainGit(d, ["init", "-q", "--template="]);
    fs.writeFileSync(path.join(d, "n.txt"), "n");
    plainGit(d, ["add", "n.txt"]);
    plainGit(d, ["-c", "user.name=n", "-c", "user.email=n@example.test", "commit", "-qm", "n"]);
    return d;
  }

  it("a nested repo with an evil config, attributes and hooks: none runs, it is saved as a gitlink only", async () => {
    const s = await primed();
    const d = nested(s);
    fs.mkdirSync(path.join(d, ".git", "hooks"), { recursive: true });
    for (const h of ["pre-commit", "post-index-change", "reference-transaction"]) {
      fs.writeFileSync(path.join(d, ".git", "hooks", h), markerScript(s.marker), { mode: 0o755 });
    }
    fs.appendFileSync(path.join(d, ".git", "config"), `[core]\n\tfsmonitor = ${s.evil}\n[filter "x"]\n\tclean = ${s.evil}\n\tprocess = ${s.evil}\n[diff]\n\texternal = ${s.evil}\n`);
    fs.writeFileSync(path.join(d, ".gitattributes"), "* filter=x\n");
    fs.writeFileSync(path.join(d, "n.txt"), "changed so the nested repo is dirty");
    const r = await s.save();
    expect(r.ok).toBe(true);
    expect(ran(s)).toBe(false);
    const ls = plainGit(s.folder, ["ls-tree", "HEAD", "sub"]);
    expect(ls.startsWith("160000 commit")).toBe(true);
  });

  it("a nested repo whose .git is a gitdir: file to a repo outside: outside repo unchanged", async () => {
    const s = await primed();
    const o = path.join(s.outside, "repo");
    fs.mkdirSync(o);
    plainGit(o, ["init", "-q", "--template="]);
    fs.writeFileSync(path.join(o, "o.txt"), "o");
    plainGit(o, ["add", "o.txt"]);
    plainGit(o, ["-c", "user.name=o", "-c", "user.email=o@example.test", "commit", "-qm", "o"]);
    fs.appendFileSync(path.join(o, ".git", "config"), `[core]\n\tfsmonitor = ${s.evil}\n`);
    const snap = () => fs.readdirSync(path.join(o, ".git"), { recursive: true }).sort().join("|") + fs.statSync(path.join(o, ".git", "index")).mtimeMs;
    const before = snap();
    s.w("sub/.git", `gitdir: ${path.join(o, ".git")}\n`);
    s.w("sub/x.txt", "x");
    const r = await s.save();
    console.log(`[R3 nested gitdir->outside] ${JSON.stringify(r).slice(0, 200)}`);
    expect(ran(s)).toBe(false);
    expect(snap()).toBe(before);
  });

  it("a nested .git that is a link to a repo outside: outside repo unchanged", async () => {
    const s = await primed();
    const o = path.join(s.outside, "repo2");
    fs.mkdirSync(o);
    plainGit(o, ["init", "-q", "--template="]);
    const before = fs.readdirSync(path.join(o, ".git"), { recursive: true }).sort();
    fs.mkdirSync(path.join(s.folder, "sub"));
    fs.symlinkSync(path.join(o, ".git"), path.join(s.folder, "sub", ".git"));
    s.w("sub/x.txt", "x");
    const r = await s.save();
    console.log(`[R3 nested .git link] ${JSON.stringify(r).slice(0, 200)}`);
    expect(fs.readdirSync(path.join(o, ".git"), { recursive: true }).sort()).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("R4 links in the work tree", () => {
  const objectsHold = (s, needle) => {
    const all = plainGit(s.folder, ["cat-file", "--batch-all-objects", "--batch"]);
    return all.includes(needle);
  };

  it("a file link to a secret outside: committed as a link, the secret's bytes are in no object", async () => {
    const s = await primed();
    fs.writeFileSync(path.join(s.outside, "secret.txt"), "OUTSIDE-SECRET-BYTES");
    fs.symlinkSync(path.join(s.outside, "secret.txt"), path.join(s.folder, "l.txt"));
    const r = await s.save();
    expect(r.ok).toBe(true);
    expect(objectsHold(s, "OUTSIDE-SECRET-BYTES")).toBe(false);
  });

  it("a folder link to a folder outside: nothing below it is committed", async () => {
    const s = await primed();
    fs.mkdirSync(path.join(s.outside, "d"));
    fs.writeFileSync(path.join(s.outside, "d", "inner.txt"), "OUTSIDE-DIR-BYTES");
    fs.symlinkSync(path.join(s.outside, "d"), path.join(s.folder, "dl"));
    const r = await s.save();
    expect(r.ok).toBe(true);
    expect(committedFiles(s.folder).filter((f) => f.startsWith("dl/"))).toEqual([]);
    expect(objectsHold(s, "OUTSIDE-DIR-BYTES")).toBe(false);
  });

  it("core.symlinks=false (an ALLOWED key) with a link to a secret outside: the secret's bytes are in no object", async () => {
    const s = await primed();
    fs.writeFileSync(path.join(s.git, "config"), cfg("\tsymlinks = false\n"));
    fs.writeFileSync(path.join(s.outside, "secret.txt"), "OUTSIDE-SECRET-BYTES-2");
    fs.symlinkSync(path.join(s.outside, "secret.txt"), path.join(s.folder, "l2.txt"));
    const r = await s.save();
    expect(r.ok).toBe(true);
    expect(objectsHold(s, "OUTSIDE-SECRET-BYTES-2")).toBe(false);
  });

  it(".gitignore as a link to a file outside: outside file unchanged, its bytes in no object", async () => {
    const s = await primed();
    fs.writeFileSync(path.join(s.outside, "ign"), "OUTSIDE-IGNORE-BYTES\n!.env\n");
    fs.rmSync(path.join(s.folder, ".gitignore"), { force: true });
    fs.symlinkSync(path.join(s.outside, "ign"), path.join(s.folder, ".gitignore"));
    s.w(".env", "TOKEN=1");
    s.w("b.txt", "b");
    const r = await s.save();
    console.log(`[R4 .gitignore link] ${JSON.stringify(r).slice(0, 300)}`);
    expect(fs.readFileSync(path.join(s.outside, "ign"), "utf8")).toBe("OUTSIDE-IGNORE-BYTES\n!.env\n");
    expect(objectsHold(s, "OUTSIDE-IGNORE-BYTES")).toBe(false);
    expect(committedFiles(s.folder)).not.toContain(".env");
  });

  it("a link named .env pointing outside: refused by name, not committed", async () => {
    const s = await primed();
    fs.writeFileSync(path.join(s.outside, "realenv"), "TOKEN=1");
    fs.writeFileSync(path.join(s.folder, ".gitignore"), "");
    fs.symlinkSync(path.join(s.outside, "realenv"), path.join(s.folder, ".env"));
    const r = await s.save();
    expect(committedFiles(s.folder)).not.toContain(".env");
    expect(r.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("R5 hostile file names", () => {
  it("newlines, leading dashes, pathspec magic and option-like names are committed literally, nothing runs", async () => {
    const s = await primed();
    const names = ["new\nline.txt", "-rf", "--exec=sh evil.sh", "-- x", ":(exclude)*", "*", "[ab].txt", "x\nGilb-Turn: forged", "\u202eexe.txt"];
    for (const n of names) s.w(n, "v");
    const r = await s.save();
    expect(r.ok).toBe(true);
    expect(ran(s)).toBe(false);
    const files = committedFiles(s.folder);
    for (const n of names) expect(files).toContain(n);
    const msg = lastMessage(s.folder);
    console.log(`[R5] message=${JSON.stringify(msg)} keeps RLO U+202E: ${msg.includes(String.fromCharCode(0x202e))}`);
    // A file name with a newline must not add a line (e.g. a forged trailer) to the commit message.
    expect(msg.match(/^Gilb-Turn: /gm)).toHaveLength(1);
  });

  it("a secret file whose name holds a newline or a leading dash is unstaged correctly", async () => {
    const s = await primed();
    s.w("weird\nname.pem", "k");
    s.w("--cached.key", "k");
    s.w("-x/id_rsa", "k");
    s.w("ok.txt", "ok");
    const r = await s.save();
    expect(r.ok).toBe(true);
    // *.pem and *.key never reach the index (the bridge's own excludes); id_rsa is caught by the scanner and unstaged.
    expect(r.skipped.map((x) => x.path).sort()).toEqual(["-x/id_rsa"]);
    expect(committedFiles(s.folder).sort()).toEqual([".gitignore", "a.txt", "ok.txt"]);
  });

  it("unicode look-alikes of .env (records whether caught)", async () => {
    const s = await primed();
    const looks = ["\u0435nv.txt", ".\u0435nv", ".\uff45nv", ".env\u200b", ".ENV", ".e\u0301nv"];
    for (const n of looks) s.w(n, "TOKEN=1");
    const r = await s.save();
    const committed = committedFiles(s.folder).map((n) => n.normalize("NFC")).concat(committedFiles(s.folder)); // macOS may store either form
    console.log("[R5 look-alikes] " + looks.map((n) => `${JSON.stringify(n)}=${committed.includes(n) || committed.includes(n.normalize("NFC")) ? "COMMITTED" : "kept out"}`).join(" "));
    expect(committed).not.toContain(".ENV");
    // F7 (fixed): fullwidth, zero-width, accented and Cyrillic look-alikes of .env are kept out (a name that is not .env-like is not).
    for (const n of [".\u0435nv", ".\uff45nv", ".env\u200b", ".e\u0301nv"]) expect(committed.includes(n) || committed.includes(n.normalize("NFC")), JSON.stringify(n)).toBe(false);
    expect(r.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("R6 secret scanner coverage (recorded, see the report)", () => {
  const BEGIN = "-----BEGIN ";
  const pem = BEGIN + "RSA PRIVATE" + " KEY-----\nMIIEow" + "A".repeat(60) + "\n-----END RSA PRIVATE KEY-----\n";
  const ossh = BEGIN + "OPENSSH PRIVATE" + " KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\n";
  const akia = "AK" + "IA" + "IOSFODNN7EXAMPLE";
  // [file, content, inSpec] - inSpec: the brief's own list (Step01 brief "Secret scan"); the rest are common real-world shapes.
  const probes = [
    ["s01-pem.txt", pem, true],
    ["s02-aws.txt", `key=${akia}`, true],
    ["s03-ghp.txt", "ghp_" + "a".repeat(36), true],
    ["s04-ghpat.txt", "github_pat_" + "A1_".repeat(20), true],
    ["s05-sk.txt", "sk-" + "a".repeat(40), true],
    ["s06-slack.txt", "xo" + "xb-1234567890-abcdefghij", true],
    [".env", "A=1", true],
    ["cfg/.env.local", "A=1", true],
    ["id_rsa", "k", true],
    ["server.pem", "k", true],
    ["tls.key", "k", true],
    ["id_ed25519", ossh, true],
    [".envrc", "export TOKEN=1", true],
    [".env-prod", "TOKEN=1", true],
    [".env_local", "TOKEN=1", true],
    ["s20-aws-split.txt", "AK" + "IAIOSFOD\nNN7EXAMPLE", false],
    [`s21-${akia}.txt`, "nothing secret inside", false],
    ["s22-pem-b64.txt", Buffer.from(pem).toString("base64"), false],
    ["s23-aws-b64.txt", Buffer.from(`key=${akia}`).toString("base64"), false],
    ["s24-aws-utf16.txt", Buffer.from(`key=${akia}`, "utf16le"), false],
    ["s25-pem-json.json", JSON.stringify({ private_key: pem }), false],
    ["s26-asia.txt", "AS" + "IA" + "IOSFODNN7EXAMPLE", false],
    ["s27-aws-secret.ini", "aws_secret_access_key = " + "wJalrXUtnFEMI/K7MDENG/" + "bPxRfiCYEXAMPLEKEY", false],
    ["s28-stripe.txt", "sk_live_" + "a".repeat(24), false],
    ["s29-google.txt", "AIza" + "B".repeat(35), false],
    ["s30-slack-xoxe.txt", "xoxe-1-" + "a".repeat(20), false],
    [".npmrc", "//registry.npmjs.org/:_authToken=npm_" + "a".repeat(36), false],
    ["cert.p12", "binary", false],
    ["s33-anthropic.txt", "sk-ant-api03-" + "a".repeat(40), true],
    ["s34-big-pem.txt", Buffer.concat([Buffer.alloc(1024 * 1024 + 10, 0x61), Buffer.from(pem)]), false],
    ["credentials.json", '{"type":"service_account","private_key_id":"abc","client_secret":"GOCSPX-' + "a".repeat(28) + '"}', false],
  ];

  it("records which planted secrets are kept out of the commit", async () => {
    const s = await primed();
    // A turn may also write its own .gitignore that UN-ignores secret shapes the bridge's excludes keep out.
    s.w(".gitignore", "!.env\n!.env.*\n!*.pem\n!*.key\n!*.p12\n");
    for (const [f, c] of probes) s.w(f, c);
    const r = await s.save();
    expect(r.ok).toBe(true);
    const committed = new Set(committedFiles(s.folder));
    const rows = probes.map(([f, , inSpec]) => ({ file: f, inSpec, result: committed.has(f) ? "COMMITTED" : "kept out" }));
    console.log("[R6 scanner]\n" + rows.map((x) => `  ${x.inSpec ? "spec " : "extra"}  ${x.result.padEnd(9)}  ${JSON.stringify(x.file)}`).join("\n"));
    const caughtInSpec = rows.filter((x) => x.inSpec && x.result === "kept out").length;
    const inSpec = rows.filter((x) => x.inSpec).length;
    const caughtAll = rows.filter((x) => x.result === "kept out").length;
    console.log(`[R6 scanner] in-spec kept out ${caughtInSpec}/${inSpec}; all probes kept out ${caughtAll}/${rows.length}`);
    // The regression floor: every shape the code claims to catch today stays caught.
    for (const f of ["s01-pem.txt", "s02-aws.txt", "s03-ghp.txt", "s04-ghpat.txt", "s05-sk.txt", "s06-slack.txt", ".env", "cfg/.env.local", "id_rsa", "server.pem", "tls.key", "id_ed25519", "s33-anthropic.txt"]) {
      expect(committed.has(f), f).toBe(false);
    }
    // F7 (fixed): every in-spec shape, and these extra shapes, are kept out too.
    expect(caughtInSpec, "in-spec").toBe(inSpec);
    for (const f of [".envrc", ".env-prod", ".env_local", `s21-${akia}.txt`, "s24-aws-utf16.txt", "s25-pem-json.json", "s26-asia.txt", "s27-aws-secret.ini", "s28-stripe.txt", "s29-google.txt", "s30-slack-xoxe.txt", ".npmrc", "cert.p12", "credentials.json"]) {
      expect(committed.has(f), f).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("R7 a pre-existing index.lock", () => {
  it("a fresh lock: refused as busy, lock kept", async () => {
    const s = await primed();
    fs.writeFileSync(path.join(s.git, "index.lock"), "");
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/busy/);
    expect(fs.existsSync(path.join(s.git, "index.lock"))).toBe(true);
  });
  it("a stale lock (11 min): reported as stale, never deleted", async () => {
    const s = await primed();
    const lock = path.join(s.git, "index.lock");
    fs.writeFileSync(lock, "");
    const old = new Date(Date.now() - 11 * 60_000);
    fs.utimesSync(lock, old, old);
    s.w("b.txt", "b");
    const r = await s.save();
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/stale/);
    expect(fs.existsSync(lock)).toBe(true);
    expect(fsckOk(s.folder)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("R8 limits: the bridge's git never runs past its limit", () => {
  const timed = async (fn) => {
    const t0 = Date.now();
    const r = await fn();
    return { r, ms: Date.now() - t0 };
  };

  it(".git/config as a FIFO (git would block reading it): stopped at GIT_TIMEOUT_MS", async () => {
    const s = await primed();
    fs.rmSync(path.join(s.git, "config"));
    execFileSync("mkfifo", [path.join(s.git, "config")]);
    s.w("b.txt", "b");
    const { r, ms } = await timed(() => s.save());
    console.log(`[R8 fifo config] ${ms} ms ${JSON.stringify(r)}`);
    expect(r.ok).toBe(false);
    expect(ms).toBeLessThan(GIT_TIMEOUT_MS + 5000);
  }, GIT_TIMEOUT_MS + 15_000);

  it("a FIFO .gitignore in the work tree: stopped at GIT_TIMEOUT_MS, no hang", async () => {
    const s = await primed();
    fs.rmSync(path.join(s.folder, ".gitignore"), { force: true });
    execFileSync("mkfifo", [path.join(s.folder, ".gitignore")]);
    s.w("b.txt", "b");
    const { r, ms } = await timed(() => s.save());
    console.log(`[R8 fifo .gitignore] ${ms} ms ${JSON.stringify(r)}`);
    expect(ms).toBeLessThan(GIT_TIMEOUT_MS + 5000);
  }, GIT_TIMEOUT_MS + 15_000);

  it("a FIFO file in the work tree: no hang", async () => {
    const s = await primed();
    execFileSync("mkfifo", [path.join(s.folder, "pipe")]);
    s.w("b.txt", "b");
    const { r, ms } = await timed(() => s.save());
    console.log(`[R8 fifo file] ${ms} ms ${JSON.stringify(r).slice(0, 200)}`);
    expect(ms).toBeLessThan(GIT_TIMEOUT_MS + 5000);
  }, GIT_TIMEOUT_MS + 15_000);

  it("a repo with history whose refs the turn deleted gets which limit? (records the long first-save limit)", async () => {
    const s = await primed();
    fs.rmSync(path.join(s.git, "refs", "heads", "main"));
    fs.rmSync(path.join(s.git, "packed-refs"), { force: true });
    s.w("b.txt", "b");
    const limits = [];
    const r = await s.save({ onGitRun: (args, ms) => limits.push(`${args[0]}:${ms}`) });
    console.log(`[R8 refs deleted] ok=${r.ok} limits=${[...new Set(limits)].join(",")}`);
    // F8 (fixed): objects remain, so it is a repo with history: never the long first-save limit.
    expect(limits.some((x) => x.endsWith(`:${GIT_FIRST_SAVE_TIMEOUT_MS}`))).toBe(false);
    expect(limits.every((x) => x.endsWith(`:${GIT_TIMEOUT_MS}`))).toBe(true);
  });

  it("3 000 small files on a first save finish well inside the first-save limit", async () => {
    const s = sandbox();
    for (let i = 0; i < 3000; i++) s.w(`d${i % 30}/f${i}.txt`, `file ${i}`);
    const { r, ms } = await timed(() => s.save());
    console.log(`[R8 3000 files] ${ms} ms ok=${r.ok} files=${r.ok ? r.files.length : r.reason}`);
    expect(r.ok).toBe(true);
    expect(ms).toBeLessThan(GIT_FIRST_SAVE_TIMEOUT_MS);
  }, GIT_FIRST_SAVE_TIMEOUT_MS + 10_000);

  it("270 files just under the 1 MB scan limit (270 MB to scan, over the 256 MiB read buffer): records the outcome", async () => {
    const s = await primed();
    const chunk = Buffer.alloc(1024 * 1024 - 64, 0x61);
    for (let i = 0; i < 270; i++) {
      const c = Buffer.from(chunk);
      c.write(String(i).padStart(8, "0"), 0);
      s.w(`big/b${i}.txt`, c);
    }
    const { r, ms } = await timed(() => s.save());
    console.log(`[R8 270 x 1MB] ${ms} ms ok=${r.ok} ${r.ok ? `files=${r.files.length}` : r.reason}`);
    expect(ms).toBeLessThan(GIT_TIMEOUT_MS * 8);
    // F9 (fixed): the scan reads in batches, so the save goes through.
    expect(r.ok && r.commit).toBeTruthy();
  }, 300_000);
});

// ---------------------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("R9 the bridge surface: environment, switch, events", () => {
  it("non-GIT_ variables that steer git (EDITOR, VISUAL, PAGER, SSH_ASKPASS, XDG attributes) do not run anything", async () => {
    const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-gitrev-home-")));
    try {
      const marker = path.join(home, "PWNED");
      const evil = path.join(home, "evil.sh");
      fs.writeFileSync(evil, markerScript(marker), { mode: 0o755 });
      fs.mkdirSync(path.join(home, "xdg", "git"), { recursive: true });
      fs.writeFileSync(path.join(home, "xdg", "git", "attributes"), "* filter=x\n");
      fs.writeFileSync(path.join(home, "xdg", "git", "config"), `[filter "x"]\n\tclean = ${evil}\n`);
      fs.writeFileSync(path.join(home, ".gitconfig"), `[filter "x"]\n\tclean = ${evil}\n[core]\n\tattributesFile = ${home}/xdg/git/attributes\n`);
      b = await startGitBridge({ env: { HOME: home, XDG_CONFIG_HOME: path.join(home, "xdg"), EDITOR: evil, VISUAL: evil, PAGER: evil, SSH_ASKPASS: evil, git_dir: home, Git_Work_Tree: home } });
      const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), "x"]);
      expect(ev(r, "git_saved")).toHaveLength(1);
      expect(fs.existsSync(marker)).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("/v1/git/sync: unpaired 401, other origin 403, bad types 400, path-like project names refused", async () => {
    b = await startGitBridge();
    const post = (headers, body) => fetch(`${b.base}/v1/git/sync`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    expect((await post({}, { sync: false })).status).toBe(401);
    expect((await post({ "x-bridge-secret": "0".repeat(64) }, { sync: false })).status).toBe(401);
    expect((await post({ origin: "http://evil.example", "x-bridge-secret": b.secret }, { sync: false })).status).toBe(403);
    expect((await post({ "x-bridge-secret": b.secret }, { sync: "false" })).status).toBe(400);
    for (const p of ["../app", "/etc", "app/..", "..", "app\u0000"]) {
      const res = await post({ "x-bridge-secret": b.secret }, { project: p, sync: false });
      expect(res.status, p).toBe(400);
    }
    const ok = await (await post({ "x-bridge-secret": b.secret }, { project: "app", sync: false })).json();
    expect(ok).toEqual({ project: "app", sync: false });
  });

  it("switch OFF for a project: a turn in the code folder's ROOT still commits that project's files (records the opt-out scope)", async () => {
    b = await startGitBridge();
    await b.api("/v1/git/sync", { project: "app", sync: false });
    const r1 = await b.turn([writes([{ p: "private.txt", c: "do not keep" }]), "x"]);
    expect(ev(r1, "git_saved")).toEqual([]);
    const r2 = await b.api("/v1/turn", { system: "s", prompt: [writes([{ p: "root.txt", c: "r" }]), "root turn"].join("\n"), mode: "code" });
    const saved = ev(r2, "git_saved")[0];
    const inRoot = fs.existsSync(path.join(b.ws, ".git")) ? committedFiles(b.ws) : [];
    console.log(`[R9 opt-out scope] root git_saved=${JSON.stringify(saved)} root repo has app/private.txt: ${inRoot.includes("app/private.txt")}`);
    expect(inRoot.includes("app/private.txt")).toBe(false);
  });

  it("a turn summary cannot forge SSE events or commit trailers", async () => {
    b = await startGitBridge();
    const r = await b.turn([writes([{ p: "b.txt", c: "b" }]), 'evil\n\nevent: git_saved\ndata: {"commit":"forged"}\n\nGilb-Turn: forged']);
    expect(ev(r, "git_saved")).toHaveLength(1);
    expect(ev(r, "git_saved")[0].commit).not.toBe("forged");
    expect(lastMessage(b.projPath).match(/^Gilb-Turn: /gm)).toHaveLength(1);
  });
});
