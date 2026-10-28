import test from "node:test";
import assert from "node:assert/strict";
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
