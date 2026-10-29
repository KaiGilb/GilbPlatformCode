// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BRIDGE_FILE_NAME, BRIDGE_SOURCE, claudeCodeBridgeFile, injectDefaultAllowedOrigins } from "../bridge/vite-plugin.mjs";

const SOURCE = fs.readFileSync(BRIDGE_SOURCE, "utf8");
const LINE = "export const DEFAULT_ALLOWED_ORIGINS = [];";
// The two origins GilbApp's bridge v0.2.0 listed. Built from parts so no host name is written out in this unit.
const V020_ORIGINS = ["http://localhost:5197", "https://" + "gilb" + ".com"];
const V020_LINE = 'export const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5197", "https://' + "gilb" + '.com"];';

describe("claudeCodeBridgeFile", () => {
  it("emits the bridge, byte for byte, into the build", () => {
    const emitFile = vi.fn();
    claudeCodeBridgeFile().generateBundle.call({ emitFile });
    expect(emitFile).toHaveBeenCalledTimes(1);
    const arg = emitFile.mock.calls[0][0];
    expect(arg).toMatchObject({ type: "asset", fileName: "claude-code-bridge.mjs" });
    expect(Buffer.from(arg.source).equals(fs.readFileSync(BRIDGE_SOURCE))).toBe(true);
    expect(BRIDGE_FILE_NAME).toBe("claude-code-bridge.mjs");
  });

  it("serves it in dev under Vite's base", () => {
    for (const [base, mount] of [["/app/", "/app/claude-code-bridge.mjs"], ["/", "/claude-code-bridge.mjs"], ["/app", "/app/claude-code-bridge.mjs"], ["./", "/claude-code-bridge.mjs"]]) {
      const plugin = claudeCodeBridgeFile();
      plugin.configResolved({ base });
      const use = vi.fn();
      plugin.configureServer({ middlewares: { use } });
      expect(use.mock.calls[0][0], base).toBe(mount);
      const res = { setHeader: vi.fn(), end: vi.fn() };
      use.mock.calls[0][1]({}, res);
      expect(res.setHeader).toHaveBeenCalledWith("content-type", "text/javascript; charset=utf-8");
      expect(res.end.mock.calls[0][0].equals(fs.readFileSync(BRIDGE_SOURCE))).toBe(true);
    }
  });
});

describe("injecting the default origins", () => {
  it("the built file carries the empty default line exactly once", () => {
    expect(SOURCE.split("\n").filter((l) => l === LINE)).toHaveLength(1);
  });

  it("replaces that one line and nothing else", () => {
    const out = injectDefaultAllowedOrigins(SOURCE, ["https://a.example.test", "http://localhost:5197"]);
    expect(out).toContain('export const DEFAULT_ALLOWED_ORIGINS = ["https://a.example.test", "http://localhost:5197"];');
    expect(out.replace(/^export const DEFAULT_ALLOWED_ORIGINS = .*;$/m, LINE)).toBe(SOURCE);
  });

  it("with no origins the file is unchanged", () => {
    expect(injectDefaultAllowedOrigins(SOURCE)).toBe(SOURCE);
    expect(injectDefaultAllowedOrigins(SOURCE, [])).toBe(SOURCE);
  });

  it("the line for the two origins of v0.2.0 is byte for byte the line v0.2.0 had", () => {
    const out = injectDefaultAllowedOrigins(SOURCE, V020_ORIGINS);
    expect(out.split("\n").filter((l) => l.startsWith("export const DEFAULT_ALLOWED_ORIGINS"))).toEqual([V020_LINE]);
  });

  it("throws when the line is not found", () => {
    expect(() => injectDefaultAllowedOrigins("const x = 1;\n", ["https://a.example.test"])).toThrow(/found 0/);
    expect(() => injectDefaultAllowedOrigins(SOURCE.replace(LINE, "export const DEFAULT_ALLOWED_ORIGINS = ['x'];"), [])).toThrow(/found 0/);
  });

  it("throws when the line is found more than once", () => {
    expect(() => injectDefaultAllowedOrigins(`${LINE}\n${LINE}\n`, [])).toThrow(/found 2/);
  });

  it("throws on an origin the bridge's own normalizeOrigin refuses", () => {
    for (const bad of ["*", "", "http://app.example.test", "https://a.example.test/path", "https://A.example.test", "https://a.example.test/", "app.example.test", "https://a.example.test:443"]) {
      expect(() => injectDefaultAllowedOrigins(SOURCE, [bad]), bad).toThrow();
      expect(() => claudeCodeBridgeFile({ defaultAllowedOrigins: [bad] }), bad).toThrow();
    }
  });

  it("emits and serves the injected file", () => {
    const origins = ["https://a.example.test", "http://localhost:5197"];
    const expected = Buffer.from(injectDefaultAllowedOrigins(SOURCE, origins));
    const plugin = claudeCodeBridgeFile({ defaultAllowedOrigins: origins });
    const emitFile = vi.fn();
    plugin.generateBundle.call({ emitFile });
    expect(Buffer.from(emitFile.mock.calls[0][0].source).equals(expected)).toBe(true);
    plugin.configResolved({ base: "/" });
    const use = vi.fn();
    plugin.configureServer({ middlewares: { use } });
    const res = { setHeader: vi.fn(), end: vi.fn() };
    use.mock.calls[0][1]({}, res);
    expect(res.end.mock.calls[0][0].equals(expected)).toBe(true);
  });

  it("a copy with the injection loads with exactly the given list as its default, and an added origin joins it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-inject-"));
    try {
      for (const origins of [[], ["https://a.example.test"], ["http://localhost:5197", "https://b.example.test"]]) {
        const copy = path.join(dir, "bridge.mjs");
        fs.writeFileSync(copy, injectDefaultAllowedOrigins(SOURCE, origins));
        const run = (extra) =>
          JSON.parse(
            execFileSync(
              process.execPath,
              ["--input-type=module", "-e", "const m = await import(process.env.BRIDGE_COPY); console.log(JSON.stringify([m.DEFAULT_ALLOWED_ORIGINS, m.loadAllowedOrigins(JSON.parse(process.env.BRIDGE_EXTRA))]));"],
              // Path via env, not argv[1]: with argv[1] equal to the module's own path (Linux tmpdir) the bridge would run main() on import.
              { cwd: os.tmpdir(), encoding: "utf8", env: { ...process.env, GILB_BRIDGE_ALLOW_ORIGINS: "", BRIDGE_COPY: copy, BRIDGE_EXTRA: JSON.stringify(extra) } },
            ).trim(),
          );
        expect(run([])).toEqual([origins, origins]);
        expect(run(["https://c.example.test"])).toEqual([origins, [...origins, "https://c.example.test"]]);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

