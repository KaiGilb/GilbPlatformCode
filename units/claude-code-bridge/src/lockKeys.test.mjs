// Bridge 0.3.17: ~/.base-deploy is protected, and full access never reads less-protected than folder mode. Fake home only; no real path is read.
import { describe, it, expect } from "vitest";
import path from "node:path";
import { protectedPlaces, protectedHit, codeTurnSettings, computerSandboxSettings, credentialReadDeny, credentialPlaces, fileToolDenyRules } from "../bridge/bridge.mjs";

// Native path form per OS (on Windows "/fake/home/kai" becomes "C:\\fake\\home\\kai"), as the 0.3.16 Windows fix did.
const HOME = path.resolve("/fake/home/kai");
const WS = path.resolve("/fake/ws");
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
      const full = computerSandboxSettings(HOME, WS, protectedPlaces(HOME, [], () => []), [], [], "", platform).sandbox.filesystem.denyRead;
      for (const p of folder) expect(full).toContain(p);
      expect(full).toContain(path.join(HOME, ".config"));
      expect(full).toContain(path.join(HOME, ".claude"));
      expect(full).toContain(path.join(HOME, ".git-credentials"));
      expect(full).toContain(path.join(HOME, ".base-deploy"));
    }
    const mac = computerSandboxSettings(HOME, WS, [], [], [], "", "darwin").sandbox.filesystem.denyRead;
    for (const b of ["Google/Chrome", "Firefox"]) expect(mac).toContain(path.join(HOME, "Library/Application Support", b));
    expect(mac).toContain(path.join(HOME, "Library/Safari"));
  });

  it("full access also denies reading a CLAUDE_CONFIG_DIR, like folder mode", () => {
    const full = computerSandboxSettings(HOME, WS, [], [], [], "~/.cfg-x", "darwin").sandbox.filesystem.denyRead;
    expect(full).toContain(path.join(HOME, ".cfg-x"));
    expect(computerSandboxSettings(HOME, WS, [], [], [], "/elsewhere/cfg", "darwin").sandbox.filesystem.denyRead).toContain(path.resolve("/elsewhere/cfg"));
  });

  it("the shared list is the one both modes use, so the full-access read list is a superset of folder mode's", () => {
    for (const platform of ["darwin", "linux", "win32"]) {
      const shared = credentialReadDeny(platform);
      expect(codeTurnSettings(HOME, platform === "win32" ? "darwin" : platform).sandbox.filesystem.denyRead).toEqual(expect.arrayContaining(platform === "win32" ? credentialReadDeny("darwin") : shared));
    }
    const full = new Set(computerSandboxSettings(HOME, WS, [], [], [], "", "darwin").sandbox.filesystem.denyRead);
    for (const p of codeTurnSettings(HOME, "darwin").sandbox.filesystem.denyRead) expect(full.has(abs(p))).toBe(true);
  });

  it("the credential list only reads; full access can still write its work areas (nothing writable sits under a denied read path)", () => {
    const s = computerSandboxSettings(HOME, WS, protectedPlaces(HOME, [], () => []), [], [], "", "darwin").sandbox.filesystem;
    for (const w of s.allowWrite) for (const d of credentialReadDeny("darwin").map(abs)) expect(w === d || w.startsWith(d + "/")).toBe(false);
  });
});

// 0.3.17 part 2: Claude Code's own file tools (Read, Edit/Write) are denied the same places by permission rules, in both modes.
describe("0.3.17 permission rules for the file tools", () => {
  const need = [".base-deploy", ".npmrc", ".config", ".claude", "Library/Application Support/Google/Chrome"];
  const has = (deny, tool, p) => deny.includes(`${tool}(/${path.join(HOME, p)})`) && deny.includes(`${tool}(/${path.join(HOME, p)}/**)`);

  it("full access: Read and Edit rules cover the credential list", () => {
    const deny = computerSandboxSettings(HOME, WS, protectedPlaces(HOME, [], () => []), [], [], "~/.cfg-x", "darwin").permissions.deny;
    for (const t of ["Read", "Edit"]) for (const p of [...need, ".cfg-x", "Developer/.base-deploy"]) expect(has(deny, t, p), `${t} ${p}`).toBe(true);
  });

  it("folder mode: Read and Edit rules cover the same list, and Windows folder mode too", () => {
    for (const platform of ["darwin", "linux"]) {
      const deny = codeTurnSettings(HOME, platform, [], "session", "~/.cfg-x").permissions.deny;
      for (const t of ["Read", "Edit"]) for (const p of [...need, ".cfg-x"]) expect(has(deny, t, p), `${platform} ${t} ${p}`).toBe(true);
    }
    const win = codeTurnSettings(HOME, "win32").permissions.deny;
    expect(win).toContain(`Read(/${path.join(HOME, ".base-deploy")})`);
    expect(win).toContain("WebFetch");
  });

  it("both modes take their places from the same helper", () => {
    const rules = new Set(fileToolDenyRules(credentialPlaces(HOME, "darwin", "")));
    const full = new Set(computerSandboxSettings(HOME, WS, [], [], [], "", "darwin").permissions.deny);
    const folder = new Set(codeTurnSettings(HOME, "darwin").permissions.deny);
    for (const r of rules) { expect(full.has(r)).toBe(true); expect(folder.has(r)).toBe(true); }
  });

  it("the approval check refuses a file read of ~/.base-deploy and ~/.npmrc (Windows spelling of the list included)", () => {
    for (const platform of ["win32", "darwin"]) {
      const o = { home: HOME, places: [...protectedPlaces(HOME, [], () => []), ...credentialPlaces(HOME, platform, "")], base: WS, ci: platform === "win32" };
      expect(protectedHit(path.join(HOME, ".base-deploy", "x"), o)).toBeTruthy();
      expect(protectedHit(path.join(HOME, ".npmrc"), o)).toBeTruthy();
      expect(protectedHit("~/.config/gcloud/creds.db", o)).toBeTruthy();
      expect(protectedHit("/fake/ws/ok.txt", o)).toBeNull();
    }
  });
});

// A real Windows home (drive letter, backslashes, any case). Runs only on Windows, where path is the Windows flavour.
describe.skipIf(process.platform !== "win32")("0.3.17 protectedHit on a real Windows home", () => {
  const home = "C:\\Users\\kai";
  const o = { home, places: [...protectedPlaces(home, [], () => []), ...credentialPlaces(home, "win32", "")], base: "C:\\Users\\kai\\MyCode", ci: true };
  it("refuses the key folders by backslash, slash, odd case and ~ spelling, and leaves the code folder alone", () => {
    for (const p of ["C:\\Users\\kai\\.base-deploy\\x", "C:/Users/kai/.base-deploy/x", "c:\\USERS\\Kai\\.BASE-DEPLOY\\x", "~/.base-deploy/x", "C:\\Users\\kai\\.npmrc", "C:\\Users\\kai\\Developer\\.base-deploy\\k", "C:\\Users\\kai\\.config\\gcloud\\a.json", "C:\\Users\\kai\\MyCode\\..\\.base-deploy\\x"]) expect(protectedHit(p, o), p).toBeTruthy();
    for (const p of ["C:\\Users\\kai\\MyCode\\a.txt", "ok.txt", "C:\\Users\\kai\\.base-deployx\\a"]) expect(protectedHit(p, o), p).toBeNull();
  });
});
