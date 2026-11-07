// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BRIDGE_FILE_NAME as PLUGIN_NAME } from "@kaigilb/gilbplatformcode-claude-code-bridge/vite";
import { BRIDGE_FILE_NAME, bridgeCommands } from "./commands";

describe("commands and the Vite plugin agree", () => {
  it("serve and download the same file name", () => {
    expect(PLUGIN_NAME).toBe(BRIDGE_FILE_NAME);
    expect(bridgeCommands({ origin: "https://a.example" }).start).toContain(`/${PLUGIN_NAME} `);
  });
});

describe("Windows PowerShell commands", () => {
  const o = { origin: "https://app.example.com", basePath: "/app/" };
  const url = "https://app.example.com/app/claude-code-bridge.mjs";
  it("are the exact strings (curl.exe, ; if ($?), $HOME)", () => {
    const w = bridgeCommands(o).windows;
    expect(w.start).toBe(`curl.exe -fsSL ${url} -o "$HOME\\.gilb-claude-code-bridge.mjs"; if ($?) { node "$HOME\\.gilb-claude-code-bridge.mjs" }`);
    expect(w.install).toBe(`curl.exe -fsSL ${url} -o "$HOME\\.gilb-claude-code-bridge.mjs"; if ($?) { node "$HOME\\.gilb-claude-code-bridge.mjs" --install }`);
    expect(w.code).toBe('node "$HOME\\.gilb-claude-code-bridge.mjs" --code');
  });
  it("carry --allow-origin unquoted, and never use && or the curl alias", () => {
    const w = bridgeCommands({ ...o, allowOrigin: "https://app.example.com/x" }).windows;
    expect(w.start).toMatch(/node "\$HOME\\\.gilb-claude-code-bridge\.mjs" --allow-origin https:\/\/app\.example\.com \}$/);
    expect(w.install).toMatch(/ --install --allow-origin https:\/\/app\.example\.com \}$/);
    for (const c of Object.values(w)) {
      expect(c).not.toContain("&&");
      expect(c).not.toMatch(/(^|\s)curl\s/);
    }
  });
  it("leave the Mac lines unchanged", () => {
    const m = bridgeCommands({ ...o, allowOrigin: "https://app.example.com" });
    expect(m.start).toBe(`curl -fsSL ${url} -o ~/.gilb-claude-code-bridge.mjs && node ~/.gilb-claude-code-bridge.mjs --allow-origin https://app.example.com`);
    expect(m.install).toBe(`curl -fsSL ${url} -o ~/.gilb-claude-code-bridge.mjs && node ~/.gilb-claude-code-bridge.mjs --install --allow-origin https://app.example.com`);
    expect(m.code).toBe("node ~/.gilb-claude-code-bridge.mjs --code");
  });
});
