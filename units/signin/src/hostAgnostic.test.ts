// The host-agnostic check must PASS on the shipped unit and FAIL on each planted fault. It runs the
// real script against a scratch copy of src/. The plants include the escapes a line-based import
// check misses: a multi-line import, a multi-line `import type`, an import in a file an entry pulls
// in, and a template-literal dynamic import.
import { describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const unit = fileURLToPath(new URL("..", import.meta.url));
const script = join(unit, "scripts", "check-host-agnostic.mjs");

/** Copies src/ to a scratch dir, appends `planted` to `file`, and runs the check there. */
function runWithPlant(file: string, planted: string) {
  const dir = mkdtempSync(join(tmpdir(), "signin-hostcheck-"));
  try {
    cpSync(join(unit, "src"), join(dir, "src"), { recursive: true });
    const p = join(dir, "src", file);
    writeFileSync(p, `${readFileSync(p, "utf8")}\n${planted}\n`);
    return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("host-agnostic check", () => {
  test("the shipped unit passes, and the check walks the files the headless entries import", () => {
    const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/PASS/);
    expect(r.stdout).toMatch(/http\.ts/);
    expect(r.stdout).toMatch(/dpop\.ts/);
  });

  test.each([
    ["a one-line import from an app", "session.ts", `import { tokenManager } from "../../SomeApp/src/lib/base/token";`],
    ["an import from another package", "session.ts", `import { x } from "some-app/src/lib";`],
    ["a multi-line import from an app", "session.ts", `import {\n  tokenManager,\n} from "../../SomeApp/src/lib/base/token";`],
    ["a multi-line import type", "session.ts", `import type {\n  X,\n} from "some-app/src/types";`],
    ["an export-from an app", "session.ts", `export { y } from "../../SomeApp/y";`],
    ["an import in a file the entry pulls in", "http.ts", `import { z } from "../../SomeApp/src/z";`],
    ["a template-literal dynamic import", "session.ts", "export const m = () => import(`../SomeApp/x`);"],
    ["a React import in the headless core", "core.ts", `import React from "react";`],
    ["a React import in the machine entry", "machine.ts", `import { useState } from "react";`],
    ["a hardcoded host in a string", "session.ts", `export const URL = "https://id.gilb.com/base/auth/session/dpop-token";`],
    ["a hardcoded host in a pulled-in file", "transport.ts", "export const H = `https://localhost:8787/x`;"],
    ["a hardcoded host in the card", "SignInCard.tsx", `export const D = "gilb.com";`],
    ["a host named in a comment", "session.ts", "// see https://id.gilb.com for the live service"],
  ] as const)("a planted %s fails", (_name, file, planted) => {
    const r = runWithPlant(file, planted);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/FAIL/);
  });

  test("the card may import React: only the headless entries are held to siblings", () => {
    const r = runWithPlant("VaultNameStep.tsx", `import { useMemo } from "react";`);
    expect(r.status, r.stderr).toBe(0);
  });

  test("a missing entry is an error, not a pass", () => {
    const dir = mkdtempSync(join(tmpdir(), "signin-hostcheck-"));
    try {
      cpSync(join(unit, "src"), join(dir, "src"), { recursive: true });
      rmSync(join(dir, "src", "machine.ts"));
      expect(spawnSync(process.execPath, [script, dir], { encoding: "utf8" }).status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
