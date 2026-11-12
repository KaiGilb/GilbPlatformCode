// @vitest-environment node
import { describe, expect, it } from "vitest";
import { codexInstallCommands } from "../connector/vite-plugin.mjs";

// Built from parts so this file does not write a host name as one literal.
const URL_ = "https://" + "app.example.test" + "/app/gilb-connector.mjs";
const LINES = ["startup_timeout_sec = 90", "tool_timeout_sec = 2000"];

describe("codexInstallCommands", () => {
  it("posix, no name", () => {
    expect(codexInstallCommands(URL_, { shell: "posix" })).toEqual({
      download: `curl -fsSL '${URL_}' -o ~/.gilb-connector.mjs`,
      add: "codex mcp add GilbPlatform -- node ~/.gilb-connector.mjs --hop-cli codex",
      start: "codex",
      configFile: "~/.codex/config.toml",
      configLines: LINES,
      server: "GilbPlatform",
    });
  });

  it("posix, with a name", () => {
    expect(codexInstallCommands(URL_, { shell: "posix", name: "kai" })).toEqual({
      download: `curl -fsSL '${URL_}' -o ~/.gilb-connector.mjs`,
      add: "codex mcp add gilb-kai -- node ~/.gilb-connector.mjs --hop-cli codex --profile kai",
      start: "codex",
      configFile: "~/.codex/config.toml",
      configLines: LINES,
      server: "gilb-kai",
    });
  });

  it("powershell, no name", () => {
    expect(codexInstallCommands(URL_, { shell: "powershell" })).toEqual({
      download: `Invoke-WebRequest -UseBasicParsing -Uri '${URL_}' -OutFile "$HOME\\.gilb-connector.mjs"`,
      add: 'codex mcp add GilbPlatform -- node "$HOME\\.gilb-connector.mjs" --hop-cli codex',
      start: "codex",
      configFile: "$HOME\\.codex\\config.toml",
      configLines: LINES,
      server: "GilbPlatform",
    });
  });

  it("powershell, with a name", () => {
    expect(codexInstallCommands(URL_, { shell: "powershell", name: "kai" })).toEqual({
      download: `Invoke-WebRequest -UseBasicParsing -Uri '${URL_}' -OutFile "$HOME\\.gilb-connector.mjs"`,
      add: 'codex mcp add gilb-kai -- node "$HOME\\.gilb-connector.mjs" --hop-cli codex --profile kai',
      start: "codex",
      configFile: "$HOME\\.codex\\config.toml",
      configLines: LINES,
      server: "gilb-kai",
    });
  });

  it("accepts the edges of the name rule", () => {
    expect(codexInstallCommands(URL_, { shell: "posix", name: "a" }).server).toBe("gilb-a");
    expect(codexInstallCommands(URL_, { shell: "posix", name: "0-" + "x".repeat(18) }).server).toBe("gilb-0-" + "x".repeat(18));
  });

  it("refuses a bad name", () => {
    for (const name of ["", "default", "Kai", "-kai", "a b", "x".repeat(21), "kai_1", "kai'"]) {
      expect(() => codexInstallCommands(URL_, { shell: "posix", name }), name).toThrow("Name must be 1 to 20 lower-case letters, digits or dashes.");
    }
  });

  it("refuses an address with a quote, in both shells", () => {
    for (const shell of ["posix", "powershell"]) {
      expect(() => codexInstallCommands(URL_ + "?x='y", { shell })).toThrow("The connector address must not contain a quote.");
    }
  });
});
