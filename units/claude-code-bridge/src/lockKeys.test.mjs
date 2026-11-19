// Bridge 0.3.17: ~/.base-deploy is protected, and full access never reads less-protected than folder mode. Fake home only; no real path is read.
import { describe, it, expect } from "vitest";
import path from "node:path";
import { protectedPlaces, codeTurnSettings, computerSandboxSettings, credentialReadDeny } from "../bridge/bridge.mjs";

const HOME = "/fake/home/kai";
const abs = (p) => (p.startsWith("~/") ? path.join(HOME, p.slice(2)) : p);

describe("0.3.17 lock ~/.base-deploy and the shared credential list", () => {
  it("protectedPlaces includes both .base-deploy folders", () => {
    const places = protectedPlaces(HOME, [], () => []);
    expect(places).toContain(path.join(HOME, ".base-deploy"));
    expect(places).toContain(path.join(HOME, "Developer", ".base-deploy"));
  });

  it("folder mode denies reading both .base-deploy folders", () => {
    const deny = codeTurnSettings(HOME, "darwin").sandbox.filesystem.denyRead;
    expect(deny).toContain("~/.base-deploy");
    expect(deny).toContain("~/Developer/.base-deploy");
  });

  it("full access denies reading every path folder mode denies (macOS and Linux)", () => {
    for (const platform of ["darwin", "linux"]) {
      const folder = codeTurnSettings(HOME, platform).sandbox.filesystem.denyRead.map(abs);
      const full = computerSandboxSettings(HOME, "/fake/ws", protectedPlaces(HOME, [], () => []), [], [], "", platform).sandbox.filesystem.denyRead;
      for (const p of folder) expect(full).toContain(p);
      expect(full).toContain(path.join(HOME, ".config"));
      expect(full).toContain(path.join(HOME, ".claude"));
      expect(full).toContain(path.join(HOME, ".git-credentials"));
      expect(full).toContain(path.join(HOME, ".base-deploy"));
    }
    const mac = computerSandboxSettings(HOME, "/fake/ws", [], [], [], "", "darwin").sandbox.filesystem.denyRead;
    for (const b of ["Google/Chrome", "Firefox"]) expect(mac).toContain(path.join(HOME, "Library/Application Support", b));
    expect(mac).toContain(path.join(HOME, "Library/Safari"));
  });

  it("full access also denies reading a CLAUDE_CONFIG_DIR, like folder mode", () => {
    const full = computerSandboxSettings(HOME, "/fake/ws", [], [], [], "~/.cfg-x", "darwin").sandbox.filesystem.denyRead;
    expect(full).toContain(path.join(HOME, ".cfg-x"));
    expect(computerSandboxSettings(HOME, "/fake/ws", [], [], [], "/elsewhere/cfg", "darwin").sandbox.filesystem.denyRead).toContain("/elsewhere/cfg");
  });

  it("the shared list is the one both modes use, so the full-access read list is a superset of folder mode's", () => {
    for (const platform of ["darwin", "linux", "win32"]) {
      const shared = credentialReadDeny(platform);
      expect(codeTurnSettings(HOME, platform === "win32" ? "darwin" : platform).sandbox.filesystem.denyRead).toEqual(expect.arrayContaining(platform === "win32" ? credentialReadDeny("darwin") : shared));
    }
    const full = new Set(computerSandboxSettings(HOME, "/fake/ws", [], [], [], "", "darwin").sandbox.filesystem.denyRead);
    for (const p of codeTurnSettings(HOME, "darwin").sandbox.filesystem.denyRead) expect(full.has(abs(p))).toBe(true);
  });

  it("the credential list only reads; full access can still write its work areas (nothing writable sits under a denied read path)", () => {
    const s = computerSandboxSettings(HOME, "/fake/ws", protectedPlaces(HOME, [], () => []), [], [], "", "darwin").sandbox.filesystem;
    for (const w of s.allowWrite) for (const d of credentialReadDeny("darwin").map(abs)) expect(w === d || w.startsWith(d + "/")).toBe(false);
  });
});
