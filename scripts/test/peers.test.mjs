import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PEERS = join(ROOT, "scripts", "peers.mjs");
const FIX = join(HERE, "fixtures", "peers");
const PREFIX = "@kaigilb/gilbplatformcode-";

const run = (args) => spawnSync(process.execPath, [PEERS, ...args], { cwd: ROOT, encoding: "utf8" });
const orderOf = (unit, repo) => JSON.parse(run([unit, "--json", ...(repo ? ["--repo", repo] : [])]).stdout).order;
const edgesOf = (unit) => {
  const j = JSON.parse(readFileSync(join(ROOT, "units", unit, "package.json"), "utf8"));
  const out = Object.keys(j.peerDependencies || {}).filter((n) => n.startsWith(PREFIX));
  for (const [n, v] of Object.entries(j.dependencies || {})) if (n.startsWith(PREFIX) && String(v).startsWith("file:")) out.push(n);
  return out.map((n) => n.slice(PREFIX.length));
};
const units = readdirSync(join(ROOT, "units")).sort();

test("P1 order validity on every unit", () => {
  assert.equal(units.length, 252);
  for (const u of units) {
    const r = run([u, "--json"]);
    assert.equal(r.status, 0, `${u}: ${r.stderr}`);
    const order = JSON.parse(r.stdout).order;
    assert.equal(order.at(-1), u, `${u}: last entry`);
    assert.equal(new Set(order).size, order.length, `${u}: duplicates`);
    const pos = new Map(order.map((x, i) => [x, i]));
    for (const x of order) for (const e of edgesOf(x)) {
      assert.ok(pos.has(e), `${u}: ${x} needs ${e}, missing`);
      assert.ok(pos.get(e) < pos.get(x), `${u}: ${e} must come before ${x}`);
    }
  }
});

const readmeSet = (unit) => {
  const line = readFileSync(join(ROOT, "units", unit, "README.md"), "utf8").split("\n").find((l) => l.startsWith("npm install"));
  return line ? new Set([...line.matchAll(/<path-to-the-library>\/units\/([a-z0-9-]+)/g)].map((m) => m[1])) : null;
};
for (const [id, unit] of [["P2", "value-card"], ["P3 function-card", "function-card"], ["P3 solution-card", "solution-card"], ["P3 resource-card", "resource-card"]]) {
  test(`${id} order set equals the README npm line`, (t) => {
    const want = readmeSet(unit);
    if (!want) { t.diagnostic(`${unit}: README has no npm install line; only P1 applies`); return; }
    assert.deepEqual([...orderOf(unit)].sort(), [...want].sort());
  });
}

test("P4 fixtures: cycle exits 4", () => {
  const r = run(["a", "--repo", join(FIX, "cycle")]);
  assert.equal(r.status, 4);
  assert.match(r.stderr, /cycle: .*a.*b.*c/);
});
test("P4 fixtures: unknown peer exits 5 and names it", () => {
  const r = run(["a", "--repo", join(FIX, "unknown-peer")]);
  assert.equal(r.status, 5);
  assert.match(r.stderr, /ghost/);
});
test("P4 fixtures: conflicting third-party ranges exit 3 and show both", () => {
  const r = run(["a", "--repo", join(FIX, "conflict")]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /conflicting third-party peer ranges/);
  assert.match(r.stderr, /\^18\.0\.0/);
  assert.match(r.stderr, /\^19\.0\.0/);
});
test("P4 fixtures: unknown folder exits 2", () => {
  assert.equal(run(["nope", "--repo", join(FIX, "ties")]).status, 2);
  assert.equal(run(["nope"]).status, 2);
});
test("P4 fixtures: ties break by name, file: edge counts, given unit last", () => {
  assert.deepEqual(orderOf("top", join(FIX, "ties")), ["b", "m", "z", "top"]);
});

test("P5 leaf unit date-rules", () => {
  const j = JSON.parse(readFileSync(join(ROOT, "units", "date-rules", "package.json"), "utf8"));
  assert.deepEqual(edgesOf("date-rules"), []);
  assert.ok(!Object.keys(j.dependencies || {}).length);
  const r = run(["date-rules"]);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.startsWith("1 units, in install order:\n"));
});
