import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync, cpSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PROOF = join(ROOT, "scripts", "proof.mjs");
const FIX = join(HERE, "fixtures", "proof");
// Scratch for the --changed repo: a folder outside the worktree's tracked tree, never /tmp.
const GITFIX = process.env.PROOF_GITFIX || join(ROOT, "..", "..", "..", ".grok-runs", "vaultit", "gpc-cards", "r9", "r3b", "gitfix");

const run = (args, repo = FIX) => spawnSync(process.execPath, [PROOF, ...args, "--repo", repo], { cwd: ROOT, encoding: "utf8" });
const nm = (u) => join(FIX, "units", u, "node_modules");

test("ok unit passes with nothing skipped", () => {
  const r = run(["ok"]);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /units\/ok: PASS/);
  assert.match(r.stdout, /1 passed, 0 failed, 0 steps skipped/);
});

test("failing test: FAIL at test (exit 1), typecheck not run, exit 1", () => {
  rmSync(join(FIX, "units", "failtest", "typecheck-ran"), { force: true });
  const r = run(["failtest"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /units\/failtest: FAIL at test \(exit 1\)/);
  assert.ok(!existsSync(join(FIX, "units", "failtest", "typecheck-ran")), "typecheck must not run after a failed test");
  assert.match(r.stdout, /0 passed, 1 failed/);
  rmSync(join(FIX, "units", "failtest", "typecheck-ran"), { force: true });
});

test("no typecheck script: PASS with skipped (no script)", () => {
  const r = run(["notypecheck"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /typecheck skipped \(no script\)/);
  assert.match(r.stdout, /units\/notypecheck: PASS/);
});

test("unknown folder exits 2", () => {
  assert.equal(run(["no-such-unit"]).status, 2);
  assert.equal(spawnSync(process.execPath, [PROOF], { cwd: ROOT }).status, 2);
});

test("--json shape", () => {
  const j = JSON.parse(run(["ok", "failtest", "--json"]).stdout);
  assert.equal(j.passed, 1);
  assert.equal(j.failed, 1);
  assert.equal(j.units[1].pass, false);
  assert.deepEqual(Object.keys(j.units[0].steps[0]).sort(), ["exit", "ms", "name", "skipped"]);
});

// A fixture with one file: dependency, so that npm ci creates node_modules (a unit with no packages gets none; measured).
test("node_modules is removed after a run, kept with --keep", () => {
  rmSync(nm("withdeps"), { recursive: true, force: true });
  assert.equal(run(["withdeps"]).status, 0);
  assert.ok(!existsSync(nm("withdeps")), "node_modules must be removed");
  try {
    assert.equal(run(["withdeps", "--keep"]).status, 0);
    assert.ok(existsSync(join(nm("withdeps"), ".package-lock.json")), "--keep leaves node_modules");
  } finally { rmSync(nm("withdeps"), { recursive: true, force: true }); }
});

function gitRepo() {
  rmSync(GITFIX, { recursive: true, force: true });
  mkdirSync(GITFIX, { recursive: true });
  cpSync(join(FIX, "units"), join(GITFIX, "units"), { recursive: true });
  cpSync(join(FIX, "lib"), join(GITFIX, "lib"), { recursive: true });
  mkdirSync(join(GITFIX, "scripts"), { recursive: true });
  writeFileSync(join(GITFIX, "scripts", "x.mjs"), "1\n");
  // scripts/ holds fixture units too; a change there must not select the real unit of the same name.
  mkdirSync(join(GITFIX, "scripts", "test", "fixtures", "proof", "units", "ok"), { recursive: true });
  writeFileSync(join(GITFIX, "scripts", "test", "fixtures", "proof", "units", "ok", "package.json"), "{}\n");
  const git = (...a) => { const r = spawnSync("git", ["-C", GITFIX, "-c", "user.name=t", "-c", "user.email=t@example.invalid", ...a], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return git;
}

test("--changed selects only the touched unit; scripts/ alone selects none", () => {
  const git = gitRepo();
  try {
    writeFileSync(join(GITFIX, "units", "ok", "README.md"), "changed\n");
    git("add", "units/ok/README.md");
    git("commit", "-q", "-m", "touch ok");
    const r = run(["--changed", "HEAD~1", "--json"], GITFIX);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).units.map((u) => u.folder), ["units/ok"]);

    writeFileSync(join(GITFIX, "scripts", "x.mjs"), "2\n");
    writeFileSync(join(GITFIX, "scripts", "test", "fixtures", "proof", "units", "ok", "package.json"), "{\"a\":1}\n");
    git("add", "scripts/x.mjs", "scripts/test/fixtures/proof/units/ok/package.json");
    git("commit", "-q", "-m", "touch scripts only");
    const s = run(["--changed", "HEAD~1"], GITFIX);
    assert.equal(s.status, 0);
    assert.equal(s.stdout.trim(), "no units changed");
  } finally { rmSync(GITFIX, { recursive: true, force: true }); }
});
