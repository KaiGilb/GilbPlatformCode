// @vitest-environment node
// The host-agnostic check passes on the shipped source and FAILS on each planted fault. It runs the real script against a scratch copy of
// src/, made under node_modules/.cache of this app (ignored by git), never in a system temp folder.
import { describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("..", import.meta.url));
const script = join(app, "scripts", "check-host-agnostic.mjs");
const scratchRoot = join(app, "node_modules", ".cache");

function scratch(): string {
  mkdirSync(scratchRoot, { recursive: true });
  return mkdtempSync(join(scratchRoot, "hostcheck-"));
}
function runWithPlant(file: string, text: string) {
  const dir = scratch();
  try {
    cpSync(join(app, "src"), join(dir, "src"), { recursive: true });
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
    ["an import of a unit the app does not use", "planted.ts", `import { x } from "@kaigilb/gilbplatformcode-lws-relations";`],
    ["a template-literal dynamic import", "planted.ts", "export const m = () => import(`../SomeApp/x`);"],
    ["a hardcoded host", "planted.ts", `export const U = "https://gilb.com/app/";`],
    ["a local address", "planted.ts", `export const U = "http://127.0.0.1:4000";`],
    ["a host in a comment", "planted.ts", "// the live app is at localhost:4000\nexport const k = 1;"],
    ["a CSS @import", "planted.css", `@import "../../SomeApp/src/styles/tokens.css";`],
    ["a CSS url()", "planted.css", `.x { background: url("https://example.test/a.png"); }`],
  ] as const)("a planted %s fails", (_name, file, text) => {
    const r = runWithPlant(file, text);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stderr).toMatch(/FAIL/);
  });
  test("an empty src is an error, not a pass", () => {
    const dir = scratch();
    try {
      expect(spawnSync(process.execPath, [script, dir], { encoding: "utf8" }).status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
