import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { compareBlock, compareEntry, compareWhole, driftUnit, linesOf, main, unitLine } from "../drift.mjs";

const text = (...l) => l.join("\n") + "\n";
const OLD = text("a", "b", "c", "d", "e", "f");

test("linesOf: a final newline is not a line", () => {
  assert.deepEqual(linesOf("a\nb\n"), ["a", "b"]);
  assert.deepEqual(linesOf("a\nb"), ["a", "b"]);
  assert.deepEqual(linesOf(""), []);
});

test("block: same when it is still at the same lines", () => {
  assert.deepEqual(compareBlock(OLD, OLD, 2, 4), { verdict: "same", range: [2, 4], moved: false });
  assert.deepEqual(compareBlock(OLD, text("a", "b", "c", "d", "e", "CHANGED"), 2, 4), { verdict: "same", range: [2, 4], moved: false });
});

test("block: same but moved reports the new range", () => {
  const moved = text("x", "y", "z", "a", "b", "c", "d", "e");
  assert.deepEqual(compareBlock(OLD, moved, 2, 3), { verdict: "same", range: [5, 6], moved: true });
});

test("block: a one-character change is changed", () => {
  assert.deepEqual(compareBlock(OLD, text("a", "b", "c", "dd", "e", "f"), 2, 4), { verdict: "changed" });
  assert.deepEqual(compareBlock(OLD, text("a", "b", "c ", "d", "e", "f"), 2, 4), { verdict: "changed" });
});

test("block: a block that is split by an inserted line is changed", () => {
  assert.deepEqual(compareBlock(OLD, text("a", "b", "c", "new", "d", "e", "f"), 2, 4), { verdict: "changed" });
});

test("block: a single line, the first and the last lines of the file", () => {
  assert.equal(compareBlock(OLD, OLD, 1, 1).verdict, "same");
  assert.equal(compareBlock(OLD, OLD, 6, 6).verdict, "same");
  assert.equal(compareBlock(OLD, text("f"), 6, 6).moved, true);
});

test("block: a range outside the old file throws", () => {
  assert.throws(() => compareBlock(OLD, OLD, 5, 9), RangeError);
  assert.throws(() => compareBlock(OLD, OLD, 0, 2), RangeError);
});

test("whole file: same / changed", () => {
  assert.equal(compareWhole(OLD, OLD), "same");
  assert.equal(compareWhole(OLD, OLD + "x\n"), "changed");
});

const reader = (files) => (p) => (p in files ? files[p] : null);

test("entry: gone when the file is missing at the new commit", () => {
  const e = compareEntry({ path: "a.ts", lines: [1, 2], to: null }, reader({ "a.ts": OLD }), reader({}));
  assert.deepEqual(e, { path: "a.ts", lines: [1, 2], verdict: "gone" });
  assert.equal(compareEntry({ path: "a.ts", lines: null, to: null }, reader({ "a.ts": OLD }), reader({})).verdict, "gone");
});

