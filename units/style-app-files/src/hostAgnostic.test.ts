// @vitest-environment node
// The host-agnostic check passes on the shipped source and FAILS on each planted fault (it runs the real script on a scratch copy);
// and a source test: the unit is Node only, it names no browser global and imports style-runtime as a type only.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const unit = fileURLToPath(new URL("..", import.meta.url));
const script = join(unit, "scripts", "check-host-agnostic.mjs");

function runWithPlant(file: string, text: string) {
  const dir = mkdtempSync(join(tmpdir(), "hostcheck-"));
  try {
    cpSync(join(unit, "src"), join(dir, "src"), { recursive: true });
    cpSync(join(unit, "bin"), join(dir, "bin"), { recursive: true });
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
    ["an import from an app", `import { x } from "../../SomeApp/src/x";`],
    ["an import from another package", `import { x } from "some-package";`],
    ["a node module that is not on the list", `import { x } from "node:child_process";`],
    ["a runtime import of style-runtime", `import { validateStyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";`],
    ["a template-literal dynamic import", "export const m = () => import(`../SomeApp/x`);"],
    ["a hardcoded host", `export const U = "https://gilb.com/app/";`],
    ["a dev host in a comment", "// the dev server is at localhost:4000\nexport const k = 1;"],
  ])("a planted %s fails", (_name, text) => {
    const r = runWithPlant("planted.mjs", text);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stderr).toMatch(/FAIL/);
  });
  test("an import type of style-runtime passes", () => {
    const r = runWithPlant("planted.d.mts", `import type { StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";\nexport type S = StyleSheet;`);
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

describe("source", () => {
  const files = [
    ...readdirSync(join(unit, "src")).filter((f) => /\.(mjs|mts)$/.test(f)).map((f) => join(unit, "src", f)),
    ...readdirSync(join(unit, "bin")).map((f) => join(unit, "bin", f)),
  ];
  test("there are source files to read", () => expect(files.length).toBeGreaterThanOrEqual(6));
  test("no browser global is used", () => {
    const BROWSER = /\b(window|document|localStorage|sessionStorage|navigator|indexedDB|location|alert|XMLHttpRequest|HTMLElement|fetch)\b\s*[.(\[]/;
    for (const f of files) {
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code, f).not.toMatch(BROWSER);
    }
  });
  test("style-runtime is never a runtime import (type only)", () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/^.*style-runtime.*$/gm)) {
        const line = m[0];
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        expect(line, `${f}: ${line}`).toMatch(/import type/);
      }
    }
  });
});
