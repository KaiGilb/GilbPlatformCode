import { describe, expect, it } from "vitest";
import { isRawFilesPath } from "./rawFilesPath";

describe("isRawFilesPath", () => {
  it("catches a root file path and an absolute one, with the shipped case split", () => {
    expect(isRawFilesPath("/files/abc")).toBe(true);
    expect(isRawFilesPath("  /files/abc  ")).toBe(true);
    expect(isRawFilesPath("https://files.example.test/files/abc")).toBe(true);
    expect(isRawFilesPath("HTTPS://files.example.test/files/abc?x=1")).toBe(true);
    expect(isRawFilesPath("/Files/abc")).toBe(false);
    expect(isRawFilesPath("/files")).toBe(false);
    expect(isRawFilesPath("https://files.example.test/files")).toBe(false);
    expect(isRawFilesPath("https://files.example.test/other/files/abc")).toBe(false);
    expect(isRawFilesPath("https://files.example.test/base/connect/profile-photo")).toBe(false);
  });
});