test("entry: a file missing at the unit's own commit is an error, not a verdict", () => {
  assert.throws(() => compareEntry({ path: "a.ts", lines: null, to: null }, reader({}), reader({ "a.ts": OLD })), /not in the app repo at the unit's own commit/);
});

test("entry: a whole file", () => {
  const e = (n) => compareEntry({ path: "a.ts", lines: null, to: null }, reader({ "a.ts": OLD }), reader({ "a.ts": n }));
  assert.equal(e(OLD).verdict, "same");
  assert.equal(e(OLD + "more\n").verdict, "changed");
});

const manifest = (files) => ({ unit: "units/x", source: { repo: "R/A", commit: "c".repeat(40), files } });

test("unit: unchanged / drifted, and the line lists the entries that are not same", () => {
  const files = [
    { path: "a.ts", lines: [2, 3], to: null },
    { path: "b.ts", lines: null, to: null },
    { path: "c.ts", lines: [1, 1], to: null },
  ];
  const oldR = reader({ "a.ts": OLD, "b.ts": OLD, "c.ts": OLD });
  const same = driftUnit(manifest(files), oldR, oldR);
  assert.equal(same.verdict, "unchanged");
  assert.equal(unitLine(same), "unchanged units/x");
  const newR = reader({ "a.ts": text("a", "B", "c"), "c.ts": text("z") });
  const r = driftUnit(manifest(files), oldR, newR);
  assert.equal(r.verdict, "drifted");
  assert.equal(unitLine(r), "drifted units/x  a.ts 2-3 changed; b.ts gone; c.ts 1-1 changed");
});

test("unit: a moved block is unchanged, with the move named", () => {
  const files = [{ path: "a.ts", lines: [2, 3], to: null }];
  const r = driftUnit(manifest(files), reader({ "a.ts": OLD }), reader({ "a.ts": text("x", "y", "b", "c") }));
  assert.equal(r.verdict, "unchanged");
  assert.equal(unitLine(r), "unchanged units/x  (moved: a.ts 2-3 → 3-4)");
});

test("unit: the target is the unit's own commit: every entry same, nothing read", () => {
  const boom = () => { throw new Error("must not read"); };
  const r = driftUnit(manifest([{ path: "a.ts", lines: [1, 9], to: null }, { path: "b.ts", lines: null, to: null }]), boom, boom, true);
  assert.equal(r.verdict, "unchanged");
  assert.equal(r.entries.length, 2);
});

test("the output never carries a source line", () => {
  const secret = "SECRET_LINE_OF_THE_APP";
  const files = [{ path: "a.ts", lines: [1, 1], to: null }];
  const r = driftUnit(manifest(files), reader({ "a.ts": secret + "\n" }), reader({ "a.ts": "other\n" }));
  assert.ok(!JSON.stringify(r).includes(secret));
  assert.ok(!unitLine(r).includes(secret));
});

test("main: missing options, unknown option, bad repo, bad revision are exit 2", () => {
  const quiet = () => {};
  assert.equal(main([], undefined, quiet, quiet), 2);
  assert.equal(main(["--app-repo", "x"], undefined, quiet, quiet), 2);
  assert.equal(main(["--app-repo", "x", "--to", "HEAD", "--nope"], undefined, quiet, quiet), 2);
  assert.equal(main(["--app-repo", "/nonexistent-app-repo-for-test", "--to", "HEAD"], undefined, quiet, quiet), 2);
  assert.equal(main(["--app-repo", ".", "--to", "0000000000000000000000000000000000000000"], undefined, quiet, quiet), 2);
  assert.equal(main(["--help"], undefined, quiet, quiet), 0);
});

test("entry: a <repo>@<sha>:<path> entry is other, and the old reader is never called", () => {
  const boom = () => { throw new Error("must not read"); };
  const e = compareEntry({ path: "gilb-photo@bf56ec7d8bfeb573b338d7248f953fe8e0fdd827:src/photoRef.ts", lines: [17, 20], to: null }, boom, boom);
  assert.deepEqual(e, { path: "gilb-photo@bf56ec7d8bfeb573b338d7248f953fe8e0fdd827:src/photoRef.ts", lines: [17, 20], verdict: "other" });
  assert.equal(compareEntry({ path: "a.b-c_d@abcdef0:x.ts", lines: null, to: null }, boom, boom).verdict, "other");
  // not the form: a plain path with an @ later, or a short sha
  assert.throws(() => compareEntry({ path: "src/a@abcdef0:x.ts", lines: null, to: null }, reader({}), reader({})), /not in the app repo/);
  assert.throws(() => compareEntry({ path: "r@abc123:x.ts", lines: null, to: null }, reader({}), reader({})), /not in the app repo/);
});

test("unit: only same and other entries is unchanged, and the line names the other repo once", () => {
  const files = [
    { path: "a.ts", lines: [1, 2], to: null },
    { path: "gilb-photo@bf56ec7d8bfeb573b338d7248f953fe8e0fdd827:src/photoRef.ts", lines: [17, 20], to: null },
    { path: "gilb-photo@bf56ec7d8bfeb573b338d7248f953fe8e0fdd827:src/selfCard.ts", lines: [38, 49], to: null },
  ];
  const r = driftUnit(manifest(files), reader({ "a.ts": OLD }), reader({ "a.ts": OLD }));
  assert.equal(r.verdict, "unchanged");
  assert.equal(r.bad.length, 0);
  assert.equal(r.entries.filter((e) => e.verdict === "other").length, 2);
  assert.equal(unitLine(r), "unchanged units/x (2 entries cite another repo, not checked: gilb-photo@bf56ec7)");
});

test("unit: a drifted unit with an other entry still says drifted, and names the other repo", () => {
  const files = [
    { path: "a.ts", lines: [1, 1], to: null },
    { path: "r@1234567890:z.ts", lines: null, to: null },
  ];
  const r = driftUnit(manifest(files), reader({ "a.ts": OLD }), reader({ "a.ts": "x\n" }));
  assert.equal(r.verdict, "drifted");
  assert.equal(unitLine(r), "drifted units/x  a.ts 1-1 changed (1 entries cite another repo, not checked: r@1234567)");
});

function sandbox() {
  // a root with two units and a one-commit app repo; os.tmpdir() is the caller's TMPDIR
  const dir = mkdtempSync(path.join(os.tmpdir(), "drift-main-"));
  const app = path.join(dir, "app");
  const root = path.join(dir, "root");
  mkdirSync(app);
  const git = (...a) => spawnSync("git", ["-C", app, "-c", "user.name=t", "-c", "user.email=t@example.test", ...a], { encoding: "utf8" });
  git("init", "-q");
  writeFileSync(path.join(app, "a.ts"), "one\ntwo\n");
  git("add", "a.ts");
  git("commit", "-q", "-m", "first");
  const first = git("rev-parse", "HEAD").stdout.trim();
  writeFileSync(path.join(app, "a.ts"), "one\nTWO\n");
  git("commit", "-q", "-am", "second");
  const unit = (name, files) => {
    mkdirSync(path.join(root, "units", name), { recursive: true });
    writeFileSync(path.join(root, "units", name, "package.json"), JSON.stringify({ name }));
    writeFileSync(path.join(root, "units", name, "unit.json"), JSON.stringify({ unit: `units/${name}`, source: { repo: "KaiGilb/GilbApp", commit: first, files } }));
  };
  return { dir, app, root, first, unit };
}

test("main: a unit that throws is printed as an error, the next unit is still checked, the exit is 2", () => {
  const sb = sandbox();
  try {
    sb.unit("a-bad", [{ path: "missing.ts", lines: [1, 1], to: null }]);
    sb.unit("b-drifted", [{ path: "a.ts", lines: [1, 2], to: null }]);
    const lines = [];
    const code = main(["--app-repo", sb.app, "--to", "HEAD"], sb.root, (s) => lines.push(s), (s) => lines.push(s));
    assert.equal(code, 2);
    assert.ok(lines.some((l) => l.startsWith("error units/a-bad: missing.ts is not in the app repo")), lines.join("\n"));
    assert.ok(lines.some((l) => l === "drifted units/b-drifted  a.ts 1-2 changed"), lines.join("\n"));
    assert.equal(lines[lines.length - 1], "0 unchanged, 1 drifted, 0 skipped, 1 error");
  } finally { rmSync(sb.dir, { recursive: true, force: true }); }
});

test("main: no unit errors: the exit is what it was, and the summary has no error count", () => {
  const sb = sandbox();
  try {
    sb.unit("b-drifted", [{ path: "a.ts", lines: [1, 2], to: null }]);
    sb.unit("c-other", [{ path: "gilb-photo@bf56ec7d8bfeb573b338d7248f953fe8e0fdd827:src/x.ts", lines: [1, 2], to: null }]);
    const lines = [];
    assert.equal(main(["--app-repo", sb.app, "--to", "HEAD"], sb.root, (s) => lines.push(s)), 0);
    assert.equal(lines[lines.length - 1], "1 unchanged, 1 drifted, 0 skipped");
    assert.ok(lines.includes("unchanged units/c-other (1 entries cite another repo, not checked: gilb-photo@bf56ec7)"), lines.join("\n"));
    assert.equal(main(["--app-repo", sb.app, "--to", "HEAD", "--fail-on-drift"], sb.root, () => {}), 1);
    const json = [];
    main(["--app-repo", sb.app, "--to", "HEAD", "--json"], sb.root, (s) => json.push(s));
    const parsed = JSON.parse(json[0]);
    assert.equal(parsed.units.find((u) => u.unit === "units/c-other").entries[0].verdict, "other");
  } finally { rmSync(sb.dir, { recursive: true, force: true }); }
});
