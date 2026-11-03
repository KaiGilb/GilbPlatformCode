// @vitest-environment node
// The host-agnostic check passes on the shipped unit and FAILS on each planted fault.
// This unit allows one literal only: the identity origin, and only as a whole host.
// localhost and 127.0.0.1 are faults here (this process is not a loopback server).
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const unit = fileURLToPath(new URL("..", import.meta.url));
const script = join(unit, "scripts", "check-host-agnostic.mjs");
// Built from parts, so this file does not name the refused host as one literal the scanner would see
// if the test exception were ever dropped. The planted files are the ones under test.
const G = "gilb" + ".com";
const ALLOWED = "https://id." + G;

function runWithPlant(dirName, file, text) {
  const dir = mkdtempSync(join(tmpdir(), "hostcheck-"));
  try {
    cpSync(join(unit, "src"), join(dir, "src"), { recursive: true });
    cpSync(join(unit, "connector"), join(dir, "connector"), { recursive: true });
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
    expect(r.stdout).toMatch(/PASS/);
  });

  it("the allowed origin, as a whole host, is not a fault", () => {
    const r = runWithPlant("src", "planted.ts", `export const U = "${ALLOWED}";\n`);
    expect(r.status, r.stderr).toBe(0);
  });

  it.each([
    [`${G} in src`, "src", "planted.ts", `export const U = "https://x.${G}";`],
    [`${G} in the built folder`, "connector", "planted.mjs", `export const U = "https://x.${G}";`],
    ["a longer host that only starts with the allowed origin", "src", "planted.ts", `export const U = "${ALLOWED}.evil";`],
    ["veda.", "src", "planted.ts", 'export const U = "https://veda.example";'],
    ["w3id.org", "connector", "planted.mjs", 'export const U = "https://w3id.org/x";'],
    ["localhost", "src", "planted.ts", 'export const U = "http://localhost:1";'],
    ["127.0.0.1", "connector", "planted.mjs", 'export const U = "127.0.0.1";'],
    ["localhost on the same line as the allowed origin", "src", "planted.ts", `export const U = "${ALLOWED} http://localhost";`],
  ])("a planted %s fails", (_name, dir, file, text) => {
    const r = runWithPlant(dir, file, text);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stderr).toMatch(/FAIL/);
  });

  it("a test file may name a host", () => {
    const r = runWithPlant("src", "planted.test.mjs", `export const U = "https://x.${G}";\nexport const L = "127.0.0.1";`);
    expect(r.status, r.stderr).toBe(0);
  });
});
