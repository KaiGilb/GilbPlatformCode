import { describe, expect, it } from "vitest";
import { commandMatches } from "./commandMatch";

const cmd = { label: "Open notes", keywords: ["nodes", "grid"] };

describe("commandMatches", () => {
  it("keeps every command when the query is empty", () => {
    expect(commandMatches(cmd, "")).toBe(true);
    expect(commandMatches({ label: "", keywords: [] }, "")).toBe(true);
  });

  it("does not trim, and matches label or any keyword", () => {
    expect(commandMatches(cmd, "NOTE")).toBe(true);
    expect(commandMatches(cmd, "grid")).toBe(true);
    expect(commandMatches(cmd, "vault")).toBe(false);
    expect(commandMatches(cmd, "note ")).toBe(false);
    expect(commandMatches({ label: "Save", keywords: ["nodes"] }, " ")).toBe(false);
  });

  it("does not require every word, and does not trim keywords", () => {
    expect(commandMatches({ label: "Save", keywords: ["write file"] }, "file")).toBe(true);
    expect(commandMatches({ label: "Save", keywords: [" file"] }, "file")).toBe(true);
    expect(commandMatches({ label: "I", keywords: [] }, "i")).toBe(true);
  });
});
