// @vitest-environment node
// The host-agnostic check passes on the shipped source and FAILS on each planted fault. It runs the
// real script against a scratch copy of src/.
import { describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const unit = fileURLToPath(new URL("..", import.meta.url));
const script = join(unit, "scripts", "check-host-agnostic.mjs");

function runWithPlant(file: string, text: string) {
  const dir = mkdtempSync(join(tmpdir(), "hostcheck-"));
  try {
    cpSync(join(unit, "src"), join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", file), text);
    return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("host-agnostic check", () => {
  test("the shipped source passes", () => {
    const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
  });
  test.each([
    ["an import from an app", "planted.ts", `import { AppShell } from "../../SomeApp/src/components/AppShell";`],
    ["a multi-line import from an app", "planted.ts", `import {\n  AppShell,\n} from "../../SomeApp/src/components/AppShell";`],
    ["an import from another package", "planted.ts", `import { x } from "some-package";`],
    ["a template-literal dynamic import", "planted.ts", "export const m = () => import(`../SomeApp/x`);"],
    ["a hardcoded host", "planted.ts", `export const U = "https://gilb.com/app/";`],
    ["a host in a comment", "planted.ts", "// the live app is at localhost:4000\nexport const k = 1;"],
    ["an ontology host written veda.example.test", "planted.ts", `export const U = "https://veda.example.test/base";`],
    ["an ontology host written veda.x", "planted.ts", "// veda.x\nexport const k = 1;"],
    ["a CSS @import", "planted.css", `@import "../../SomeApp/src/styles/tokens.css";`],
    ["a CSS url()", "planted.css", `.x { background: url("https://example.test/a.png"); }`],
  ] as const)("a planted %s fails", (_name, file, text) => {
    const r = runWithPlant(file, text);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stderr).toMatch(/FAIL/);
  });
  test("a sentence that ends in GilbVeda. is not a host and passes", () => {
    const r = runWithPlant("planted.ts", `export const S = "Type at least 3 letters to search all of GilbVeda.";`);
    expect(r.status, r.stderr).toBe(0);
  });
  test("an empty src is an error, not a pass", () => {
    const dir = mkdtempSync(join(tmpdir(), "hostcheck-"));
    try {
      expect(spawnSync(process.execPath, [script, dir], { encoding: "utf8" }).status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
