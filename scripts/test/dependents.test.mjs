import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph, dependents } from "../lib/graph.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const FIX = join(HERE, "fixtures", "dependents");
const deps = (fx, keys) => dependents(loadGraph(join(FIX, fx), { web: true }), keys);

test("D1 chain a<-b<-c: change a gives b and c", () => {
  assert.deepEqual(deps("chain", ["units/a"]), ["units/b", "units/c"]);
  assert.deepEqual(deps("chain", ["units/b"]), ["units/c"]);
});
test("D2 diamond: each dependent once, sorted", () => {
  assert.deepEqual(deps("diamond", ["units/a"]), ["units/b", "units/c", "units/d"]);
});
test("D3 a dev-only file: edge counts", () => {
  assert.deepEqual(deps("dev", ["units/a"]), ["units/b"]);
});
test("D4 a web-unit depending on a unit", () => {
  assert.deepEqual(deps("web", ["units/a"]), ["web-units/w"]);
});
test("D5 no dependents gives an empty list", () => {
  assert.deepEqual(deps("none", ["units/a"]), []);
  assert.deepEqual(deps("chain", ["units/c"]), []);
});
test("D6 real repo: dependents of units/type-key", () => {
  const d = dependents(loadGraph(ROOT, { web: true }), ["units/type-key"]);
  assert.ok(d.includes("units/value-card"));
  assert.ok(d.includes("units/plan-card"));
  assert.ok(!d.includes("units/type-key"));
});
test("D7 --with-dependents without --changed exits 2", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "proof.mjs"), "type-key", "--with-dependents"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--with-dependents/);
});
