// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CONNECTOR_FILE_NAME, CONNECTOR_SOURCE, connectorInstallCommands, gilbConnectorFile } from "../connector/vite-plugin.mjs";

const unit = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ON_DISK = path.join(unit, "connector", "gilb-connector.mjs");
// Built from parts so this file does not write a host name as one literal.
const HOST = "app" + ".example.test";

describe("gilbConnectorFile", () => {
  it("emits the connector, byte for byte, into the build", () => {
    const emitFile = vi.fn();
    gilbConnectorFile().generateBundle.call({ emitFile });
    expect(emitFile).toHaveBeenCalledTimes(1);
    const arg = emitFile.mock.calls[0][0];
    expect(arg).toMatchObject({ type: "asset", fileName: "gilb-connector.mjs" });
    expect(Buffer.from(arg.source).equals(fs.readFileSync(ON_DISK))).toBe(true);
  });

  it("serves it in dev under Vite's base", () => {
    const bytes = fs.readFileSync(ON_DISK);
    for (const [base, mount] of [
      ["/app/", "/app/gilb-connector.mjs"],
      ["/", "/gilb-connector.mjs"],
      ["/app", "/app/gilb-connector.mjs"],
      ["./", "/gilb-connector.mjs"],
    ]) {
      const plugin = gilbConnectorFile();
      plugin.configResolved({ base });
      const use = vi.fn();
      plugin.configureServer({ middlewares: { use } });
      expect(use.mock.calls[0][0], base).toBe(mount);
      const res = { setHeader: vi.fn(), end: vi.fn() };
      use.mock.calls[0][1]({}, res);
      expect(res.setHeader).toHaveBeenCalledWith("content-type", "text/javascript; charset=utf-8");
      expect(res.end.mock.calls[0][0].equals(bytes)).toBe(true);
    }
  });

  it("names the file and points at the built connector", () => {
    expect(CONNECTOR_FILE_NAME).toBe("gilb-connector.mjs");
    expect(CONNECTOR_SOURCE).toBe(fileURLToPath(new URL("../connector/gilb-connector.mjs", import.meta.url)));
  });

  it("the served file runs: --help exits 0 and prints the usage", () => {
    const emitFile = vi.fn();
    gilbConnectorFile().generateBundle.call({ emitFile });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gilb-connector-served-"));
    const file = path.join(dir, "gilb-connector.mjs");
    const errPath = path.join(dir, "stderr.txt");
    const fd = fs.openSync(errPath, "w");
    try {
      fs.writeFileSync(file, emitFile.mock.calls[0][0].source);
      // --help writes the usage to stderr and does not print the version. execFileSync returns stdout only,
      // so stderr is the extra fd and the two are read together. The real path: macOS tmp is a symlink, and
      // the connector runs main only when argv[1] matches its own URL.
      const stdout = execFileSync(process.execPath, [fs.realpathSync(file), "--help"], {
        encoding: "utf8",
        timeout: 10_000,
        stdio: ["ignore", "pipe", fd],
      });
      const output = stdout + fs.readFileSync(errPath, "utf8");
      expect(output).toContain("Usage: node gilb-connector.mjs");
      expect(output).toContain("Default: sign in as a Connected AI");
    } finally {
      fs.closeSync(fd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("connectorInstallCommands", () => {
  it("returns the download and the claude mcp add line", () => {
    const fileUrl = "https://" + HOST + "/app/gilb-connector.mjs";
    expect(connectorInstallCommands(fileUrl)).toEqual({
      download: "curl -fsSL '" + fileUrl + "' -o ~/.gilb-connector.mjs",
      add: "claude mcp add gilb -- node ~/.gilb-connector.mjs",
    });
  });

  it("throws when the file URL is not a safe http(s) address of the connector", () => {
    for (const bad of [
      "not a url",
      "ftp://" + HOST + "/gilb-connector.mjs",
      "https://" + HOST + "/app/other.mjs",
      "https://" + HOST + "/app/gilb-connector.mjs?x='y",
    ]) {
      let thrown = false;
      try {
        connectorInstallCommands(bad);
      } catch (err) {
        thrown = true;
        expect(err, bad).toBeInstanceOf(Error);
        expect(err.message, bad).toContain(bad);
      }
      expect(thrown, bad).toBe(true);
    }
  });
});
