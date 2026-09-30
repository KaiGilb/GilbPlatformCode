import { describe, expect, it } from "vitest";
import { isAbsoluteHttpUrl, seatPublicAddress } from "./seatAddress";

const base = "https://example.test/base";

describe("seatPublicAddress", () => {
  it("uses the vault address when no alias was declared", () => {
    expect(seatPublicAddress({ shortWebId: "", vaultId: base })).toBe(base);
  });

  it("keeps a declared /i and does not replace it with /base", () => {
    expect(seatPublicAddress({ shortWebId: "https://example.test/i", vaultId: base })).toBe(
      "https://example.test/i",
    );
  });

  it("uses aliasUri only when shortWebId is missing, not when it is an empty string", () => {
    expect(seatPublicAddress({ aliasUri: base, vaultId: "https://other.test/base" })).toBe(base);
    expect(seatPublicAddress({ shortWebId: "", aliasUri: "https://alias.test/base", vaultId: base })).toBe(base);
  });

  it("ignores a bare token and does not invent /i", () => {
    expect(seatPublicAddress({ shortWebId: "w", vaultId: base })).toBe(base);
    expect(seatPublicAddress({ shortWebId: "", vaultId: base })).not.toMatch(/\/i$/);
  });

  it("returns undefined when neither source is a URL", () => {
    expect(seatPublicAddress(null)).toBeUndefined();
    expect(seatPublicAddress({ shortWebId: "", vaultId: "" })).toBeUndefined();
    expect(seatPublicAddress({ shortWebId: "w" })).toBeUndefined();
  });
});

describe("isAbsoluteHttpUrl", () => {
  it("accepts http(s) after trim and rejects a bare token", () => {
    expect(isAbsoluteHttpUrl("  https://example.test/base")).toBe(true);
    expect(isAbsoluteHttpUrl("HTTP://example.test/base")).toBe(true);
    expect(isAbsoluteHttpUrl("w")).toBe(false);
    expect(isAbsoluteHttpUrl("")).toBe(false);
    expect(isAbsoluteHttpUrl(null)).toBe(false);
    expect(isAbsoluteHttpUrl("https://")).toBe(true);
  });
});
