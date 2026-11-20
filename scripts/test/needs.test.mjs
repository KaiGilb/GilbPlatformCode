import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { needsLine, problems, withNeeds } from "../needs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const NEEDS = join(ROOT, "scripts", "needs.mjs");

/** A throwaway repo of two units: `top` needs `base`; `base` needs nothing. */
function repoWith(topReadme) {
  const dir = mkdtempSync(join(tmpdir(), "needs-"));
  const unit = (name, peers, readme) => {
    mkdirSync(join(dir, "units", name), { recursive: true });
    writeFileSync(join(dir, "units", name, "package.json"), JSON.stringify({ name: `@kaigilb/gilbplatformcode-${name}`, version: "0.1.0", peerDependencies: peers }));
    writeFileSync(join(dir, "units", name, "README.md"), readme);
  };
  unit("base", {}, "# base\n");
  unit("top", { "@kaigilb/gilbplatformcode-base": "^0.1.0", react: "^19.0.0" }, topReadme);
  return dir;
}

// Spec: friction #42 — a README with no Needs line is reported, and `write` repairs it.
test("N1 a missing Needs line fails the check and write fixes it", () => {
  const dir = repoWith("# top\n");
  try {
    assert.deepEqual(problems(dir).map((p) => p.key), ["units/top"]);
    assert.equal(spawnSync(process.execPath, [NEEDS, "check", "--repo", dir], { encoding: "utf8" }).status, 1);
    assert.equal(spawnSync(process.execPath, [NEEDS, "write", "--repo", dir], { encoding: "utf8" }).status, 0);
    assert.equal(readFileSync(join(dir, "units", "top", "README.md"), "utf8"), "Needs: base\n\n# top\n");
    assert.equal(spawnSync(process.execPath, [NEEDS, "check", "--repo", dir], { encoding: "utf8" }).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Spec: friction #42 — a README whose Needs line names the wrong peers fails the check.
test("N2 a wrong Needs line fails the check", () => {
  const dir = repoWith("Needs: base, ghost\n\n# top\n");
  try {
    const [p] = problems(dir);
    assert.equal(p.want, "Needs: base");
    assert.equal(p.have, "Needs: base, ghost");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Spec: friction #42 — a unit with no library peers has no Needs line; third-party peers are not listed.
test("N3 a unit with no library peers needs no line", () => {
  assert.equal(needsLine({ libs: [] }), "");
  assert.equal(needsLine({ libs: ["@kaigilb/gilbplatformcode-b", "@kaigilb/gilbplatformcode-a"] }), "Needs: a, b");
  assert.equal(withNeeds("Needs: x\n\n# t\n", ""), "# t\n");
});

// Spec: friction #42 — every real unit README in the repo has the right line (runs with the tests).
test("N4 every unit README in this repo has the right Needs line", () => {
  assert.deepEqual(problems(ROOT).map((p) => `${p.key}: want "${p.want}", have "${p.have}"`), []);
});
