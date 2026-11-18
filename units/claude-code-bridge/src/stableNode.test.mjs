// @vitest-environment node
// 0.3.14: the login item must never record fnm's per-terminal multishell link (it is deleted later) or a temp path.
import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { isEphemeralNodePath, stableNodePath } from "../bridge/bridge.mjs";

const FNM = "/Users/x/.local/state/fnm_multishells/123_456/bin/node";
const REAL = "/Users/x/.local/share/fnm/node-versions/v22.1.0/installation/bin/node";

describe("isEphemeralNodePath", () => {
  it("N1 is true for fnm's multishell link on macOS/Linux and on Windows", () => {
    expect(isEphemeralNodePath(FNM)).toBe(true);
    expect(isEphemeralNodePath("C:\\Users\\x\\AppData\\Local\\fnm_multishells\\1_2\\node.exe")).toBe(true);
  });
  it("N2 is false for brew, /usr/local and fnm's real install", () => {
    for (const p of ["/opt/homebrew/bin/node", "/usr/local/bin/node", REAL]) expect(isEphemeralNodePath(p)).toBe(false);
  });
  it("N3 is true for a path under the temp folder", () => {
    expect(isEphemeralNodePath(path.join(os.tmpdir(), "x", "node"))).toBe(true);
  });
});

describe("stableNodePath", () => {
  const realpath = () => REAL; // every name resolves to the running node
  it("N4 does not record an fnm multishell link that resolves to this node: it returns execPath", () => {
    expect(stableNodePath({ named: FNM, execPath: REAL, realpath })).toBe(REAL);
  });
  it("N5 still prefers a lasting name on PATH that is this node", () => {
    expect(stableNodePath({ named: "/opt/homebrew/bin/node", execPath: REAL, realpath })).toBe("/opt/homebrew/bin/node");
  });
  it("returns execPath when there is no node on PATH, or the name is a different node", () => {
    expect(stableNodePath({ named: null, execPath: REAL, realpath })).toBe(REAL);
    expect(stableNodePath({ named: "/opt/homebrew/bin/node", execPath: REAL, realpath: (p) => p })).toBe(REAL);
  });
});
