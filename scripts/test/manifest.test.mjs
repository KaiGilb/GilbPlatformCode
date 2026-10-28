import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkAll, main, provenanceOf, purposeOf, validateManifest, withManifest } from "../manifest.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (n) => path.join(here, "fixtures", "manifest", n);

function run(name, args = ["check"]) {
  const out = [];
  const err = [];
  const code = main(args, fx(name), (s) => out.push(s), (s) => err.push(s));
  return { code, out, err };
}

test("good: exit 0, one unit, no problems", () => {
  const r = run("good");
  assert.equal(r.code, 0);
  assert.deepEqual(r.out, ["1 units checked, 0 problems"]);
  assert.deepEqual(r.err, []);
});

test("a manifest that is not admitted to the library is good", () => {
  assert.equal(run("not-admitted").code, 0);
});

test("purpose: first sentence, or the whole line when there is no '. '", () => {
  assert.equal(purposeOf("## What this is\n\nOne. Two.\n"), "One.");
  assert.equal(purposeOf("## What this is\n\n\nNo stop here\nnext line\n"), "No stop here");
  assert.equal(purposeOf("## What this is\n\n## Next\n"), null);
  assert.equal(purposeOf("nothing"), null);
  assert.equal(run("purpose-whole-line").code, 0);
});

test("provenance text stops at the next heading", () => {
  assert.equal(provenanceOf("## Where it came from\n\nabc\n\n## Do not\n\nxyz\n").trim(), "abc");
});

const failures = [
  ["bad-json", /does not parse/],
  ["bad-schema", /schema is 2/],
  ["bad-unit", /unit is "units\/other"/],
  ["bad-package", /package is "@x\/other"/],
  ["bad-version", /version is "0\.2\.0"/],
  ["bad-purpose", /purpose differs/],
  ["bad-commit", /not 40 lowercase hex/],
  ["commit-not-in-readme", /not in the README's "Where it came from"/],
  ["bad-path", /not a relative path/],
  ["bad-lines-order", /lines must be null or \[from, to\]/],
  ["bad-lines-zero", /lines must be null or \[from, to\]/],
  ["bad-lines-shape", /lines must be null or \[from, to\]/],
  ["bad-to", /"src\/missing\.ts" does not exist/],
  ["bad-newfile", /newFiles "src\/nope\.ts" does not exist/],
  ["bad-tag", /library\.tag is not a tag/],
];
for (const [name, re] of failures) {
  test(`failure kind ${name}: exit 1 and the problem is named`, () => {
    const r = run(name);
    assert.equal(r.code, 1);
    assert.ok(r.err.some((l) => re.test(l)), `expected ${re} in ${JSON.stringify(r.err)}`);
    assert.match(r.out[0], /1 units checked, [1-9]\d* problems/);
  });
}

test("two units with one tag: both are named", () => {
  const r = run("dup-tag");
  assert.equal(r.code, 1);
  assert.equal(r.err.length, 2);
  assert.match(r.err[0], /units\/one: library\.tag t:Same\.tag is also the tag of units\/two/);
  assert.match(r.err[1], /units\/two: library\.tag t:Same\.tag is also the tag of units\/one/);
});

test("check with a named unit; an unknown unit is exit 2", () => {
  assert.equal(run("good", ["check", "demo"]).code, 0);
  assert.equal(run("good", ["check", "nope"]).code, 2);
  assert.equal(run("good", ["check", "--what"]).code, 2);
});

test("a named unit with no unit.json is a problem", () => {
  const r = run("no-manifest", ["check", "demo"]);
  assert.equal(r.code, 1);
  assert.match(r.err[0], /no unit\.json/);
});

test("check with no names skips units that have no unit.json", () => {
  const r = run("no-manifest");
  assert.equal(r.code, 0);
  assert.deepEqual(r.out, ["0 units checked, 0 problems"]);
});

test("list: with and without, and the counts", () => {
  const r = run("dup-tag", ["list"]);
  assert.equal(r.code, 0);
  assert.deepEqual(r.out, ["with     units/one", "with     units/two", "2 units: 2 with unit.json, 0 without"]);
  assert.deepEqual(run("no-manifest", ["list"]).out, ["without  units/demo", "1 units: 0 with unit.json, 1 without"]);
  assert.equal(withManifest(fx("good")).has.length, 1);
});

test("no command, or an unknown one, is exit 2", () => {
  assert.equal(run("good", []).code, 2);
  assert.equal(run("good", ["fix"]).code, 2);
});

test("validateManifest is pure: a non-object is one problem", () => {
  assert.deepEqual(validateManifest(null, {}), ["unit.json is not an object"]);
  assert.equal(checkAll(fx("good")).length, 1);
});
