// @vitest-environment node
// SU-4: injectBridge (the plugin's one injection function) and the bridge starting through a symlinked folder.
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { BRIDGE_SOURCE, claudeCodeBridgeFile, injectBridge } from "../bridge/vite-plugin.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const SOURCE = fs.readFileSync(BRIDGE_SOURCE, "utf8");
const key = () => crypto.randomBytes(32).toString("base64");
const KEYS = [{ id: "bu1", key: key() }, { id: "bu2", key: key() }];
const ORIGIN = "https://app.example.test";
const AO = ["http://localhost:5197", "https://other.example.test"];

// The plugin's injection as it was before SU-4, kept here to compare against.
function oldInject(source, origins) {
  const re = /^export const DEFAULT_ALLOWED_ORIGINS = \[\];$/gm;
  if ((source.match(re)?.length ?? 0) !== 1) throw new Error("not once");
  return source.replace(re, () => `export const DEFAULT_ALLOWED_ORIGINS = [${origins.map((o) => JSON.stringify(o)).join(", ")}];`);
}

describe("injectBridge", () => {
  it("P1 origins only: byte-identical to the old injection; the update lines stay empty", () => {
    for (const o of [[], AO]) {
      expect(injectBridge(SOURCE, { allowedOrigins: o })).toBe(oldInject(SOURCE, o));
    }
    expect(injectBridge(SOURCE)).toBe(SOURCE);
  });

  it("P2 an update origin and two keys: exactly those lines; importing gives the same values", async () => {
    const out = injectBridge(SOURCE, { allowedOrigins: AO, updateOrigin: ORIGIN, updateKeys: KEYS });
    expect(out.split("\n")).toContain(`export const UPDATE_ORIGIN = ${JSON.stringify(ORIGIN)};`);
    expect(out.split("\n")).toContain(`export const UPDATE_KEYS = ${JSON.stringify(KEYS)};`);
    // nothing else changed
    expect(out.replace(/^export const UPDATE_ORIGIN = .*;$/m, 'export const UPDATE_ORIGIN = "";').replace(/^export const UPDATE_KEYS = .*;$/m, "export const UPDATE_KEYS = [];")).toBe(oldInject(SOURCE, AO));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inject-"));
    try {
      const f = path.join(dir, "b.mjs");
      fs.writeFileSync(f, out);
      const m = await import(pathToFileURL(f).href);
      expect(m.UPDATE_ORIGIN).toBe(ORIGIN);
      expect(m.UPDATE_KEYS).toEqual(KEYS);
      expect(m.DEFAULT_ALLOWED_ORIGINS).toEqual(AO);
    } finally {
      await removeTestDir(dir);
    }
  });

  it("P3 bad inputs throw", () => {
    const bad = (o) => () => injectBridge(SOURCE, o);
    expect(bad({ updateOrigin: "http://app.example.test", updateKeys: KEYS })).toThrow(/https origin/);
    expect(bad({ updateOrigin: "https://app.example.test/app", updateKeys: KEYS })).toThrow(/no path/);
    expect(bad({ updateOrigin: "https://app.example.test/", updateKeys: KEYS })).toThrow(/https origin/);
    expect(bad({ updateOrigin: "not a url" })).toThrow(/https origin/);
    expect(bad({ updateKeys: [{ id: "bu1", key: crypto.randomBytes(31).toString("base64") }] })).toThrow(/32 raw bytes/);
    expect(bad({ updateKeys: [{ id: "bu1", key: "!!!" }] })).toThrow(/32 raw bytes/);
    expect(bad({ updateKeys: [KEYS[0], { id: "bu1", key: KEYS[1].key }] })).toThrow(/twice/);
    for (const id of ['bu"1', "BU1", "", "a".repeat(33), "bu 1", "bu1\n"]) expect(bad({ updateKeys: [{ id, key: KEYS[0].key }] })).toThrow(/id/);
  });

  it("P3b a target line missing or present twice throws", () => {
    const noKeys = SOURCE.replace(/^export const UPDATE_KEYS = \[\];$/m, "// gone");
    expect(() => injectBridge(noKeys, {})).toThrow(/UPDATE_KEYS = \[\];" exactly once in the bridge file, found 0/);
    const noOrigin = SOURCE.replace(/^export const UPDATE_ORIGIN = "";$/m, "// gone");
    expect(() => injectBridge(noOrigin, {})).toThrow(/UPDATE_ORIGIN = "";" exactly once in the bridge file, found 0/);
    const twice = SOURCE + '\nexport const UPDATE_ORIGIN = "";\n';
    expect(() => injectBridge(twice, {})).toThrow(/found 2/);
  });

  it("the plugin refuses a bad option at start-up, and emits the injected file", () => {
    expect(() => claudeCodeBridgeFile({ updateOrigin: "http://x.example.test" })).toThrow(/https origin/);
    expect(() => claudeCodeBridgeFile({ updateKeys: [{ id: "A", key: KEYS[0].key }] })).toThrow(/id/);
    const plugin = claudeCodeBridgeFile({ defaultAllowedOrigins: AO, updateOrigin: ORIGIN, updateKeys: KEYS });
    let emitted;
    plugin.generateBundle.call({ emitFile: (f) => (emitted = f) });
    expect(Buffer.from(emitted.source).toString("utf8")).toBe(injectBridge(SOURCE, { allowedOrigins: AO, updateOrigin: ORIGIN, updateKeys: KEYS }));
  });
});

describe("start through a symlinked folder", () => {
  it("S1 node <symlinked dir>/bridge.mjs --selftest still runs main", async () => {
    const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-link-")));
    try {
      const real = path.join(dir, "real");
      fs.mkdirSync(real);
      fs.copyFileSync(path.join(path.dirname(BRIDGE_SOURCE), "bridge.mjs"), path.join(real, "bridge.mjs"));
      fs.symlinkSync(real, path.join(dir, "link"));
      fs.symlinkSync(path.join(real, "bridge.mjs"), path.join(dir, "file-link.mjs"));
      for (const entry of [path.join(dir, "link", "bridge.mjs"), path.join(dir, "file-link.mjs")]) {
        const r = spawnSync(process.execPath, [entry, "--selftest"], { encoding: "utf8", timeout: 15000 });
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/^build \d+\.\d+\.\d+\n$/);
      }
    } finally {
      await removeTestDir(dir);
    }
  });
});
