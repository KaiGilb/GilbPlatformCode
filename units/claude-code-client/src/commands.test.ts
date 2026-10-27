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
