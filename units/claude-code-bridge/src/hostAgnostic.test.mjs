// @vitest-environment node
// The host-agnostic check passes on the shipped unit and FAILS on each planted fault. It runs the real script against a
// scratch copy of src/ and bridge/.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const unit = fileURLToPath(new URL("..", import.meta.url));
const script = join(unit, "scripts", "check-host-agnostic.mjs");
// Built from parts, so this unit's files do not themselves name the host the check refuses.
const G = "gilb" + ".com";

function runWithPlant(dirName, file, text) {
  const dir = mkdtempSync(join(tmpdir(), "hostcheck-"));
  try {
    cpSync(join(unit, "src"), join(dir, "src"), { recursive: true });
    cpSync(join(unit, "bridge"), join(dir, "bridge"), { recursive: true });
    writeFileSync(join(dir, dirName, file), text);
    return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("host-agnostic check", () => {
  it("the shipped unit passes", () => {
    const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
  });

  it.each([
    [`${G} in src`, "src", "planted.ts", `export const U = "https://" + "x.${G}";`],
    [`${G} in the built folder`, "bridge", "planted.mjs", `export const U = "https://x.${G}";`],
    [`${G} in a .mts file`, "bridge", "planted.d.mts", `export const U: "https://x.${G}";`],
    [`${G} in a comment`, "src", "planted.ts", `// served from ${G}\nexport const k = 1;`],
    ["veda.", "src", "planted.ts", 'export const U = "https://veda.example";'],
    ["w3id.org", "bridge", "planted.mjs", 'export const U = "https://w3id.org/x";'],
    ["localhost on the same line as the refused host", "src", "planted.ts", `export const U = "http://localhost:1/${G}";`],
    ["127.0.0.1 on the same line as veda.", "bridge", "planted.mjs", 'export const U = "127.0.0.1 veda.x";'],
  ])("a planted %s fails", (_name, dir, file, text) => {
    const r = runWithPlant(dir, file, text);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stderr).toMatch(/FAIL/);
  });

  it.each([
    ["localhost alone", "src", "planted.ts", 'export const U = "http://localhost:5197";'],
    ["127.0.0.1 alone", "bridge", "planted.mjs", 'export const U = "127.0.0.1";'],
  ])("%s passes", (_name, dir, file, text) => {
    const r = runWithPlant(dir, file, text);
    expect(r.status, r.stderr).toBe(0);
  });

  it("a test file may name a host", () => {
    const r = runWithPlant("src", "planted.test.mjs", `export const U = "https://x.${G}";`);
    expect(r.status, r.stderr).toBe(0);
  });
});
