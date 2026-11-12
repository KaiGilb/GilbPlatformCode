// @vitest-environment node
import { describe, expect, it } from "vitest";
import os from "node:os";
import { aiDisplayName } from "../connector/gilb-connector.mjs";

const host = os.hostname().trim() || "this computer";

describe("the default AI display name follows the runner", () => {
  it("is Claude Code on <host> by default and for claude", () => {
    expect(aiDisplayName(undefined)).toBe(`Claude Code on ${host}`);
    expect(aiDisplayName(undefined, "claude")).toBe(`Claude Code on ${host}`);
  });
  it("is Codex on <host> for codex", () => {
    expect(aiDisplayName(undefined, "codex")).toBe(`Codex on ${host}`);
    expect(aiDisplayName("  ", "codex")).toBe(`Codex on ${host}`);
  });
  it("keeps an explicit name for both", () => {
    expect(aiDisplayName(" Desk AI ", "codex")).toBe("Desk AI");
    expect(aiDisplayName("Desk AI", "claude")).toBe("Desk AI");
  });
});
